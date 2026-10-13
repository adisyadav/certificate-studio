import io
from pathlib import Path
from typing import Tuple
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
    def get_template_image(
        cls,
        original_template_path: Path,
        is_pdf: bool = False,
    ) -> Image.Image:
        """
        Produces a high-resolution PIL Image copy of the template.
        Never modifies the original file on disk.
        """
        if not original_template_path.exists():
            raise RenderingError("Original certificate template file not found.")

        if is_pdf:
            doc = fitz.open(str(original_template_path))
            try:
                page = doc.load_page(0)
                # 150 DPI matrix gives crisp high-res canvas rendering
                pix = page.get_pixmap(matrix=fitz.Matrix(150 / 72.0, 150 / 72.0))
                return Image.open(io.BytesIO(pix.tobytes(output="png"))).convert("RGBA")
            finally:
                doc.close()
        else:
            with Image.open(original_template_path) as img:
                return img.convert("RGBA")

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
        Rendering Pipeline:
        Original Blank Template -> Text Layout & Auto-Fit -> Personalized Rendering.
        Returns (PNG bytes of personalized certificate, TypographyLayoutResult).
        """
        is_pdf = template_meta.format.upper() == "PDF"
        base_img = cls.get_template_image(
            original_template_path=original_template_path,
            is_pdf=is_pdf,
        )

        width, height = base_img.size

        # Authoritative layout in template coordinate space
        layout = TypographyService.calculate_layout(
            text=participant_name,
            config=typography_config,
            placement=placement,
            target_width=width,
            target_height=height,
        )

        # Render personalized recipient text
        font = FontService.load_pillow_font(typography_config.font_id, layout.font_size)
        draw = ImageDraw.Draw(base_img)
        draw.text(
            (layout.draw_position["x"], layout.draw_position["y"]),
            participant_name,
            font=font,
            fill=typography_config.text_color,
        )

        output_stream = io.BytesIO()
        base_img.convert("RGB").save(output_stream, format="PNG", optimize=True)
        return output_stream.getvalue(), layout
