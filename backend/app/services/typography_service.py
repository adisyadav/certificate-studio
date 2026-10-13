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

        # 2. Apply configurable clearance padding (default 4% horizontal, 8% vertical margin)
        pad_x = region_w * (config.horizontal_clearance_percent if config.horizontal_clearance_percent is not None else 0.04)
        pad_y = region_h * (config.vertical_clearance_percent if config.vertical_clearance_percent is not None else 0.08)
        safe_left = region_x + pad_x
        safe_right = region_x + region_w - pad_x
        safe_top = region_y + pad_y
        safe_bottom = region_y + region_h - pad_y
        safe_w = max(10.0, safe_right - safe_left)
        safe_h = max(10.0, safe_bottom - safe_top)

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
                f"Text '{name_clean}' cannot fit within the designated safe area at the minimum readable font size ({config.min_font_size}px). Consider enlarging the area."
            )
        elif requires_reduction:
            warnings.append(
                f"Font size auto-reduced from {config.preferred_font_size}px to {fitted_size}px to fit safely within margins without clipping."
            )

        # 4. Measure visual ink bounding box and typographic metrics at fitted size
        font = FontService.load_pillow_font(config.font_id, size=fitted_size)
        bbox = cls.measure_text_bounds(name_clean, font)
        ascent, descent = font.getmetrics()

        # bbox is (left, top, right, bottom) relative to origin (0,0)
        # Note: bbox[0] may be negative (negative glyph bearing, e.g. -11px in Allura)
        ink_width = bbox[2] - bbox[0]
        ink_height = bbox[3] - bbox[1]

        # 5. Position text inside safe region:
        # Horizontal alignment based on bounding box
        if config.alignment == TextAlignment.LEFT:
            ink_x = safe_left
        elif config.alignment == TextAlignment.RIGHT:
            ink_x = safe_right - ink_width
        else:  # CENTER
            ink_x = safe_left + (safe_w - ink_width) / 2.0

        # draw_x accounts for negative glyph bearing so ink starts precisely at ink_x
        draw_x = ink_x - bbox[0]

        # Stable typographic vertical centering:
        # Center the font's typographic body in the safe box so baseline remains stable across participants
        box_center_y = safe_top + safe_h / 2.0
        baseline_y = box_center_y + (ascent - descent) / 2.0
        draw_y = baseline_y - ascent

        # Check if actual ink exceeds vertical bounds at this baseline; if so, clamp to safe area
        actual_ink_top = draw_y + bbox[1]
        actual_ink_bottom = draw_y + bbox[3]

        if actual_ink_bottom > safe_bottom:
            shift = actual_ink_bottom - safe_bottom
            draw_y -= shift
            baseline_y -= shift
        elif actual_ink_top < safe_top:
            shift = safe_top - actual_ink_top
            draw_y += shift
            baseline_y += shift

        ink_y = draw_y + bbox[1]

        safe_bounds = LayoutBounds(
            x=round(safe_left, 2),
            y=round(safe_top, 2),
            width=round(safe_w, 2),
            height=round(safe_h, 2),
        )

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
            safe_bounds=safe_bounds,
            baseline_y=round(baseline_y, 2),
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

    @classmethod
    def optimize_typography_for_batch(
        cls,
        names: List[str],
        config: TypographyConfig,
        placement: PlacementRegion,
        target_width: int,
        target_height: int,
        upper_bound_cap: int = 76,
    ) -> int:
        """
        Determines the optimal preferred_font_size across all participants.

        Optimization Policy:
        1. Box boundary calculation with safe padding (configurable clearance).
        2. Measures the maximum font size that fits for each valid participant.
        3. If names is empty, returns config.preferred_font_size.
        4. Calculates max_possible_size for the box (upper bounded by box height or upper_bound_cap).
        5. Computes the maximum font size each name can support up to upper_bound_cap.
        6. Strategy:
           - We want short/standard names to be prominently readable and look great.
           - We do not want an extreme outlier (e.g. 80 character name) to force all short names
             down to tiny 18px text if the engine can automatically downscale outlier names individually!
           - However, for standard distribution of names (e.g. up to 90th percentile), we find a preferred
             font size that provides generous visual impact while minimizing how many names require reduction.
           - Specifically:
             - Check the size that fits 100% of participants. If that size >= 32px, that fits everyone cleanly without reduction!
             - If the 100% size is very small (e.g. < 28px) because of a single ultra-long name, select the 75th-85th percentile
               optimal size (clamped to at least 36px and at most upper_bound_cap) so standard names look beautiful,
               while individual long names safely scale down via the per-participant layout engine.
             - In all cases, the optimal size is clamped between config.min_font_size and upper_bound_cap.
        """
        valid_names = [n.strip() for n in names if n.strip()]
        if not valid_names:
            return config.preferred_font_size

        region_w = placement.width * target_width
        region_h = placement.height * target_height
        pad_x = region_w * (config.horizontal_clearance_percent if config.horizontal_clearance_percent is not None else 0.04)
        pad_y = region_h * (config.vertical_clearance_percent if config.vertical_clearance_percent is not None else 0.08)
        safe_w = max(10.0, region_w - 2 * pad_x)
        safe_h = max(10.0, region_h - 2 * pad_y)

        # Theoretical maximum height limit
        max_limit = min(upper_bound_cap, max(config.min_font_size + 4, int(safe_h * 0.95)))

        # Find max fitting size for each name
        fitting_sizes: List[int] = []
        for name in valid_names:
            fitted, _ = cls._fit_font_size(
                text=name,
                font_id=config.font_id,
                min_size=config.min_font_size,
                max_size=max_limit,
                max_width=safe_w,
                max_height=safe_h,
            )
            fitting_sizes.append(fitted)

        fitting_sizes.sort()

        min_fitted_all = fitting_sizes[0]
        median_fitted = fitting_sizes[len(fitting_sizes) // 2]
        p80_fitted = fitting_sizes[int(len(fitting_sizes) * 0.8)]

        if min_fitted_all >= 34:
            # Everyone fits comfortably at min_fitted_all!
            optimal = min_fitted_all
        elif min_fitted_all >= 28:
            # Almost everyone fits; choose between min_fitted_all and p80
            optimal = min(min_fitted_all, 48)
        else:
            # There are long outliers. Don't shrink normal names to < 28px.
            # Pick a handsome preferred size (median or p80 capped around 48-56px),
            # and let the per-participant engine scale down outliers.
            optimal = min(max(median_fitted, 36), 56)

        # Final safety bounds
        optimal = max(config.min_font_size, min(optimal, max_limit))
        return optimal

