import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def create_test_image(format: str = "PNG", size=(800, 600)) -> bytes:
    img = Image.new("RGB", size, color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()


def test_save_valid_placement():
    job_id = client.post("/api/jobs").json()["job_id"]
    # Upload template
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("test.png", create_test_image(), "image/png")},
    )

    placement_data = {
        "placement": {
            "x": 0.2,
            "y": 0.4,
            "width": 0.6,
            "height": 0.15,
        }
    }
    res = client.post(f"/api/jobs/{job_id}/placement", json=placement_data)
    assert res.status_code == 200
    data = res.json()
    assert data["placement"] is not None
    assert data["placement"]["x"] == 0.2
    assert data["placement"]["y"] == 0.4
    assert data["placement"]["width"] == 0.6
    assert data["placement"]["height"] == 0.15

    # Retrieve placement via GET
    get_res = client.get(f"/api/jobs/{job_id}/placement")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["placement"]["x"] == 0.2


def test_reject_placement_without_template():
    job_id = client.post("/api/jobs").json()["job_id"]
    placement_data = {
        "placement": {
            "x": 0.2,
            "y": 0.4,
            "width": 0.6,
            "height": 0.15,
        }
    }
    res = client.post(f"/api/jobs/{job_id}/placement", json=placement_data)
    assert res.status_code == 400
    assert "without an uploaded certificate template" in res.json()["detail"]


def test_reject_negative_coordinates():
    job_id = client.post("/api/jobs").json()["job_id"]
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("test.png", create_test_image(), "image/png")},
    )

    # Negative x
    res = client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": -0.1, "y": 0.2, "width": 0.5, "height": 0.1}},
    )
    assert res.status_code == 422


def test_reject_zero_or_negative_dimensions():
    job_id = client.post("/api/jobs").json()["job_id"]
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("test.png", create_test_image(), "image/png")},
    )

    # Zero width
    res = client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.1, "y": 0.2, "width": 0.0, "height": 0.1}},
    )
    assert res.status_code == 422


def test_reject_out_of_bounds_placement():
    job_id = client.post("/api/jobs").json()["job_id"]
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("test.png", create_test_image(), "image/png")},
    )

    # x + width = 0.6 + 0.5 = 1.1 > 1.0
    res = client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.6, "y": 0.2, "width": 0.5, "height": 0.1}},
    )
    assert res.status_code == 422

    # y + height = 0.8 + 0.3 = 1.1 > 1.0
    res2 = client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.1, "y": 0.8, "width": 0.5, "height": 0.3}},
    )
    assert res2.status_code == 422


def test_template_replacement_invalidates_placement():
    job_id = client.post("/api/jobs").json()["job_id"]

    # 1. Upload initial template
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("t1.png", create_test_image(size=(800, 600)), "image/png")},
    )

    # 2. Save placement
    client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.2, "y": 0.4, "width": 0.5, "height": 0.1}},
    )

    # Check placement exists
    assert client.get(f"/api/jobs/{job_id}/placement").json()["placement"] is not None

    # 3. Replace template with another template
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("t2.png", create_test_image(size=(1200, 800)), "image/png")},
    )

    # 4. Verify placement is now invalidated (None)
    assert client.get(f"/api/jobs/{job_id}/placement").json()["placement"] is None
    job_get = client.get(f"/api/jobs/{job_id}").json()
    assert job_get["placement"] is None
