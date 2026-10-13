import pytest
from io import BytesIO
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.placement import PlacementRegion
from app.schemas.typography import TypographyConfig
from app.services.typography_service import TypographyService

client = TestClient(app)


def create_dummy_png(width: int = 1200, height: int = 800) -> bytes:
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def setup_job_with_participants():
    # 1. Create job
    res = client.post("/api/jobs")
    job_id = res.json()["job_id"]

    # 2. Upload template
    png_bytes = create_dummy_png(1200, 800)
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("cert.png", png_bytes, "image/png")},
    )

    # 3. Upload CSV with short, medium, and long names
    csv_data = "Full Name,Role\nAda Lovelace,Scholar\nBartholomew Montgomery-Fitzgerald III,Distinguished Fellow\nJohn Doe,Participant\nJane Smith,Participant\n"
    client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("names.csv", csv_data.encode("utf-8"), "text/csv")},
    )

    # 4. Set placement
    client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.2, "y": 0.45, "width": 0.6, "height": 0.15}},
    )

    return job_id


def test_in_memory_layout_calculation(setup_job_with_participants):
    job_id = setup_job_with_participants

    # Call /layout/calculate with in-memory overrides
    custom_placement = PlacementRegion(x=0.1, y=0.4, width=0.8, height=0.2)
    custom_typography = TypographyConfig(
        font_id="alex_brush",
        preferred_font_size=64,
        min_font_size=20,
        text_color="#003366",
    )

    res = client.post(
        f"/api/jobs/{job_id}/layout/calculate",
        json={
            "sample_text": "Alexander Great",
            "placement": custom_placement.model_dump(),
            "typography": custom_typography.model_dump(),
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "font_size" in data
    assert data["font_size"] <= 64
    assert data["fits"] is True
    assert data["text_bounds"]["width"] > 0


def test_auto_fit_service_policy():
    names = ["Ada Lovelace", "John Doe", "Jane Smith"]
    placement = PlacementRegion(x=0.2, y=0.45, width=0.6, height=0.15)
    config = TypographyConfig(font_id="cinzel", preferred_font_size=52, min_font_size=18)

    optimal_size = TypographyService.optimize_typography_for_batch(
        names=names,
        config=config,
        placement=placement,
        target_width=1200,
        target_height=800,
    )

    # For standard names in a large box (0.6 * 1200 = 720px wide, 120px high),
    # optimal size should be prominent (e.g. >= 40px)
    assert optimal_size >= 40
    assert optimal_size <= 76


def test_auto_fit_endpoint(setup_job_with_participants):
    job_id = setup_job_with_participants

    # Run auto-fit
    res = client.post(f"/api/jobs/{job_id}/auto-fit")
    assert res.status_code == 200
    data = res.json()

    assert "typography" in data
    assert "batch_analysis" in data
    assert "summary" in data
    assert data["optimal_size"] >= 18
    assert data["batch_analysis"]["total_analyzed"] == 4

    # Verify that the job was updated with the new typography
    job_res = client.get(f"/api/jobs/{job_id}")
    job_data = job_res.json()
    assert job_data["typography"]["preferred_font_size"] == data["optimal_size"]
    assert job_data["batch_analysis"] is not None
    assert job_data["batch_analysis"]["total_analyzed"] == 4


def test_auto_fit_preserves_font_and_color(setup_job_with_participants):
    job_id = setup_job_with_participants

    # Set custom font and color
    client.post(
        f"/api/jobs/{job_id}/typography",
        json={
            "font_id": "alex_brush",
            "preferred_font_size": 20,
            "min_font_size": 16,
            "text_color": "#123456",
            "alignment": "center",
        },
    )

    # Run auto-fit
    res = client.post(f"/api/jobs/{job_id}/auto-fit")
    assert res.status_code == 200
    data = res.json()

    # Font, color, and alignment must be preserved
    assert data["typography"]["font_id"] == "alex_brush"
    assert data["typography"]["text_color"] == "#123456"
    assert data["typography"]["alignment"] == "center"
    assert data["typography"]["min_font_size"] == 16
    # Size should be optimized up from 20 to something larger
    assert data["typography"]["preferred_font_size"] >= 20
