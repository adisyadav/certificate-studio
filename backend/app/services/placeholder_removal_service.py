import io
import cv2
import numpy as np
from PIL import Image, ImageDraw
import fitz  # PyMuPDF
from pathlib import Path
from typing import Tuple, Optional

from app.schemas.cleanup import CleanupConfig, CleanupMode
from app.schemas.placement import PlacementRegion


class PlaceholderRemovalError(Exception):
    pass


class PlaceholderRemovalService:
    """
    Non-destructive placeholder removal service.
    Supports solid background fill, raster OpenCV inpainting, and PDF vector text redaction.
    """

    @classmethod
    def clean_template(
        cls,
        original_template_path: Path,
        config: CleanupConfig,
        is_pdf: bool = False,
    ) -> Tuple[Image.Image, Optional[str]]:
        """
        Processes a copy of the original template using the specified cleanup mode.
        Returns (PIL Image of the cleaned template, optional warning message).
        """
        if not original_template_path.exists():
            raise PlaceholderRemovalError("Original template file does not exist.")

        if config.mode == CleanupMode.NONE or not config.region:
            # Mode None: Return untouched copy as PIL Image
            if is_pdf:
                doc = fitz.open(str(original_template_path))
                try:
                    page = doc.load_page(0)
                    pix = page.get_pixmap(matrix=fitz.Matrix(150 / 72.0, 150 / 72.0))
                    return Image.open(io.BytesIO(pix.tobytes(output="png"))).convert("RGBA"), None
                finally:
                    doc.close()
            else:
                return Image.open(original_template_path).convert("RGBA"), None

        region = config.region

        if is_pdf and config.mode == CleanupMode.PDF_REDACT:
            return cls._clean_pdf_text(original_template_path, region)
        elif is_pdf:
            # PDF template using raster cleanup: render to high-res image and clean raster
            doc = fitz.open(str(original_template_path))
            try:
                page = doc.load_page(0)
                pix = page.get_pixmap(matrix=fitz.Matrix(150 / 72.0, 150 / 72.0))
                img = Image.open(io.BytesIO(pix.tobytes(output="png"))).convert("RGBA")
                return cls._clean_raster_image(img, config)
            finally:
                doc.close()
        else:
            with Image.open(original_template_path) as orig:
                img = orig.convert("RGBA")
            return cls._clean_raster_image(img, config)

    @classmethod
    def _clean_raster_image(
        cls,
        img: Image.Image,
        config: CleanupConfig,
    ) -> Tuple[Image.Image, Optional[str]]:
        width, height = img.size
        region = config.region
        if not region:
            return img, None

        # Convert normalized bounds to pixel coordinates
        rx = int(region.x * width)
        ry = int(region.y * height)
        rw = int(region.width * width)
        rh = int(region.height * height)

        # Clamp box inside image bounds
        x1 = max(0, min(width - 1, rx))
        y1 = max(0, min(height - 1, ry))
        x2 = max(x1 + 1, min(width, rx + rw))
        y2 = max(y1 + 1, min(height, ry + rh))

        warning: Optional[str] = None

        if config.mode == CleanupMode.SOLID:
            fill_color = cls._determine_solid_color(img, x1, y1, x2, y2, config)
            draw = ImageDraw.Draw(img)
            draw.rectangle([x1, y1, x2, y2], fill=fill_color)
            return img, None

        elif config.mode == CleanupMode.INPAINT:
            # Convert PIL RGBA to OpenCV BGR
            rgb_img = img.convert("RGB")
            cv_img = np.array(rgb_img)[:, :, ::-1].copy()

            # Create inpaint mask: 255 for the cleanup region
            mask = np.zeros((height, width), dtype=np.uint8)
            mask[y1:y2, x1:x2] = 255

            # Apply OpenCV inpainting (Telea algorithm)
            radius = config.inpaint_radius
            inpainted = cv2.inpaint(cv_img, mask, inpaintRadius=radius, flags=cv2.INPAINT_TELEA)

            # Convert back to PIL Image
            cleaned_rgb = Image.fromarray(inpainted[:, :, ::-1])
            cleaned_rgba = cleaned_rgb.convert("RGBA")
            # Preserve original alpha channel if present
            if img.mode == "RGBA":
                r, g, b, a = img.split()
                cr, cg, cb, _ = cleaned_rgba.split()
                return Image.merge("RGBA", (cr, cg, cb, a)), warning

            return cleaned_rgba, warning

        return img, None

    @classmethod
    def _clean_pdf_text(
        cls,
        pdf_path: Path,
        region: PlacementRegion,
    ) -> Tuple[Image.Image, Optional[str]]:
        doc = fitz.open(str(pdf_path))
        warning: Optional[str] = None
        try:
            page = doc.load_page(0)
            page_rect = page.rect
            pw = page_rect.width
            ph = page_rect.height

            # Target rect in PDF points
            target_rect = fitz.Rect(
                region.x * pw,
                region.y * ph,
                (region.x + region.width) * pw,
                (region.y + region.height) * ph,
            )

            # Detect text instances inside target region
            found_text = False
            words = page.get_text("words")
            for w in words:
                word_rect = fitz.Rect(w[0], w[1], w[2], w[3])
                if target_rect.intersects(word_rect):
                    found_text = True
                    page.add_redact_annot(word_rect, fill=False)

            if found_text:
                page.apply_redactions()
            else:
                # If no digital text was found, use white fill over the redact box
                warning = "No digital vector text was detected in the cleanup area. Applied visual redaction."
                page.add_redact_annot(target_rect, fill=(1, 1, 1))
                page.apply_redactions()

            pix = page.get_pixmap(matrix=fitz.Matrix(150 / 72.0, 150 / 72.0))
            cleaned_img = Image.open(io.BytesIO(pix.tobytes(output="png"))).convert("RGBA")
            return cleaned_img, warning
        finally:
            doc.close()

    @classmethod
    def _determine_solid_color(
        cls,
        img: Image.Image,
        x1: int,
        y1: int,
        x2: int,
        y2: int,
        config: CleanupConfig,
    ) -> Tuple[int, int, int, int]:
        if config.background_color and not config.auto_sample_color:
            hex_str = config.background_color.lstrip("#")
            if len(hex_str) == 3:
                hex_str = "".join(c * 2 for c in hex_str)
            r = int(hex_str[0:2], 16)
            g = int(hex_str[2:4], 16)
            b = int(hex_str[4:6], 16)
            return (r, g, b, 255)

        # Estimate background color by sampling border pixels surrounding cleanup box
        border_pixels = []
        width, height = img.size

        # Top & bottom perimeter
        for x in range(x1, x2):
            if y1 > 0:
                border_pixels.append(img.getpixel((x, y1 - 1)))
            if y2 < height:
                border_pixels.append(img.getpixel((x, y2)))

        # Left & right perimeter
        for y in range(y1, y2):
            if x1 > 0:
                border_pixels.append(img.getpixel((x1 - 1, y)))
            if x2 < width:
                border_pixels.append(img.getpixel((x2, y)))

        if not border_pixels:
            return (255, 255, 255, 255)

        # Calculate median/average RGB
        avg_r = int(np.median([p[0] for p in border_pixels]))
        avg_g = int(np.median([p[1] for p in border_pixels]))
        avg_b = int(np.median([p[2] for p in border_pixels]))
        return (avg_r, avg_g, avg_b, 255)
