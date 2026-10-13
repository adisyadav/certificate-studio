import io
import time
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.job import TemplateMetadata, TemplateOrientation
from app.schemas.placement import PlacementRegion
from app.schemas.typography import TypographyConfig
from app.services.batch_analysis_service import BatchAnalysisService

client = TestClient(app)


def create_dummy_png(width: int = 1200, height: int = 800) -> bytes:
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_deterministic_configuration_fingerprint():
    meta = TemplateMetadata(
        filename="template.png",
        format="PNG",
        width=1200,
        height=800,
        aspect_ratio=1.5,
        orientation=TemplateOrientation.LANDSCAPE,
        file_size_bytes=5000,
        preview_url="/preview",
    )
    placement1 = PlacementRegion(x=0.1, y=0.4, width=0.8, height=0.2)
    placement2 = PlacementRegion(x=0.2, y=0.4, width=0.6, height=0.2)
    config = TypographyConfig(font_id="great_vibes", preferred_font_size=56, min_font_size=18)

    fp1 = BatchAnalysisService.compute_fingerprint(meta, placement1, config, 20)
    fp1_duplicate = BatchAnalysisService.compute_fingerprint(meta, placement1, config, 20)
    fp2 = BatchAnalysisService.compute_fingerprint(meta, placement2, config, 20)

    assert fp1 == fp1_duplicate
    assert fp1 != fp2


def test_analyze_and_auto_fit_persist_analysis_and_fingerprint():
    # 1. Create job
    res = client.post("/api/jobs").json()
    job_id = res["job_id"]

    # 2. Upload template
    png_bytes = create_dummy_png(1200, 800)
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("template.png", png_bytes, "image/png")},
    )

    # 3. Upload CSV
    csv_content = "Name,Department\nAda Lovelace,Computing\nJohn Doe,Operations\n"
    client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("participants.csv", csv_content.encode("utf-8"), "text/csv")},
    )

    # 4. Placement & Typography
    client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.1, "y": 0.4, "width": 0.8, "height": 0.2}},
    )

    # 5. Run Auto Fit
    af_res = client.post(f"/api/jobs/{job_id}/auto-fit")
    assert af_res.status_code == 200
    af_data = af_res.json()
    assert af_data["batch_analysis"] is not None
    assert af_data["batch_analysis"]["config_fingerprint"] is not None

    # Verify job.json persisted the batch_analysis
    job_res = client.get(f"/api/jobs/{job_id}").json()
    assert job_res["batch_analysis"] is not None
    assert job_res["batch_analysis"]["all_fit"] is True
    assert job_res["batch_analysis"]["config_fingerprint"] == af_data["batch_analysis"]["config_fingerprint"]


def test_saving_identical_placement_or_typography_preserves_analysis():
    # 1. Create job with data
    res = client.post("/api/jobs").json()
    job_id = res["job_id"]
    png_bytes = create_dummy_png(1200, 800)
    client.post(f"/api/jobs/{job_id}/template", files={"file": ("template.png", png_bytes, "image/png")})
    csv_content = "Name\nAda Lovelace\n"
    client.post(f"/api/jobs/{job_id}/csv", files={"file": ("participants.csv", csv_content.encode("utf-8"), "text/csv")})
    client.post(f"/api/jobs/{job_id}/placement", json={"placement": {"x": 0.1, "y": 0.4, "width": 0.8, "height": 0.2}})

    # Run analyze
    an_res = client.post(f"/api/jobs/{job_id}/analyze-typography").json()
    assert an_res["all_fit"] is True

    # Save identical placement
    client.post(f"/api/jobs/{job_id}/placement", json={"placement": {"x": 0.1, "y": 0.4, "width": 0.8, "height": 0.2}})
    job_after_placement = client.get(f"/api/jobs/{job_id}").json()
    assert job_after_placement["batch_analysis"] is not None

    # Save modified placement -> should invalidate
    client.post(f"/api/jobs/{job_id}/placement", json={"placement": {"x": 0.2, "y": 0.5, "width": 0.5, "height": 0.1}})
    job_after_modified = client.get(f"/api/jobs/{job_id}").json()
    assert job_after_modified["batch_analysis"] is None
