import io
from pathlib import Path
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.placement import PlacementRegion
from app.schemas.typography import TypographyConfig, SizingMode
from app.services.typography_service import TypographyService
from app.services.batch_analysis_service import BatchAnalysisService
from app.services.job_service import JobService

client = TestClient(app)


def test_batch_consistent_typography_same_size_for_standard_names():
    """
    Test that standard names share the exact same target font size,
    and shorter names are NOT enlarged beyond the target font size.
    """
    names = [
        "Amy Lin",
        "Bob Smith",
        "Carol Danvers",
        "David Miller",
        "Eva Green",
    ]
    placement = PlacementRegion(x=0.2, y=0.45, width=0.6, height=0.12)
    config = TypographyConfig(
        font_id="great_vibes",
        preferred_font_size=52,
        min_font_size=18,
        sizing_mode=SizingMode.SMART_CONSISTENT,
    )

    optimal_target = TypographyService.optimize_typography_for_batch(
        names=names,
        config=config,
        placement=placement,
        target_width=1200,
        target_height=800,
    )

    assert optimal_target >= 36
    # Update config preferred size to the optimal target
    config.preferred_font_size = optimal_target

    layouts = [
        TypographyService.calculate_layout(
            text=name,
            config=config,
            placement=placement,
            target_width=1200,
            target_height=800,
        )
        for name in names
    ]

    # Every single one of these standard names must use the EXACT same font size!
    font_sizes = [l.font_size for l in layouts]
    assert all(s == optimal_target for s in font_sizes), f"Sizes varied: {font_sizes}"
    # Short name 'Amy Lin' is NOT blown up
    amy_layout = layouts[0]
    assert amy_layout.font_size == optimal_target


def test_batch_consistent_typography_outlier_downscaling():
    """
    Test that an outlier long name scales down individually to prevent overflow,
    while standard names remain at the shared target size.
    """
    names = [
        "Amy Lin",
        "John Doe",
        "Sarah Connor",
        "Hubert Blaine Wolfeschlegelsteinhausenbergerdorff Senior",  # Extreme outlier
    ]
    placement = PlacementRegion(x=0.2, y=0.45, width=0.6, height=0.12)
    config = TypographyConfig(
        font_id="great_vibes",
        preferred_font_size=52,
        min_font_size=18,
        sizing_mode=SizingMode.SMART_CONSISTENT,
    )

    optimal_target = TypographyService.optimize_typography_for_batch(
        names=names,
        config=config,
        placement=placement,
        target_width=1200,
        target_height=800,
    )

    config.preferred_font_size = optimal_target

    amy_layout = TypographyService.calculate_layout(
        text="Amy Lin",
        config=config,
        placement=placement,
        target_width=1200,
        target_height=800,
    )
    long_layout = TypographyService.calculate_layout(
        text="Hubert Blaine Wolfeschlegelsteinhausenbergerdorff Senior",
        config=config,
        placement=placement,
        target_width=1200,
        target_height=800,
    )

    # Standard name is at optimal_target
    assert amy_layout.font_size == optimal_target
    # Outlier is scaled down
    assert long_layout.font_size < optimal_target
    assert long_layout.font_size >= config.min_font_size


def test_batch_analysis_reports_consistent_and_adjusted_counts(tmp_path):
    """
    Test that BatchAnalysisService computes shared_target_font_size,
    consistent_count, and adjusted_count properly.
    """
    # Create job
    res = client.post("/api/jobs")
    job_id = res.json()["job_id"]

    # Upload template
    img = Image.new("RGB", (1200, 800), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("cert.png", buf.getvalue(), "image/png")},
    )

    # Upload CSV with 4 standard names and 1 long name
    csv_content = (
        "Participant Name,Email\n"
        "Alice Smith,alice@example.com\n"
        "Bob Jones,bob@example.com\n"
        "Charlie Brown,charlie@example.com\n"
        "Diana Prince,diana@example.com\n"
        "Bartholomew Maximillian Montgomery Alexander,bart@example.com\n"
    )
    client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("participants.csv", csv_content.encode("utf-8"), "text/csv")},
    )

    # Save compact placement rectangle
    client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.2, "y": 0.45, "width": 0.6, "height": 0.12}},
    )

    # Call Perfect Fit
    fit_res = client.post(f"/api/jobs/{job_id}/auto-fit")
    assert fit_res.status_code == 200
    fit_data = fit_res.json()

    batch_rep = fit_data["batch_analysis"]
    assert batch_rep["total_analyzed"] == 5
    assert batch_rep["all_fit"] is True
    # Check consistent count vs adjusted count
    assert batch_rep["consistent_count"] >= 3
    assert batch_rep["adjusted_count"] >= 1
    assert batch_rep["consistent_count"] + batch_rep["adjusted_count"] == 5


def test_fingerprint_changes_when_sizing_mode_changes():
    """
    Test that changing sizing_mode alters the config fingerprint.
    """
    res = client.post("/api/jobs")
    job_id = res.json()["job_id"]

    img = Image.new("RGB", (1200, 800), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("cert.png", buf.getvalue(), "image/png")},
    )
    csv_content = "Name\nAlice Smith\nBob Jones\n"
    client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("participants.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.2, "y": 0.45, "width": 0.6, "height": 0.12}},
    )

    # Analyze with default smart_consistent
    rep1 = client.post(f"/api/jobs/{job_id}/analyze-typography").json()
    fp1 = rep1["config_fingerprint"]

    # Save with individual_max
    client.post(
        f"/api/jobs/{job_id}/typography",
        json={
            "font_id": "great_vibes",
            "preferred_font_size": 52,
            "min_font_size": 18,
            "text_color": "#111827",
            "alignment": "center",
            "sizing_mode": "individual_max",
        },
    )
    rep2 = client.post(f"/api/jobs/{job_id}/analyze-typography").json()
    fp2 = rep2["config_fingerprint"]

    assert fp1 != fp2
