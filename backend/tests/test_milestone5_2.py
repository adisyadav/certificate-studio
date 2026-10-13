import io
import json
import pytest
from pathlib import Path
from PIL import Image, ImageDraw
import fitz  # PyMuPDF
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.placement import PlacementRegion
from app.schemas.typography import TypographyConfig, TextAlignment
from app.schemas.job import TemplateMetadata, TemplateOrientation, ParticipantRecord
from app.services.font_service import FontService
from app.services.typography_service import TypographyService
from app.services.batch_analysis_service import BatchAnalysisService
from app.services.pdf_service import PDFService
from app.services.job_service import JobService

client = TestClient(app)


def create_blank_certificate_with_underline(
    width: int = 1200, height: int = 800, underline_y: int = 440
) -> bytes:
    """
    Creates a certificate template with a gold underline beneath the recipient area.
    """
    img = Image.new("RGB", (width, height), color=(250, 248, 245))
    draw = ImageDraw.Draw(img)
    # Draw gold underline line (e.g. from x=200 to x=1000 at y=underline_y)
    draw.line([(200, underline_y), (1000, underline_y)], fill=(212, 175, 55), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def create_blank_pdf_certificate_with_underline(
    width: float = 612.0, height: float = 792.0, underline_y: float = 430.0
) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=width, height=height)
    # Draw underline in gold
    page.draw_line(
        fitz.Point(100, underline_y),
        fitz.Point(512, underline_y),
        color=(0.83, 0.68, 0.21),
        width=2,
    )
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def test_nikhil_reddy_great_vibes_glyph_containment():
    """
    Regression test: "Nikhil Reddy" with Great Vibes font must strictly fit
    inside the safe printing region without its calligraphic 'y' flourish
    exceeding safe_bottom.
    """
    target_w, target_h = 1200, 800
    # Region placed above an underline at y=432:
    # Placement box: top y=360, bottom y=430 (height=70)
    placement = PlacementRegion(x=0.2, y=0.45, width=0.6, height=0.0875)  # 70px height
    config = TypographyConfig(
        font_id="great_vibes",
        preferred_font_size=52,
        min_font_size=18,
        vertical_clearance_percent=0.08,
        horizontal_clearance_percent=0.04,
        alignment=TextAlignment.CENTER,
    )

    layout = TypographyService.calculate_layout(
        text="Nikhil Reddy",
        config=config,
        placement=placement,
        target_width=target_w,
        target_height=target_h,
    )

    box_y = placement.y * target_h  # 360.0
    box_h = placement.height * target_h  # 70.0
    box_bottom = box_y + box_h  # 430.0

    pad_y = box_h * 0.08  # 5.6
    safe_top = box_y + pad_y  # 365.6
    safe_bottom = box_bottom - pad_y  # 424.4

    # Ink bounds
    ink_top = layout.text_bounds.y
    ink_bottom = layout.text_bounds.y + layout.text_bounds.height

    assert layout.fits is True
    # Complete ink must stay within safe bounds
    assert ink_top >= safe_top - 0.5
    assert ink_bottom <= safe_bottom + 0.5
    # Must strictly stay above the bottom edge of the box and well clear of an underline at 432
    assert ink_bottom < box_bottom
    assert ink_bottom <= 425.0


def test_descenders_containment_multiple_names():
    """
    Verify strict vertical containment for names containing g, j, p, q, and y.
    """
    target_w, target_h = 1000, 700
    placement = PlacementRegion(x=0.15, y=0.4, width=0.7, height=0.12)  # 84px height
    box_y = placement.y * target_h
    box_h = placement.height * target_h
    safe_top = box_y + box_h * 0.08
    safe_bottom = box_y + box_h * (1.0 - 0.08)

    descender_names = [
        "George Washington",  # g
        "Jacqueline Fernandez",  # j, q
        "Priyanka Chopra",  # p, y
        "Gregory Peck",  # g, p, y
        "Quincy Jones",  # q, y
    ]

    for font_id in ["great_vibes", "allura", "alex_brush", "cinzel", "eb_garamond"]:
        config = TypographyConfig(
            font_id=font_id,
            preferred_font_size=52,
            min_font_size=18,
            vertical_clearance_percent=0.08,
            horizontal_clearance_percent=0.04,
        )
        for name in descender_names:
            layout = TypographyService.calculate_layout(
                text=name,
                config=config,
                placement=placement,
                target_width=target_w,
                target_height=target_h,
            )
            ink_top = layout.text_bounds.y
            ink_bottom = layout.text_bounds.y + layout.text_bounds.height

            assert layout.fits is True, f"Failed for {name} with font {font_id}"
            assert ink_top >= safe_top - 1.0, f"Top exceeded for {name} with {font_id}"
            assert ink_bottom <= safe_bottom + 1.0, f"Bottom exceeded for {name} with {font_id}"


