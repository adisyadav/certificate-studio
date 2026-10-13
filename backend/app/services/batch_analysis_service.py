import hashlib
import json
from typing import List, Optional
from app.schemas.job import ParticipantRecord, TemplateMetadata
from app.schemas.placement import PlacementRegion
from app.schemas.typography import (
    TypographyConfig,
    BatchTypographyReport,
    ParticipantTypographyAnalysis,
)
from app.services.font_service import FontService
from app.services.typography_service import TypographyService


class BatchAnalysisService:
    @classmethod
    def compute_fingerprint(
        cls,
        template_meta: TemplateMetadata,
        placement: PlacementRegion,
        config: TypographyConfig,
        participant_count: int,
    ) -> str:
        """
        Creates a deterministic hash representing the exact certificate configuration.
        Any change to template dimensions, placement box, font family, font size,
        color, alignment, clearance margins, or participant count alters this fingerprint.
        """
        data = {
            "template_w": template_meta.width,
            "template_h": template_meta.height,
            "placement_x": round(placement.x, 4),
            "placement_y": round(placement.y, 4),
            "placement_w": round(placement.width, 4),
            "placement_h": round(placement.height, 4),
            "font_id": config.font_id,
            "preferred_size": config.preferred_font_size,
            "min_size": config.min_font_size,
            "text_color": config.text_color.lower(),
            "alignment": config.alignment.value,
            "vertical_clearance": round(config.vertical_clearance_percent if config.vertical_clearance_percent is not None else 0.08, 4),
            "horizontal_clearance": round(config.horizontal_clearance_percent if config.horizontal_clearance_percent is not None else 0.04, 4),
            "participant_count": participant_count,
        }
        encoded = json.dumps(data, sort_keys=True).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()[:16]

    @classmethod
    def analyze_participants(
        cls,
        participants: List[ParticipantRecord],
        template_meta: TemplateMetadata,
        placement: PlacementRegion,
        config: TypographyConfig,
    ) -> BatchTypographyReport:
        target_width = template_meta.width
        target_height = template_meta.height

        valid_participants = [p for p in participants if p.is_valid and p.name.strip()]
        fingerprint = cls.compute_fingerprint(
            template_meta=template_meta,
            placement=placement,
            config=config,
            participant_count=len(valid_participants),
        )

        if not valid_participants:
            return BatchTypographyReport(
                total_analyzed=0,
                all_fit=True,
                overflow_count=0,
                reduction_count=0,
                unsupported_glyph_count=0,
                insufficient_clearance_count=0,
                warnings=["No valid participants to analyze."],
                config_fingerprint=fingerprint,
            )

        analyses: List[ParticipantTypographyAnalysis] = []
        overflow_count = 0
        reduction_count = 0
        unsupported_glyph_count = 0
        insufficient_clearance_count = 0

        shortest_name: Optional[str] = None
        longest_name_by_chars: Optional[str] = None
        widest_name: Optional[str] = None
        widest_visual_width: float = 0.0

        # Load reference font at preferred size to measure natural visual width
        preferred_font = FontService.load_pillow_font(
            config.font_id, config.preferred_font_size
        )

        for p in valid_participants:
            name = p.name.strip()

            # Character length checks
            if shortest_name is None or len(name) < len(shortest_name):
                shortest_name = name
            if longest_name_by_chars is None or len(name) > len(longest_name_by_chars):
                longest_name_by_chars = name

            # Measure natural visual ink width at preferred size
            bbox = TypographyService.measure_text_bounds(name, preferred_font)
            natural_width = float(bbox[2] - bbox[0])

            if natural_width > widest_visual_width:
                widest_visual_width = natural_width
                widest_name = name

            # Glyph coverage check
            glyph_res = FontService.check_glyphs(config.font_id, name)
            has_unsupported = not glyph_res.supported
            if has_unsupported:
                unsupported_glyph_count += 1

            # Font fitting check
            layout = TypographyService.calculate_layout(
                text=name,
                config=config,
                placement=placement,
                target_width=target_width,
                target_height=target_height,
            )

            is_overflow = not layout.fits
            if is_overflow:
                overflow_count += 1

            requires_reduction = layout.fitted_at_reduced_size
            if requires_reduction and not is_overflow:
                reduction_count += 1

            # Insufficient safe-area clearance at preferred size
            insufficient_clearance = is_overflow or requires_reduction
            if insufficient_clearance:
                insufficient_clearance_count += 1

            # Human-readable status label distinguishing containment states
            if is_overflow:
                status_label = "Cannot fit above minimum size"
            elif has_unsupported:
                status_label = "Unsupported glyphs"
            elif requires_reduction:
                status_label = "Fits after automatic reduction"
            else:
                status_label = "Fits at preferred size"

            analyses.append(
                ParticipantTypographyAnalysis(
                    row_number=p.row_number,
                    name=name,
                    fitted_font_size=layout.font_size,
                    is_overflowing=is_overflow,
                    requires_reduction=requires_reduction,
                    insufficient_clearance=insufficient_clearance,
                    status_label=status_label,
                    has_unsupported_glyphs=has_unsupported,
                    unsupported_glyphs=glyph_res.unsupported_chars,
                    visual_width=natural_width,
                )
            )

        warnings: List[str] = []
        if overflow_count > 0:
            warnings.append(
                f"{overflow_count} participant name(s) cannot fit within the designated placement area even at minimum font size ({config.min_font_size}px)."
            )
        if reduction_count > 0:
            warnings.append(
                f"{reduction_count} participant name(s) required automatic font scaling to fit safely within safe printing clearance."
            )
        if unsupported_glyph_count > 0:
            warnings.append(
                f"{unsupported_glyph_count} participant name(s) contain characters unsupported by '{config.font_id}'."
            )

        return BatchTypographyReport(
            total_analyzed=len(valid_participants),
            all_fit=(overflow_count == 0 and unsupported_glyph_count == 0),
            overflow_count=overflow_count,
            reduction_count=reduction_count,
            unsupported_glyph_count=unsupported_glyph_count,
            insufficient_clearance_count=insufficient_clearance_count,
            shortest_name=shortest_name,
            longest_name_by_chars=longest_name_by_chars,
            widest_name=widest_name,
            widest_visual_width=round(widest_visual_width, 1),
            participants_analysis=analyses,
            warnings=warnings,
            config_fingerprint=fingerprint,
        )

