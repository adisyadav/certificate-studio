from typing import Tuple, List, Dict, Any, Optional
from PIL import ImageDraw, Image, ImageFont

from app.schemas.placement import PlacementRegion
from app.schemas.typography import (
    TypographyConfig,
    TypographyLayoutResult,
    LayoutBounds,
    TextAlignment,
)
from app.services.font_service import FontService


class TypographyService:
    """
    Authoritative text layout and intelligent auto-fit engine.
    Calculates exact text bounds, visual ascenders/descenders,
    stable baseline positioning, and deterministic font sizing via binary search.
    """

    @classmethod
    def calculate_layout(
        cls,
        text: str,
        config: TypographyConfig,
        placement: PlacementRegion,
        target_width: int,
        target_height: int,
    ) -> TypographyLayoutResult:
        warnings: List[str] = []
        name_clean = text.strip()
        if not name_clean:
            name_clean = "Participant Name"

        # Check font glyph coverage
        glyph_check = FontService.check_glyphs(config.font_id, name_clean)
        if not glyph_check.supported:
            chars_str = ", ".join(f"'{c}'" for c in glyph_check.unsupported_chars)
            warnings.append(
                f"Font '{config.font_id}' does not support characters: {chars_str}. Text may render missing glyph boxes."
            )

        # 1. Convert normalized placement into target coordinate box
        region_x = placement.x * target_width
        region_y = placement.y * target_height
        region_w = placement.width * target_width
        region_h = placement.height * target_height

        # 2. Apply safe padding (4% horizontal, 4% vertical margin)
        pad_x = region_w * 0.04
        pad_y = region_h * 0.04
        safe_w = max(10.0, region_w - 2 * pad_x)
        safe_h = max(10.0, region_h - 2 * pad_y)

        # 3. Deterministic binary search for the largest font size that fits safe_w and safe_h
        fitted_size, fits = cls._fit_font_size(
            text=name_clean,
            font_id=config.font_id,
            min_size=config.min_font_size,
            max_size=config.preferred_font_size,
            max_width=safe_w,
            max_height=safe_h,
        )

        requires_reduction = fitted_size < config.preferred_font_size
        if not fits:
            warnings.append(
                f"Text '{name_clean}' cannot fit within the designated area at the minimum readable font size ({config.min_font_size}px). Consider enlarging the area."
            )
        elif requires_reduction:
            warnings.append(
                f"Font size auto-reduced from {config.preferred_font_size}px to {fitted_size}px to fit perfectly without clipping."
            )

        # 4. Measure visual ink bounding box and typographic metrics at fitted size
        font = FontService.load_pillow_font(config.font_id, size=fitted_size)
        bbox = cls.measure_text_bounds(name_clean, font)
        ascent, descent = font.getmetrics()

        # bbox is (left, top, right, bottom) relative to origin (0,0)
        ink_width = bbox[2] - bbox[0]
        ink_height = bbox[3] - bbox[1]

        # 5. Position text inside region:
        # Horizontal alignment based on bounding box
        if config.alignment == TextAlignment.LEFT:
            ink_x = region_x + pad_x
        elif config.alignment == TextAlignment.RIGHT:
            ink_x = region_x + region_w - pad_x - ink_width
        else:  # CENTER
            ink_x = region_x + (region_w - ink_width) / 2.0

        # Stable typographic vertical centering:
        # Center the font's typographic body in the box so baseline remains stable across participants
        box_center_y = region_y + region_h / 2.0
        baseline_y = box_center_y + (ascent - descent) / 2.0
        draw_y = baseline_y - ascent

        # Check if actual ink exceeds vertical bounds at this baseline; if so, clamp to safe area
        actual_ink_top = draw_y + bbox[1]
        actual_ink_bottom = draw_y + bbox[3]

        if actual_ink_top < region_y + pad_y:
            draw_y += (region_y + pad_y) - actual_ink_top
        elif actual_ink_bottom > region_y + region_h - pad_y:
            draw_y -= actual_ink_bottom - (region_y + region_h - pad_y)

        draw_x = ink_x - bbox[0]
        ink_y = draw_y + bbox[1]

        return TypographyLayoutResult(
            font_size=fitted_size,
            fits=fits,
            fitted_at_reduced_size=requires_reduction,
            text_bounds=LayoutBounds(
                x=round(ink_x, 2),
                y=round(ink_y, 2),
                width=round(ink_width, 2),
                height=round(ink_height, 2),
            ),
            draw_position={"x": round(draw_x, 2), "y": round(draw_y, 2)},
            warnings=warnings,
        )

    @classmethod
    def measure_text_bounds(
        cls, text: str, font: ImageFont.FreeTypeFont
    ) -> Tuple[int, int, int, int]:
        """
        Measure actual visual bounding box accounting for ascenders, descenders, and decorative glyphs.
        Returns (left, top, right, bottom).
        """
        dummy_img = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
        draw = ImageDraw.Draw(dummy_img)
        bbox = draw.textbbox((0, 0), text, font=font)
        return bbox

    @classmethod
    def _fit_font_size(
        cls,
        text: str,
        font_id: str,
        min_size: int,
        max_size: int,
        max_width: float,
        max_height: float,
    ) -> Tuple[int, bool]:
        """
        Binary search for the maximum integer font size in [min_size, max_size]
        whose measured text bounding box <= (max_width, max_height).
        """
        # Check if max_size fits
        max_font = FontService.load_pillow_font(font_id, max_size)
        bbox_max = cls.measure_text_bounds(text, max_font)
        w_max = bbox_max[2] - bbox_max[0]
        h_max = bbox_max[3] - bbox_max[1]
        if w_max <= max_width and h_max <= max_height:
            return max_size, True

        # Check if min_size fits
        min_font = FontService.load_pillow_font(font_id, min_size)
        bbox_min = cls.measure_text_bounds(text, min_font)
        w_min = bbox_min[2] - bbox_min[0]
        h_min = bbox_min[3] - bbox_min[1]
        if w_min > max_width or h_min > max_height:
            return min_size, False

        # Binary search
        low = min_size
        high = max_size
        best_size = min_size

        while low <= high:
            mid = (low + high) // 2
            font = FontService.load_pillow_font(font_id, mid)
            bbox = cls.measure_text_bounds(text, font)
            w = bbox[2] - bbox[0]
            h = bbox[3] - bbox[1]

            if w <= max_width and h <= max_height:
                best_size = mid
                low = mid + 1
            else:
                high = mid - 1

        return best_size, True
