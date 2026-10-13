import io
from pathlib import Path
from typing import Tuple, Optional
from PIL import Image, ImageDraw
import fitz  # PyMuPDF

from app.schemas.job import TemplateMetadata
from app.schemas.placement import PlacementRegion
from app.schemas.typography import (
    TypographyConfig,
    TypographyLayoutResult,
)
from app.services.font_service import FontService
from app.services.typography_service import TypographyService


class RenderingError(Exception):
    pass


class RenderingService:
    @classmethod
    def render_certificate_preview(
        cls,
        original_template_path: Path,
        template_meta: TemplateMetadata,
        placement: PlacementRegion,
        typography_config: TypographyConfig,
        participant_name: str,
    ) -> Tuple[bytes, TypographyLayoutResult]:
        """
        Renders the participant's name onto a copy of the template.
        Never modifies the stored original.
        Returns (PNG bytes of rendered preview, TypographyLayoutResult).
        """
        if not original_template_path.exists():
            raise RenderingError("Original certificate template file not found.")

        is_pdf = template_meta.format.upper() == "PDF"

        if is_pdf:
            return cls._render_pdf_preview(
                original_template_path=original_template_path,
                placement=placement,
                config=typography_config,
                text=participant_name,
            )
        else:
            return cls._render_raster_preview(
                original_template_path=original_template_path,
                placement=placement,
                config=typography_config,
                text=participant_name,
            )

    @classmethod
    def _render_raster_preview(
        cls,
        original_template_path: Path,
        placement: PlacementRegion,
        config: TypographyConfig,
        text: str,
    ) -> Tuple[bytes, TypographyLayoutResult]:
        try:
            # Open template image copy
            with Image.open(original_template_path) as orig_img:
                img = orig_img.convert("RGBA")
        except Exception as e:
            raise RenderingError(f"Failed to open raster template: {str(e)}")

        width, height = img.size

        # Authoritative layout in template pixel coordinates
        layout = TypographyService.calculate_layout(
            text=text,
            config=config,
            placement=placement,
            target_width=width,
            target_height=height,
        )

        font = FontService.load_pillow_font(config.font_id, layout.font_size)

        # Draw text onto RGBA overlay for crisp antialiasing
        draw = ImageDraw.Draw(img)
        draw.text(
            (layout.draw_position["x"], layout.draw_position["y"]),
            text,
            font=font,
            fill=config.text_color,
        )

        # Output browser PNG
        output_stream = io.BytesIO()
        rgb_img = img.convert("RGB")
        rgb_img.save(output_stream, format="PNG", optimize=True)
        return output_stream.getvalue(), layout

    @classmethod
    def _render_pdf_preview(
        cls,
        original_template_path: Path,
        placement: PlacementRegion,
        config: TypographyConfig,
        text: str,
    ) -> Tuple[bytes, TypographyLayoutResult]:
        try:
            doc = fitz.open(str(original_template_path))
        except Exception as e:
            raise RenderingError(f"Failed to open PDF template: {str(e)}")

        try:
            page = doc.load_page(0)
            rect = page.rect
            pdf_w = rect.width
            pdf_h = rect.height

            # Preview rendering DPI: 150 DPI gives zoom 150/72 ≈ 2.0833
            zoom_factor = 150.0 / 72.0
            matrix = fitz.Matrix(zoom_factor, zoom_factor)
            pix = page.get_pixmap(matrix=matrix, alpha=False)

            # Render onto high-res raster preview of PDF
            img = Image.open(io.BytesIO(pix.tobytes(output="png"))).convert("RGBA")
            preview_w, preview_h = img.size

            layout = TypographyService.calculate_layout(
                text=text,
                config=config,
                placement=placement,
                target_width=preview_w,
                target_height=preview_h,
            )

            font = FontService.load_pillow_font(config.font_id, layout.font_size)
            draw = ImageDraw.Draw(img)
            draw.text(
                (layout.draw_position["x"], layout.draw_position["y"]),
                text,
                font=font,
                fill=config.text_color,
            )

            output_stream = io.BytesIO()
            img.convert("RGB").save(output_stream, format="PNG", optimize=True)
            return output_stream.getvalue(), layout
        finally:
            doc.close()
