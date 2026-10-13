import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.services.job_service import JobService

client = TestClient(app)


def create_test_image() -> bytes:
    img = Image.new("RGB", (800, 600), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_session_recovery_and_placement_restoration():
    # 1. Create a job session
    res = client.post("/api/jobs")
    assert res.status_code == 201
    job_id = res.json()["job_id"]

    # 2. Upload template
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("cert.png", create_test_image(), "image/png")},
    )

    # 3. Upload CSV
    csv_bytes = b"Participant,Email\nJane Doe,jane@example.com\nJohn Smith,john@example.com\n"
    client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("participants.csv", csv_bytes, "text/csv")},
    )

    # 4. Save placement
    placement = {"x": 0.25, "y": 0.45, "width": 0.50, "height": 0.12}
    client.post(f"/api/jobs/{job_id}/placement", json={"placement": placement})

    # 5. Simulate browser reload by calling GET /api/jobs/{job_id}
    reload_res = client.get(f"/api/jobs/{job_id}")
    assert reload_res.status_code == 200
    data = reload_res.json()

    assert data["job_id"] == job_id
    assert data["template"] is not None
    assert data["template"]["format"] == "PNG"
    assert data["csv_summary"] is not None
    assert data["csv_summary"]["valid_count"] == 2
    assert data["placement"] == placement
    assert len(data["participants_preview"]) == 2


def test_invalid_or_missing_job_id_returns_404():
    # Attempt to retrieve a non-existent job ID
    non_existent_id = "00000000-0000-0000-0000-000000000000"
    res = client.get(f"/api/jobs/{non_existent_id}")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_job_id_reuse_does_not_create_new_jobs():
    # Ensure repeated actions on same job_id update the same job
    res = client.post("/api/jobs")
    job_id = res.json()["job_id"]

    # First CSV
    client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("c1.csv", b"name\nAlice\n", "text/csv")},
    )

    # Replacement CSV with same job ID
    client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("c2.csv", b"name\nBob\nCharlie\n", "text/csv")},
    )

    final_job = client.get(f"/api/jobs/{job_id}").json()
    assert final_job["job_id"] == job_id
    assert final_job["csv_summary"]["valid_count"] == 2
    assert final_job["participants_preview"][0]["name"] == "Bob"
