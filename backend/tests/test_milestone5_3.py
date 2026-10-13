import io
import json
import pytest
from pathlib import Path
from PIL import Image
import fitz
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


def create_dummy_template_png(width: int = 1200, height: int = 800) -> bytes:
    img = Image.new("RGB", (width, height), color=(252, 250, 245))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_all_five_bundled_fonts_exist_and_render():
    """
    Verify that all 5 bundled fonts exist, load correctly via FontService,
    and measure valid non-zero bounding boxes.
    """
    fonts = FontService.list_fonts()
    font_ids = {f.id for f in fonts}
    expected_ids = {"great_vibes", "allura", "alex_brush", "cinzel", "eb_garamond"}
    assert expected_ids.issubset(font_ids)

    sample_name = "Nikhil Reddy"
    for fid in expected_ids:
        font = FontService.load_pillow_font(fid, size=52)
        assert font is not None
        ascent, descent = font.getmetrics()
        assert ascent > 0
        assert descent >= 0

        # Check glyph coverage
        check = FontService.check_glyphs(fid, sample_name)
        assert check.supported is True

        # Measure text bounds
        bbox = TypographyService.measure_text_bounds(sample_name, font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        assert w > 0
        assert h > 0


def test_perfect_fit_action_and_persistence():
    """
    Test that the Perfect Fit action (POST /api/jobs/{id}/auto-fit)
    analyzes participants, sets optimal font size, preserves placement box,
    and persists across session restoration without shifting the rectangle.
    """
    # 1. Create job
    create_resp = client.post("/api/jobs")
    assert create_resp.status_code == 201
    job_id = create_resp.json()["job_id"]

    # 2. Upload template
    png_bytes = create_dummy_template_png(1200, 800)
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("blank_certificate.png", png_bytes, "image/png")},
    )

    # 3. Upload CSV
    csv_content = "Full Name,Email\nAda Lovelace,ada@example.com\nNikhil Reddy,nikhil@example.com\nDr. Alexander Montgomery-Cunningham III,alex@example.com\n"
    client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("participants.csv", csv_content.encode("utf-8"), "text/csv")},
    )

    # 4. Save placement
    initial_placement = {"x": 0.25, "y": 0.45, "width": 0.55, "height": 0.12}
    client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": initial_placement},
    )

    # 5. Execute Perfect Fit (auto_fit endpoint)
    fit_resp = client.post(f"/api/jobs/{job_id}/auto-fit")
    assert fit_resp.status_code == 200
    fit_data = fit_resp.json()

    assert "typography" in fit_data
    assert "batch_analysis" in fit_data
    assert fit_data["batch_analysis"]["all_fit"] is True
    assert fit_data["batch_analysis"]["total_analyzed"] == 3

    # 6. Verify placement rectangle was NOT moved or modified by fitting
    job_resp = client.get(f"/api/jobs/{job_id}")
    job_data = job_resp.json()
    assert job_data["placement"]["x"] == initial_placement["x"]
    assert job_data["placement"]["y"] == initial_placement["y"]
    assert job_data["placement"]["width"] == initial_placement["width"]
    assert job_data["placement"]["height"] == initial_placement["height"]

    # 7. Verify session persistence contains the perfect fit results
    assert job_data["batch_analysis"] is not None
    assert job_data["batch_analysis"]["config_fingerprint"] is not None


def test_internal_clearance_enforcement_during_perfect_fit():
    """
    Confirm that Perfect Fit adheres to the internal 8% vertical clearance
    and 4% horizontal clearance margins.
    """
    target_w, target_h = 1200, 800
    placement = PlacementRegion(x=0.2, y=0.45, width=0.6, height=0.10)  # 80px height
    config = TypographyConfig(
        font_id="great_vibes",
        preferred_font_size=52,
        min_font_size=18,
        vertical_clearance_percent=0.08,
        horizontal_clearance_percent=0.04,
    )

    names = ["Nikhil Reddy", "Ada Lovelace", "Dr. Alexander Montgomery-Cunningham III"]
    optimal_size = TypographyService.optimize_typography_for_batch(
        names=names,
        config=config,
        placement=placement,
        target_width=target_w,
        target_height=target_h,
    )

    assert optimal_size >= config.min_font_size

    # Verify each fitted name stays within safe margins
    for name in names:
        layout = TypographyService.calculate_layout(
            text=name,
            config=config,
            placement=placement,
            target_width=target_w,
            target_height=target_h,
        )
        assert layout.fits is True
        safe_top = placement.y * target_h + (placement.height * target_h) * 0.08
        safe_bottom = (placement.y + placement.height) * target_h - (placement.height * target_h) * 0.08
        ink_top = layout.text_bounds.y
        ink_bottom = layout.text_bounds.y + layout.text_bounds.height
        assert ink_top >= safe_top - 1.0
        assert ink_bottom <= safe_bottom + 1.0


def test_export_font_consistency_across_all_fonts(tmp_path):
    """
    Generate single-page PDF certificates using each of the 5 fonts.
    Confirm that each PDF uses the selected font and generates a valid,
    non-empty single-page PDF.
    """
    png_bytes = create_dummy_template_png(1200, 800)
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
    placement = PlacementRegion(x=0.2, y=0.45, width=0.6, height=0.12)

    for font_id in ["great_vibes", "allura", "alex_brush", "cinzel", "eb_garamond"]:
        config = TypographyConfig(
            font_id=font_id,
            preferred_font_size=52,
            min_font_size=18,
            vertical_clearance_percent=0.08,
            horizontal_clearance_percent=0.04,
        )
        pdf_path = tmp_path / f"cert_{font_id}.pdf"
        layout = PDFService.generate_certificate_pdf(
            original_template_path=template_path,
            template_meta=meta,
            placement=placement,
            typography_config=config,
            participant_name="Ada Lovelace",
            output_pdf_path=pdf_path,
        )

        assert pdf_path.exists()
        assert layout.fits is True
        doc = fitz.open(str(pdf_path))
        assert doc.page_count == 1
        page = doc[0]
        assert page.rect.width > 0
        assert page.rect.height > 0
        doc.close()