def test_negative_glyph_bearings():
    """
    Fonts like Allura have negative left bearings (e.g. -11px).
    The engine must position draw_x so ink starts cleanly inside safe_left.
    """
    target_w, target_h = 1000, 700
    placement = PlacementRegion(x=0.2, y=0.4, width=0.6, height=0.12)
    config = TypographyConfig(
        font_id="allura",
        preferred_font_size=56,
        alignment=TextAlignment.LEFT,
        horizontal_clearance_percent=0.05,
    )

    layout = TypographyService.calculate_layout(
        text="Allura Name",
        config=config,
        placement=placement,
        target_width=target_w,
        target_height=target_h,
    )

    safe_left = placement.x * target_w + (placement.width * target_w) * 0.05
    # ink_x must start exactly at safe_left
    assert abs(layout.text_bounds.x - safe_left) <= 1.0
    # draw_position x must offset by negative bearing so draw_x > ink_x
    assert layout.draw_position["x"] >= layout.text_bounds.x


def test_configurable_text_clearance_settings():
    """
    Increasing clearance percent must shrink the safe area and scale down font
    if needed to preserve the clearance.
    """
    target_w, target_h = 1000, 700
    placement = PlacementRegion(x=0.2, y=0.4, width=0.6, height=0.10)  # 70px height

    # 4% vertical clearance
    config_4 = TypographyConfig(font_id="great_vibes", preferred_font_size=60, vertical_clearance_percent=0.04)
    layout_4 = TypographyService.calculate_layout("Nikhil Reddy", config_4, placement, target_w, target_h)

    # 15% vertical clearance (stricter margin)
    config_15 = TypographyConfig(font_id="great_vibes", preferred_font_size=60, vertical_clearance_percent=0.15)
    layout_15 = TypographyService.calculate_layout("Nikhil Reddy", config_15, placement, target_w, target_h)

    # Safe height with 15% is smaller than with 4%
    assert layout_15.safe_bounds.height < layout_4.safe_bounds.height
    assert layout_15.font_size <= layout_4.font_size
    # Ink with 15% clearance ends strictly higher up than with 4%
    assert (layout_15.text_bounds.y + layout_15.text_bounds.height) <= (layout_4.text_bounds.y + layout_4.text_bounds.height)


