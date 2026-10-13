import io
from pathlib import Path
from typing import Tuple, Optional
from PIL import Image, ImageDraw
import fitz  # PyMuPDF

from app.schemas.job import TemplateMetadata
from app.schemas.placement import PlacementRegion
from app.schemas.cleanup import CleanupConfig, CleanupMode
from app.schemas.typography import (
    TypographyConfig,
    TypographyLayoutResult,
)
from app.services.font_service import FontService
from app.services.typography_service import TypographyService
from app.services.placeholder_removal_service import PlaceholderRemovalService


class RenderingError(Exception):
    pass


class RenderingService:
    @classmethod
    def get_cleaned_template_image(
        cls,
        original_template_path: Path,
        cleanup_config: CleanupConfig,
        is_pdf: bool = False,
    ) -> Image.Image:
        """
        Produces a cleaned PIL Image copy based on cleanup_config.
        Never modifies the original on disk.
        """
        img, _ = PlaceholderRemovalService.clean_template(
            original_template_path=original_template_path,
            config=cleanup_config,
            is_pdf=is_pdf,
        )
        return img

    @classmethod
    def render_cleaned_preview(
        cls,
        original_template_path: Path,
        template_meta: TemplateMetadata,
        cleanup_config: CleanupConfig,
    ) -> bytes:
        """
        Generates and returns PNG bytes of the cleaned certificate background.
        """
        is_pdf = template_meta.format.upper() == "PDF"
        cleaned_img = cls.get_cleaned_template_image(
            original_template_path=original_template_path,
            cleanup_config=cleanup_config,
            is_pdf=is_pdf,
        )
        output_stream = io.BytesIO()
        cleaned_img.convert("RGB").save(output_stream, format="PNG", optimize=True)
        return output_stream.getvalue()

    @classmethod
    def render_certificate_preview(
        cls,
        original_template_path: Path,
        template_meta: TemplateMetadata,
        placement: PlacementRegion,
        cleanup_config: CleanupConfig,
        typography_config: TypographyConfig,
        participant_name: str,
    ) -> Tuple[bytes, TypographyLayoutResult]:
        """
        Unified Rendering Pipeline:
        Original Template -> Cleanup -> Text Layout -> Personalized Rendering
        Returns (PNG bytes of personalized certificate, TypographyLayoutResult).
        """
        if not original_template_path.exists():
            raise RenderingError("Original certificate template file not found.")

        is_pdf = template_meta.format.upper() == "PDF"

        # 1. Produce cleaned template image copy
        base_img = cls.get_cleaned_template_image(
            original_template_path=original_template_path,
            cleanup_config=cleanup_config,
            is_pdf=is_pdf,
        )

        width, height = base_img.size

        # 2. Authoritative layout in template coordinate space
        layout = TypographyService.calculate_layout(
            text=participant_name,
            config=typography_config,
            placement=placement,
            target_width=width,
            target_height=height,
        )

        # 3. Personalized Replacement Text Rendering
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
