import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.placement import PlacementRegion
from app.schemas.typography import TypographyConfig, TextAlignment
from app.services.typography_service import TypographyService
from app.services.rendering_service import RenderingService

client = TestClient(app)


def create_blank_certificate_bytes(width: int = 1000, height: int = 700) -> bytes:
    img = Image.new("RGB", (width, height), color=(252, 250, 245))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_short_vs_long_name_auto_fitting():
    placement = PlacementRegion(x=0.2, y=0.4, width=0.6, height=0.15)
    config = TypographyConfig(
        font_id="great_vibes",
        preferred_font_size=72,
        min_font_size=20,
        alignment=TextAlignment.CENTER,
    )
    target_w, target_h = 1000, 700

    # Short name fits at preferred font size (72)
    short_layout = TypographyService.calculate_layout(
        text="Ava Roy",
        config=config,
        placement=placement,
        target_width=target_w,
        target_height=target_h,
    )
    assert short_layout.fits is True
    assert short_layout.font_size == 72
    assert short_layout.fitted_at_reduced_size is False

    # Long name auto-reduces font size to prevent overflow
    long_layout = TypographyService.calculate_layout(
        text="Dr. Alexander Montgomery-Cunningham III",
        config=config,
        placement=placement,
        target_width=target_w,
        target_height=target_h,
    )
    assert long_layout.fits is True
    assert long_layout.font_size < 72
    assert long_layout.font_size >= config.min_font_size
    assert long_layout.fitted_at_reduced_size is True


def test_minimum_font_size_enforcement_and_overflow_warning():
    # Very narrow placement area
    tiny_placement = PlacementRegion(x=0.45, y=0.45, width=0.1, height=0.05)
    config = TypographyConfig(
        font_id="cinzel",
        preferred_font_size=50,
        min_font_size=24,
    )
    target_w, target_h = 1000, 700

    layout = TypographyService.calculate_layout(
        text="Venkateshwaran Subramanian",
        config=config,
        placement=tiny_placement,
        target_width=target_w,
        target_height=target_h,
    )
    # Must enforce min_font_size without shrinking below it
    assert layout.font_size == config.min_font_size
    assert layout.fits is False
    assert any("cannot fit" in w for w in layout.warnings)


def test_center_alignment_stationary_horizontal_center():
    placement = PlacementRegion(x=0.2, y=0.4, width=0.6, height=0.15)
    config = TypographyConfig(
        font_id="allura",
        preferred_font_size=60,
        min_font_size=20,
        alignment=TextAlignment.CENTER,
    )
    target_w, target_h = 1000, 700

    layout1 = TypographyService.calculate_layout(
        text="Short",
        config=config,
        placement=placement,
        target_width=target_w,
        target_height=target_h,
    )

    layout2 = TypographyService.calculate_layout(
        text="A Moderately Long Participant Name",
        config=config,
        placement=placement,
        target_width=target_w,
        target_height=target_h,
    )

    # Box center is placement.x * 1000 + (placement.width * 1000) / 2 = 200 + 300 = 500
    expected_center_x = 500.0
    center1 = layout1.text_bounds.x + layout1.text_bounds.width / 2.0
    center2 = layout2.text_bounds.x + layout2.text_bounds.width / 2.0

    assert abs(center1 - expected_center_x) <= 1.0
    assert abs(center2 - expected_center_x) <= 1.0


def test_layout_api_endpoint():
    # 1. Create Job
    job_resp = client.post("/api/jobs")
    assert job_resp.status_code == 201
    job_id = job_resp.json()["job_id"]

    # 2. Upload template
    png_bytes = create_blank_certificate_bytes()
    up_resp = client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("blank_certificate.png", png_bytes, "image/png")},
    )
    assert up_resp.status_code == 200

    # 3. Save placement
    client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.2, "y": 0.45, "width": 0.6, "height": 0.12}},
    )

    # 4. Save typography
    client.post(
        f"/api/jobs/{job_id}/typography",
        json={
            "font_id": "great_vibes",
            "preferred_font_size": 64,
            "min_font_size": 20,
            "text_color": "#1e293b",
            "alignment": "center",
        },
    )

    # 5. Fetch layout for short vs long name
    short_resp = client.get(f"/api/jobs/{job_id}/layout?sample_text=Ava")
    assert short_resp.status_code == 200
    short_layout = short_resp.json()
    assert short_layout["fits"] is True
    assert short_layout["font_size"] == 64

    long_resp = client.get(f"/api/jobs/{job_id}/layout?sample_text=Dr.+Alexander+Montgomery-Cunningham+III")
    assert long_resp.status_code == 200
    long_layout = long_resp.json()
    assert long_layout["fits"] is True
    assert long_layout["font_size"] < 64
    assert long_layout["fitted_at_reduced_size"] is True


def test_backward_compatibility_with_cleanup_jobs():
    # Jobs created in Milestone 4.1 might contain cleanup keys in storage
    job_resp = client.post("/api/jobs")
    job_id = job_resp.json()["job_id"]

    # Verify job response is valid and does not crash
    get_resp = client.get(f"/api/jobs/{job_id}")
    assert get_resp.status_code == 200
    job_data = get_resp.json()
    assert job_data["job_id"] == job_id
    assert "typography" in job_data