def test_pdf_export_ink_containment_and_underline_preservation(tmp_path):
    """
    Generate an actual PDF certificate with "Nikhil Reddy" in Great Vibes
    over a template with a gold underline below the placement box.
    Render the generated PDF back into an image using PyMuPDF pixmap,
    and assert that no ink pixels cross or touch the gold underline.
    """
    # 1. Create raster template with underline at y=435
    underline_y = 435
    png_bytes = create_blank_certificate_with_underline(1200, 800, underline_y=underline_y)
    template_path = tmp_path / "template.png"
    template_path.write_bytes(png_bytes)

    meta = TemplateMetadata(
        filename="template.png",
        format="PNG",
        width=1200,
        height=800,
        aspect_ratio=1.5,
        orientation=TemplateOrientation.LANDSCAPE,
        file_size_bytes=len(png_bytes),
        preview_url="/api/jobs/test/preview",
    )
    # Box bottom is at y = (0.45 + 0.0875) * 800 = 430px (5px above gold underline at 435)
    placement = PlacementRegion(x=0.2, y=0.45, width=0.6, height=0.0875)
    config = TypographyConfig(
        font_id="great_vibes",
        preferred_font_size=52,
        min_font_size=18,
        vertical_clearance_percent=0.08,
        horizontal_clearance_percent=0.04,
        text_color="#111827",
    )

    output_pdf = tmp_path / "nikhil_reddy.pdf"
    layout = PDFService.generate_certificate_pdf(
        original_template_path=template_path,
        template_meta=meta,
        placement=placement,
        typography_config=config,
        participant_name="Nikhil Reddy",
        output_pdf_path=output_pdf,
    )

    assert output_pdf.exists()
    assert layout.fits is True

    # 2. Render generated PDF back into an image with PyMuPDF
    doc = fitz.open(str(output_pdf))
    page = doc[0]
    # At standard 150 DPI matrix matching PDFService (150/72 = 2.0833)
    pix = page.get_pixmap(dpi=150)
    pdf_img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    doc.close()

    # Compare against blank template image
    orig_img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    # Resize or match dimensions
    orig_resized = orig_img.resize(pdf_img.size, Image.Resampling.LANCZOS)

    # Find where text ink was drawn (pixels that are dark in pdf_img but light in orig_img)
    # Background is (250, 248, 245), text is #111827 (~17, 24, 39)
    # Gold underline is at underline_y scaled to pdf_img.size
    scale_y = pdf_img.size[1] / 800.0
    scaled_underline_y = underline_y * scale_y
    scaled_box_bottom_y = 430.0 * scale_y

    # Check all pixels near the underline: no text ink should be present at or below underline
    w, h = pdf_img.size
    for y in range(int(scaled_underline_y - 2), int(scaled_underline_y + 4)):
        for x in range(int(w * 0.2), int(w * 0.8)):
            r, g, b = pdf_img.getpixel((x, y))
            # If it's dark text color (r < 60 and g < 60 and b < 60), it would mean text overlap!
            # Underline is gold (r > 150, g > 120), background is light (r > 200).
            assert not (r < 60 and g < 60 and b < 60), f"Text ink crossed into underline at ({x}, {y})!"


def test_batch_analysis_clearance_and_auto_fit_consistency():
    """
    Verify that BatchAnalysisService, TypographyService.calculate_layout,
    and TypographyService.optimize_typography_for_batch use identical clearance rules.
    """
    meta = TemplateMetadata(
        filename="template.png",
        format="PNG",
        width=1200,
        height=800,
        aspect_ratio=1.5,
        orientation=TemplateOrientation.LANDSCAPE,
        file_size_bytes=1000,
        preview_url="/api/jobs/test/preview",
    )
    placement = PlacementRegion(x=0.2, y=0.45, width=0.6, height=0.10)
    config = TypographyConfig(
        font_id="great_vibes",
        preferred_font_size=52,
        min_font_size=18,
        vertical_clearance_percent=0.08,
    )
    participants = [
        ParticipantRecord(row_number=1, name="Ada Lovelace", is_valid=True),
        ParticipantRecord(row_number=2, name="Nikhil Reddy", is_valid=True),
        ParticipantRecord(row_number=3, name="Dr. Alexander Montgomery-Cunningham III", is_valid=True),
    ]

    report = BatchAnalysisService.analyze_participants(
        participants=participants,
        template_meta=meta,
        placement=placement,
        config=config,
    )

    assert report.total_analyzed == 3
    assert report.all_fit is True
    # The long name required reduction to fit clearance
    assert report.reduction_count >= 1
    assert report.insufficient_clearance_count >= 1

    # Check status labels
    analysis_dict = {p.name: p for p in report.participants_analysis}
    assert analysis_dict["Ada Lovelace"].status_label == "Fits at preferred size"
    assert "Fits after automatic reduction" in analysis_dict["Dr. Alexander Montgomery-Cunningham III"].status_label

    # Fingerprint must contain clearance
    assert report.config_fingerprint is not None
    # Changing clearance alters fingerprint
    config_altered = TypographyConfig(
        font_id="great_vibes",
        preferred_font_size=52,
        min_font_size=18,
        vertical_clearance_percent=0.15,
    )
    report_altered = BatchAnalysisService.analyze_participants(
        participants=participants,
        template_meta=meta,
        placement=placement,
        config=config_altered,
    )
    assert report.config_fingerprint != report_altered.config_fingerprint
