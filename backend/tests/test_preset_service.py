import io
import pytest
from pathlib import Path
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.services.preset_service import PresetService, PresetNotFoundError

client = TestClient(app)


def create_dummy_png(width: int = 1200, height: int = 800) -> bytes:
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_preset_lifecycle_create_list_use_delete():
    """
    Test complete preset lifecycle:
    1. Create job and configure template, placement, and typography.
    2. Save preset via POST /api/jobs/{job_id}/save-preset.
    3. List presets via GET /api/presets.
    4. Retrieve preset details via GET /api/presets/{preset_id}.
    5. Retrieve thumbnail via GET /api/presets/{preset_id}/thumbnail.
    6. Use preset via POST /api/presets/{preset_id}/use to generate a fresh job.
    7. Delete preset via DELETE /api/presets/{preset_id}.
    """
    # 1. Create job
    res = client.post("/api/jobs")
    job_id = res.json()["job_id"]

    png_bytes = create_dummy_png(1200, 800)
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("cert_template.png", png_bytes, "image/png")},
    )
    client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.2, "y": 0.45, "width": 0.6, "height": 0.12}},
    )
    client.post(
        f"/api/jobs/{job_id}/typography",
        json={
            "font_id": "great_vibes",
            "preferred_font_size": 52,
            "min_font_size": 18,
            "text_color": "#111827",
            "alignment": "center",
            "sizing_mode": "smart_consistent",
        },
    )

    # 2. Save as preset
    save_res = client.post(
        f"/api/jobs/{job_id}/save-preset",
        json={"name": "Annual Honors Award"},
    )
    assert save_res.status_code == 200
    preset_data = save_res.json()
    preset_id = preset_data["preset_id"]
    assert preset_data["name"] == "Annual Honors Award"
    assert preset_data["placement"]["x"] == 0.2
    assert preset_data["typography"]["font_id"] == "great_vibes"

    # 3. List presets
    list_res = client.get("/api/presets")
    assert list_res.status_code == 200
    presets = list_res.json()["presets"]
    assert any(p["preset_id"] == preset_id for p in presets)

    # 4. Get specific preset
    get_res = client.get(f"/api/presets/{preset_id}")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Annual Honors Award"

    # 5. Get thumbnail
    thumb_res = client.get(f"/api/presets/{preset_id}/thumbnail")
    assert thumb_res.status_code == 200
    assert thumb_res.headers["content-type"] == "image/png"

    # 6. Use preset -> creates fresh new job
    use_res = client.post(f"/api/presets/{preset_id}/use")
    assert use_res.status_code == 200
    new_job = use_res.json()
    new_job_id = new_job["job_id"]
    assert new_job_id != job_id
    assert new_job["template"] is not None
    assert new_job["template"]["width"] == 1200
    assert new_job["placement"]["x"] == 0.2
    assert new_job["typography"]["font_id"] == "great_vibes"
    # Ensure CSV is empty in the new job
    assert new_job["csv_summary"] is None
    assert new_job["status"] == "template_uploaded"

    # 7. Delete preset
    del_res = client.delete(f"/api/presets/{preset_id}")
    assert del_res.status_code == 204

    # Confirm deletion
    get_after_del = client.get(f"/api/presets/{preset_id}")
    assert get_after_del.status_code == 404

    # Confirm created job still exists and functions
    job_after_del = client.get(f"/api/jobs/{new_job_id}")
    assert job_after_del.status_code == 200


def test_preset_independence_and_job_modifications():
    """
    Test that modifying or deleting a job created from a preset does not alter the preset.
    """
    res = client.post("/api/jobs")
    job_id = res.json()["job_id"]

    png_bytes = create_dummy_png(1000, 700)
    client.post(f"/api/jobs/{job_id}/template", files={"file": ("t.png", png_bytes, "image/png")})
    client.post(f"/api/jobs/{job_id}/placement", json={"placement": {"x": 0.1, "y": 0.4, "width": 0.8, "height": 0.2}})
    client.post(f"/api/jobs/{job_id}/typography", json={
        "font_id": "eb_garamond",
        "preferred_font_size": 40,
        "min_font_size": 18,
        "text_color": "#ff0000",
        "alignment": "left",
    })

    save_res = client.post(f"/api/jobs/{job_id}/save-preset", json={"name": "Independent Test Preset"})
    preset_id = save_res.json()["preset_id"]

    # Use preset to create Job B
    job_b = client.post(f"/api/presets/{preset_id}/use").json()
    job_b_id = job_b["job_id"]

    # Modify Job B typography to Great Vibes, #000000, center
    client.post(f"/api/jobs/{job_b_id}/typography", json={
        "font_id": "great_vibes",
        "preferred_font_size": 60,
        "min_font_size": 18,
        "text_color": "#000000",
        "alignment": "center",
    })

    # Verify preset still retains EB Garamond and #ff0000
    preset_fresh = client.get(f"/api/presets/{preset_id}").json()
    assert preset_fresh["typography"]["font_id"] == "eb_garamond"
    assert preset_fresh["typography"]["text_color"] == "#ff0000"
    assert preset_fresh["typography"]["alignment"] == "left"

    # Cleanup preset
    client.delete(f"/api/presets/{preset_id}")


def test_preset_path_traversal_prevention():
    """
    Verify that directory traversal attempts are rejected.
    """
    res = client.get("/api/presets/../../etc/passwd")
    assert res.status_code in [404, 400]
