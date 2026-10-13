from typing import Tuple, List, Dict, Any, Optional
from PIL import ImageDraw, Image, ImageFont

from app.schemas.placement import PlacementRegion
from app.schemas.typography import (
    TypographyConfig,
    TypographyLayoutResult,
    LayoutBounds,
    TextAlignment,
    SizingMode,
)
from app.services.font_service import FontService


class TypographyService:
    """
    Authoritative text layout and intelligent auto-fit engine.
    Calculates exact text bounds, visual ascenders/descenders,
    stable baseline positioning, and deterministic font sizing via binary search.
    Supports batch-consistent typography (smart_consistent) where participants share
    a common target font size without enlarging short names excessively.
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
        # In SMART_CONSISTENT mode, preferred_font_size acts as the shared target upper bound.
        # Short names are NOT enlarged beyond preferred_font_size.
        # Outlier long names scale down towards min_font_size.
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
        Determines the optimal shared batch target font size across participants.

        Optimization Principles for Batch Consistency:
        1. Professional certificates look best when the vast majority of recipients
           share the EXACT SAME font size.
        2. Short names must NOT be blown up to absurdly large sizes simply because they have fewer letters.
        3. Only exceptional, unusually long names are scaled down individually to avoid truncation.
        4. Strategy:
           - Measure the maximum fitting font size for every participant name within the box.
           - Identify a shared target size S_target such that:
             a) If 100% of participants can fit at a handsome readable size (>= 36px), use min_fitted_all.
             b) If a few outlier names are very long, pick a target size that covers the 75th-90th percentile
                (or median if needed), bounded between standard readable sizes (e.g. 40px - 56px).
             c) Clamped to [config.min_font_size, upper_bound_cap].
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

        # Box height constraint cap: text height shouldn't exceed ~90% of safe height
        max_limit = min(upper_bound_cap, max(config.min_font_size + 4, int(safe_h * 0.90)))

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
        p75_fitted = fitting_sizes[int(len(fitting_sizes) * 0.75)]
        median_fitted = fitting_sizes[len(fitting_sizes) // 2]

        # Count how many fit at candidate sizes
        # If min_fitted_all is already comfortably readable (>= 42px), everyone can use min_fitted_all!
        if min_fitted_all >= 42:
            optimal = min_fitted_all
        else:
            # If there are outliers pulling min_fitted_all down,
            # choose a handsome target font size (around 46-52px, bounded by p75 / median)
            # so the majority of names share that prominent target size,
            # while the few outlier names are automatically scaled down.
            target_candidate = min(p75_fitted, 52)
            # But ensure target candidate is at least 42px or median
            optimal = max(target_candidate, min(median_fitted, 44))

        # Final safety bounds
        optimal = max(config.min_font_size, min(optimal, max_limit))
        return optimal

