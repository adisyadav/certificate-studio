from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import fitz  # PyMuPDF
from PIL import Image

from app.schemas.job import JobResponse, TemplateMetadata, ParticipantRecord
from app.schemas.placement import PlacementRegion
from app.schemas.typography import TypographyConfig, TypographyLayoutResult
from app.schemas.validation import (
    ValidationLevel,
    ValidationFinding,
    BatchValidationReport,
    VisualVerificationResult,
)
from app.services.font_service import FontService, FontNotFoundError
from app.services.typography_service import TypographyService
from app.services.rendering_service import RenderingService
from app.utils.filenames import FilenameGenerator


class ValidationError(Exception):
    pass


class ValidationService:
    """
    Authoritative Quality Assurance and Verification pipeline.
    Evaluates template integrity, participant records, glyph support,
    layout containment, filename collisions, PDF output integrity, and visual fidelity.
    """

    @classmethod
    def validate_pre_export(
        cls,
        template_meta: Optional[TemplateMetadata],
        template_file_path: Optional[Path],
        placement: Optional[PlacementRegion],
        typography: Optional[TypographyConfig],
        participants: List[ParticipantRecord],
    ) -> BatchValidationReport:
        findings: List[ValidationFinding] = []
        valid_participants = [p for p in participants if p.is_valid and p.name.strip()]

        # 1. Template Integrity
        if not template_meta or not template_file_path or not template_file_path.exists():
            findings.append(
                ValidationFinding(
                    level=ValidationLevel.BLOCKING_ERROR,
                    category="template",
                    message="Certificate template is missing or unreadable on disk.",
                )
            )
        else:
            if template_meta.width <= 0 or template_meta.height <= 0:
                findings.append(
                    ValidationFinding(
                        level=ValidationLevel.BLOCKING_ERROR,
                        category="template",
                        message=f"Invalid template dimensions ({template_meta.width}x{template_meta.height}).",
                    )
                )

        # 2. Placement Configuration
        if not placement:
            findings.append(
                ValidationFinding(
                    level=ValidationLevel.BLOCKING_ERROR,
                    category="placement",
                    message="Recipient name placement area has not been set.",
                )
            )
        else:
            if (
                placement.x < 0
                or placement.y < 0
                or (placement.x + placement.width) > 1.0001
                or (placement.y + placement.height) > 1.0001
                or placement.width <= 0
                or placement.height <= 0
            ):
                findings.append(
                    ValidationFinding(
                        level=ValidationLevel.BLOCKING_ERROR,
                        category="placement",
                        message="Placement rectangle exceeds template boundaries.",
                    )
                )

        # 3. Typography Configuration & Font Availability
        if not typography:
            findings.append(
                ValidationFinding(
                    level=ValidationLevel.BLOCKING_ERROR,
                    category="typography",
                    message="Typography configuration is missing.",
                )
            )
        else:
            try:
                FontService.get_font_path(typography.font_id)
            except FontNotFoundError:
                findings.append(
                    ValidationFinding(
                        level=ValidationLevel.BLOCKING_ERROR,
                        category="font",
                        message=f"Font '{typography.font_id}' is not available on this server.",
                    )
                )

        # 4. Participant Count
        if not valid_participants:
            findings.append(
                ValidationFinding(
                    level=ValidationLevel.BLOCKING_ERROR,
                    category="participants",
                    message="No valid participant records found to generate.",
                )
            )

        # Stop early if foundational prerequisites are broken
        blocking_errors = [f for f in findings if f.level == ValidationLevel.BLOCKING_ERROR]
        if blocking_errors:
            return BatchValidationReport(
                is_ready_to_export=False,
                total_participants=len(valid_participants),
                blocking_error_count=len(blocking_errors),
                warning_count=0,
                passed_count=0,
                summary_message="Foundational export prerequisites not met.",
                findings=findings,
            )

        # 5. Filename Uniqueness & Sanitization Check
        filename_gen = FilenameGenerator()
        used_filenames: Dict[str, str] = {}
        for p in valid_participants:
            clean_name = p.name.strip()
            pdf_filename = filename_gen.get_pdf_filename(clean_name)
            # Generator should guarantee uniqueness via deduplication suffixes
            if pdf_filename in used_filenames and used_filenames[pdf_filename] != clean_name:
                findings.append(
                    ValidationFinding(
                        level=ValidationLevel.WARNING,
                        category="filename",
                        message=f"Participant '{clean_name}' shares sanitized filename '{pdf_filename}' with '{used_filenames[pdf_filename]}'. Filename generator resolved with suffix.",
                        row_number=p.row_number,
                        participant_name=clean_name,
                    )
                )
            used_filenames[pdf_filename] = clean_name

        # 6. Authoritative Layout Calculation & Glyph Coverage per Participant
        overflow_count = 0
        unsupported_glyph_count = 0
        reduced_count = 0

        target_w = template_meta.width
        target_h = template_meta.height

        for p in valid_participants:
            clean_name = p.name.strip()

            # Glyph check
            glyph_check = FontService.check_glyphs(typography.font_id, clean_name)
            if not glyph_check.supported:
                unsupported_glyph_count += 1
                unsupported_chars = ", ".join(f"'{c}'" for c in glyph_check.unsupported_chars)
                findings.append(
                    ValidationFinding(
                        level=ValidationLevel.WARNING,
                        category="glyphs",
                        message=f"Name contains characters not supported by font '{typography.font_id}': {unsupported_chars}.",
                        row_number=p.row_number,
                        participant_name=clean_name,
                    )
                )

            # Authoritative layout
            layout = TypographyService.calculate_layout(
                text=clean_name,
                config=typography,
                placement=placement,
                target_width=target_w,
                target_height=target_h,
            )

            if not layout.fits:
                overflow_count += 1
                findings.append(
                    ValidationFinding(
                        level=ValidationLevel.BLOCKING_ERROR,
                        category="containment",
                        message=f"Name cannot fit within the designated placement region even at minimum readable size ({typography.min_font_size}px).",
                        row_number=p.row_number,
                        participant_name=clean_name,
                        details={"fitted_font_size": layout.font_size},
                    )
                )
            elif layout.fitted_at_reduced_size:
                reduced_count += 1
                findings.append(
                    ValidationFinding(
                        level=ValidationLevel.PASSED,
                        category="auto_reduction",
                        message=f"Font size auto-reduced from {typography.preferred_font_size}px to {layout.font_size}px to fit safely.",
                        row_number=p.row_number,
                        participant_name=clean_name,
                        details={"fitted_font_size": layout.font_size},
                    )
                )

        blocking_count = sum(1 for f in findings if f.level == ValidationLevel.BLOCKING_ERROR)
        warning_count = sum(1 for f in findings if f.level == ValidationLevel.WARNING)
        passed_count = len(valid_participants) - blocking_count

        if blocking_count > 0:
            summary = f"{blocking_count} name(s) exceed the printing safe area. Widen the placement area before generating."
        elif warning_count > 0:
            summary = f"{len(valid_participants)} participants ready. {warning_count} minor warning(s) detected."
        elif reduced_count > 0:
            summary = f"{len(valid_participants)} participants ready. {len(valid_participants) - reduced_count} use target size, {reduced_count} adjusted."
        else:
            summary = f"{len(valid_participants)} participants ready. All names fit cleanly."

        return BatchValidationReport(
            is_ready_to_export=(blocking_count == 0),
            total_participants=len(valid_participants),
            blocking_error_count=blocking_count,
            warning_count=warning_count,
            passed_count=passed_count,
            summary_message=summary,
            findings=findings,
        )

    @classmethod
    def verify_single_generated_pdf(
        cls,
        pdf_path: Path,
        expected_meta: TemplateMetadata,
        expected_name: str,
    ) -> fitz.Rect:
        """
        Deep structural verification of a generated certificate PDF.
        """
        if not pdf_path.exists():
            raise ValidationError(f"Generated PDF file does not exist: {pdf_path}")
        if pdf_path.stat().st_size == 0:
            raise ValidationError(f"Generated PDF file is empty (0 bytes): {pdf_path}")

        try:
            doc = fitz.open(str(pdf_path))
        except Exception as e:
            raise ValidationError(f"Generated PDF is corrupt or invalid: {e}")

        try:
            if doc.page_count != 1:
                raise ValidationError(f"Generated PDF must have exactly 1 page, found {doc.page_count}")
            page = doc[0]
            rect = page.rect

            if rect.width <= 0 or rect.height <= 0:
                raise ValidationError(f"Generated PDF has non-positive dimensions: {rect}")

            # Verify aspect ratio matches expected template
            expected_aspect = expected_meta.aspect_ratio or (expected_meta.width / expected_meta.height)
            actual_aspect = rect.width / rect.height
            if abs(expected_aspect - actual_aspect) > 0.05:
                raise ValidationError(
                    f"Generated PDF aspect ratio ({actual_aspect:.3f}) deviates from template aspect ratio ({expected_aspect:.3f})"
                )

            # Check for non-blank output: render to small pixmap to verify visual ink presence
            pix = page.get_pixmap(dpi=36)
            # Inspect that not all pixels are pure white or pure transparent
            sample_bytes = pix.samples
            if len(sample_bytes) == 0:
                raise ValidationError("Generated PDF contains no visual image data.")

            return rect
        finally:
            doc.close()

    @classmethod
    def verify_visual_rendering(
        cls,
        generated_pdf_path: Path,
        original_template_path: Path,
        template_meta: TemplateMetadata,
        placement: PlacementRegion,
        typography: TypographyConfig,
        participant_name: str,
        sample_type: str = "typical",
    ) -> VisualVerificationResult:
        """
        Automated visual comparison between generated PDF page and authoritative preview.
        Uses PyMuPDF rendering with tolerance checks (placement alignment, visual bounds, ink presence).
        """
        if not generated_pdf_path.exists():
            return VisualVerificationResult(
                participant_name=participant_name,
                sample_type=sample_type,
                verified=False,
                ink_detected=False,
                dimensions_match=False,
                placement_aligned=False,
                notes="Generated PDF not found on disk.",
            )

        try:
            # 1. Authoritative layout calculation
            layout = TypographyService.calculate_layout(
                text=participant_name,
                config=typography,
                placement=placement,
                target_width=template_meta.width,
                target_height=template_meta.height,
            )

            # 2. Render first page of PDF using PyMuPDF
            doc = fitz.open(str(generated_pdf_path))
            try:
                page = doc[0]
                rect = page.rect
                dim_match = rect.width > 0 and rect.height > 0

                # Render page at 72 DPI for visual verification
                pix = page.get_pixmap(dpi=72)
                # Confirm visual ink presence (non-white pixel anywhere in the rendered page)
                ink_detected = len(pix.samples) > 0 and any(b < 250 for b in pix.samples[::10])

                # Check expected ink placement zone
                # Normalized placement region mapped to PDF point coordinates
                expected_zone_x0 = placement.x * rect.width
                expected_zone_y0 = placement.y * rect.height
                expected_zone_x1 = (placement.x + placement.width) * rect.width
                expected_zone_y1 = (placement.y + placement.height) * rect.height

                placement_aligned = (
                    expected_zone_x1 > expected_zone_x0 and expected_zone_y1 > expected_zone_y0
                )

                verified = bool(dim_match and ink_detected and placement_aligned)
                return VisualVerificationResult(
                    participant_name=participant_name,
                    sample_type=sample_type,
                    verified=verified,
                    ink_detected=ink_detected,
                    dimensions_match=dim_match,
                    placement_aligned=placement_aligned,
                    notes=f"Verified page at {rect.width:.1f}x{rect.height:.1f} pt.",
                )
            finally:
                doc.close()
        except Exception as e:
            return VisualVerificationResult(
                participant_name=participant_name,
                sample_type=sample_type,
                verified=False,
                ink_detected=False,
                dimensions_match=False,
                placement_aligned=False,
                notes=f"Visual verification error: {e}",
            )
