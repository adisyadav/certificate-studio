import io
from pathlib import Path
from typing import Tuple, Optional
from PIL import Image, ImageDraw
import fitz  # PyMuPDF

from app.schemas.job import TemplateMetadata
from app.schemas.placement import PlacementRegion
from app.schemas.typography import TypographyConfig, TypographyLayoutResult
from app.services.font_service import FontService
from app.services.typography_service import TypographyService


class PDFGenerationError(Exception):
    pass


class PDFService:
    """
    Authoritative single-certificate PDF generation service.
    Directly consumes the TypographyService.calculate_layout output to guarantee
    100% visual consistency with the on-screen preview.
    """

    @classmethod
    def generate_certificate_pdf(
        cls,
        original_template_path: Path,
        template_meta: TemplateMetadata,
        placement: PlacementRegion,
        typography_config: TypographyConfig,
        participant_name: str,
        output_pdf_path: Path,
    ) -> TypographyLayoutResult:
        """
        Generates a verified single-page PDF certificate for a participant.
        Preserves original template quality, page dimensions, and aspect ratio.
        Never modifies the original template file on disk.
        """
        if not original_template_path.exists():
            raise PDFGenerationError(f"Original template not found at {original_template_path}")

        is_pdf = template_meta.format.upper() == "PDF"

        if is_pdf:
            return cls._generate_from_pdf_template(
                original_template_path=original_template_path,
                template_meta=template_meta,
                placement=placement,
                typography_config=typography_config,
                participant_name=participant_name,
                output_pdf_path=output_pdf_path,
            )
        else:
            return cls._generate_from_raster_template(
                original_template_path=original_template_path,
                template_meta=template_meta,
                placement=placement,
                typography_config=typography_config,
                participant_name=participant_name,
                output_pdf_path=output_pdf_path,
            )

    @classmethod
    def _generate_from_raster_template(
        cls,
        original_template_path: Path,
        template_meta: TemplateMetadata,
        placement: PlacementRegion,
        typography_config: TypographyConfig,
        participant_name: str,
        output_pdf_path: Path,
    ) -> TypographyLayoutResult:
        """
        For PNG/JPG templates:
        1. Load original full-resolution image.
        2. Calculate authoritative layout in original pixel space.
        3. Draw text with Pillow using loaded font at fitted font size.
        4. Convert directly to single-page PDF preserving exact dimensions and DPI.
        """
        try:
            with Image.open(original_template_path) as orig_img:
                img = orig_img.convert("RGBA")
        except Exception as e:
            raise PDFGenerationError(f"Failed to open original raster template: {e}")

        img_width, img_height = img.size

        # Authoritative layout calculated in original template pixel dimensions
        layout = TypographyService.calculate_layout(
            text=participant_name,
            config=typography_config,
            placement=placement,
            target_width=img_width,
            target_height=img_height,
        )

        # Draw recipient text
        font = FontService.load_pillow_font(typography_config.font_id, layout.font_size)
        draw = ImageDraw.Draw(img)
        draw.text(
            (layout.draw_position["x"], layout.draw_position["y"]),
            participant_name,
            font=font,
            fill=typography_config.text_color,
        )

        # Flatten RGBA to RGB for standard PDF compliance
        rgb_img = Image.new("RGB", img.size, (255, 255, 255))
        rgb_img.paste(img, mask=img.split()[3])  # alpha mask

        # Save to single-page PDF with 72 or 150 DPI
        # Pillow save to PDF sets PDF mediabox points based on DPI: (width / dpi * 72, height / dpi * 72)
        # Using 72 DPI preserves 1 point = 1 pixel for exact layout inspection.
        # But to keep physical certificate size standard (~10-12 inches) and high resolution,
        # we compute page size matching standard PDF points: 150 DPI standard.
        dpi = 150.0
        pdf_bytes_io = io.BytesIO()
        rgb_img.save(pdf_bytes_io, format="PDF", resolution=dpi)
        pdf_bytes = pdf_bytes_io.getvalue()

        output_pdf_path.parent.mkdir(parents=True, exist_ok=True)
        output_pdf_path.write_bytes(pdf_bytes)

        # Self-verify the written PDF with PyMuPDF
        cls.verify_single_page_pdf(output_pdf_path)

        return layout

    @classmethod
    def _generate_from_pdf_template(
        cls,
        original_template_path: Path,
        template_meta: TemplateMetadata,
        placement: PlacementRegion,
        typography_config: TypographyConfig,
        participant_name: str,
        output_pdf_path: Path,
    ) -> TypographyLayoutResult:
        """
        For PDF templates:
        1. Open original PDF template with PyMuPDF.
        2. Read exact page dimensions in points (rect.width, rect.height).
        3. Convert points to high-res rendering coordinate system matching preview (150 DPI / 72.0).
        4. Calculate authoritative layout at that resolution.
        5. Create a high-res transparent PNG layer of the recipient's name text.
        6. Overlay the transparent text image onto the original vector page at the exact coordinates.
        This preserves the underlying vector graphics and page text of the original PDF,
        while rendering the exact cursive typography consistently with the preview.
        """
        try:
            doc = fitz.open(str(original_template_path))
        except Exception as e:
            raise PDFGenerationError(f"Failed to open original PDF template: {e}")

        try:
            if doc.page_count != 1:
                raise PDFGenerationError(f"Template PDF must have exactly 1 page, found {doc.page_count}")

            page = doc[0]
            page_rect = page.rect  # width and height in points
            pdf_w_pts = page_rect.width
            pdf_h_pts = page_rect.height

            # High-res scale factor matching RenderingService (150 DPI / 72 pt = 2.0833x)
            scale = 150.0 / 72.0
            raster_w = int(round(pdf_w_pts * scale))
            raster_h = int(round(pdf_h_pts * scale))

            # Calculate authoritative layout in high-res raster coordinate space
            layout = TypographyService.calculate_layout(
                text=participant_name,
                config=typography_config,
                placement=placement,
                target_width=raster_w,
                target_height=raster_h,
            )

            # Draw transparent overlay with exact text
            text_layer = Image.new("RGBA", (raster_w, raster_h), (0, 0, 0, 0))
            font = FontService.load_pillow_font(typography_config.font_id, layout.font_size)
            draw = ImageDraw.Draw(text_layer)
            draw.text(
                (layout.draw_position["x"], layout.draw_position["y"]),
                participant_name,
                font=font,
                fill=typography_config.text_color,
            )

            # Insert overlay onto PDF page without modifying underlying vector elements
            overlay_bytes = io.BytesIO()
            text_layer.save(overlay_bytes, format="PNG")
            overlay_bytes.seek(0)

            # Overlay over the full page rect (0, 0, pdf_w_pts, pdf_h_pts)
            page.insert_image(
                page_rect,
                stream=overlay_bytes.getvalue(),
                overlay=True,
                keep_proportion=True,
            )

            output_pdf_path.parent.mkdir(parents=True, exist_ok=True)
            doc.save(str(output_pdf_path), garbage=4, deflate=True)
        finally:
            doc.close()

        # Self-verify the written PDF with PyMuPDF
        cls.verify_single_page_pdf(output_pdf_path)

        return layout

    @classmethod
    def verify_single_page_pdf(cls, pdf_path: Path) -> fitz.Rect:
        """
        Strict validation for every generated PDF:
        1. File exists and is > 0 bytes.
        2. Can be opened by PyMuPDF.
        3. Contains exactly 1 page.
        4. Has positive width and height.
        Returns the verified page rect.
        """
        if not pdf_path.exists():
            raise PDFGenerationError(f"PDF file does not exist: {pdf_path}")
        if pdf_path.stat().st_size == 0:
            raise PDFGenerationError(f"PDF file is empty (0 bytes): {pdf_path}")

        try:
            doc = fitz.open(str(pdf_path))
        except Exception as e:
            raise PDFGenerationError(f"Generated PDF is corrupt or invalid: {e}")

        try:
            if doc.page_count != 1:
                raise PDFGenerationError(f"Generated PDF must have exactly 1 page, found {doc.page_count}")
            page = doc[0]
            rect = page.rect
            if rect.width <= 0 or rect.height <= 0:
                raise PDFGenerationError(f"Generated PDF has invalid page dimensions: {rect}")
            return rect
        finally:
            doc.close()
