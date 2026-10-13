import io
import pytest
from pathlib import Path
from PIL import Image
import fitz  # PyMuPDF
from fastapi.testclient import TestClient

from app.main import app
from app.services.job_service import JobService

client = TestClient(app)


def create_test_image(format: str = "PNG", size=(800, 600), color=(255, 0, 0)) -> bytes:
    img = Image.new("RGB", size, color=color)
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()


def create_test_pdf(pages: int = 1) -> bytes:
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page(width=842, height=595)  # A4 Landscape in points
        page.draw_rect(fitz.Rect(10, 10, 832, 585), color=(0, 0, 1), width=2)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def test_create_and_get_job():
    res = client.post("/api/jobs")
    assert res.status_code == 201
    job = res.json()
    job_id = job["job_id"]
    assert job["status"] == "created"

    res_get = client.get(f"/api/jobs/{job_id}")
    assert res_get.status_code == 200
    assert res_get.json()["job_id"] == job_id


def test_valid_png_upload():
    job_res = client.post("/api/jobs").json()
    job_id = job_res["job_id"]

    png_bytes = create_test_image("PNG", size=(1200, 800))
    res = client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("certificate.png", png_bytes, "image/png")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["template"]["format"] == "PNG"
    assert data["template"]["width"] == 1200
    assert data["template"]["height"] == 800
    assert data["template"]["orientation"] == "landscape"
    assert data["template"]["preview_url"] == f"/api/jobs/{job_id}/template/preview"
    assert data["status"] == "template_uploaded"

    # Verify preview can be fetched safely
    preview_res = client.get(f"/api/jobs/{job_id}/template/preview")
    assert preview_res.status_code == 200
    assert preview_res.headers["content-type"] == "image/png"


def test_valid_jpeg_upload():
    job_res = client.post("/api/jobs").json()
    job_id = job_res["job_id"]

    jpeg_bytes = create_test_image("JPEG", size=(600, 900))
    res = client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("template.jpg", jpeg_bytes, "image/jpeg")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["template"]["format"] == "JPEG"
    assert data["template"]["width"] == 600
    assert data["template"]["height"] == 900
    assert data["template"]["orientation"] == "portrait"


def test_valid_single_page_pdf_upload():
    job_res = client.post("/api/jobs").json()
    job_id = job_res["job_id"]

    pdf_bytes = create_test_pdf(pages=1)
    res = client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("certificate.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["template"]["format"] == "PDF"
    assert data["template"]["orientation"] == "landscape"


def test_corrupted_image_rejection():
    job_res = client.post("/api/jobs").json()
    job_id = job_res["job_id"]

    fake_png = b"corrupted random data not a real image"
    res = client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("broken.png", fake_png, "image/png")},
    )
    assert res.status_code == 400
    assert "Invalid or corrupted image" in res.json()["detail"]


def test_multipage_pdf_rejection():
    job_res = client.post("/api/jobs").json()
    job_id = job_res["job_id"]

    pdf_bytes = create_test_pdf(pages=3)
    res = client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("multipage.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 400
    assert "Multipage PDFs are not supported in V1" in res.json()["detail"]


def test_empty_csv_rejection():
    job_res = client.post("/api/jobs").json()
    job_id = job_res["job_id"]

    res = client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("empty.csv", b"", "text/csv")},
    )
    assert res.status_code == 400
    assert "empty" in res.json()["detail"].lower()


def test_csv_with_different_name_headers():
    job_res = client.post("/api/jobs").json()
    job_id = job_res["job_id"]

    csv_content = "Participant,Course,Date\nAlice Smith,Python,2026-10-13\nBob Jones,FastAPI,2026-10-14\n"
    res = client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("participants.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["csv_summary"]["selected_name_column"] == "Participant"
    assert data["csv_summary"]["valid_count"] == 2
    assert len(data["participants_preview"]) == 2
    assert data["participants_preview"][0]["name"] == "Alice Smith"
    assert data["participants_preview"][0]["extra_fields"]["Course"] == "Python"


def test_csv_with_duplicate_names():
    job_res = client.post("/api/jobs").json()
    job_id = job_res["job_id"]

    csv_content = "name,email\nAditya Yadav,aditya@example.com\nCharlie Brown,charlie@example.com\nAditya Yadav,aditya2@example.com\n"
    res = client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("participants.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    assert res.status_code == 200
    data = res.json()
    summary = data["csv_summary"]
    assert summary["duplicate_count"] == 2
    assert summary["valid_count"] == 3
    # Verify duplicates are kept as separate records
    assert len(data["participants_preview"]) == 3
    assert data["participants_preview"][0]["is_duplicate"] is True
    assert data["participants_preview"][1]["is_duplicate"] is False
    assert data["participants_preview"][2]["is_duplicate"] is True


def test_csv_with_blank_rows():
    job_res = client.post("/api/jobs").json()
    job_id = job_res["job_id"]

    csv_content = "Full Name,Role\nDev One,Engineer\n\n  \nDev Two,Designer\n"
    res = client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("team.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["csv_summary"]["valid_count"] == 2
    assert data["csv_summary"]["invalid_count"] == 2  # blank rows
    # Row numbers maintained
    row_numbers = [p["row_number"] for p in data["participants_preview"]]
    assert row_numbers == [2, 3, 4, 5]


def test_utf8_bom_csv_and_unicode_names():
    job_res = client.post("/api/jobs").json()
    job_id = job_res["job_id"]

    # UTF-8 with BOM prefix and international characters
    bom = b"\xef\xbb\xbf"
    csv_text = "name,country\nRenée Müller,Germany\nÅsa Lindqvist,Sweden\n李伟,China\n"
    content = bom + csv_text.encode("utf-8")

    res = client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("attendees.csv", content, "text/csv")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["csv_summary"]["selected_name_column"] == "name"
    assert data["csv_summary"]["valid_count"] == 3
    names = [p["name"] for p in data["participants_preview"]]
    assert "Renée Müller" in names
    assert "Åsa Lindqvist" in names
    assert "李伟" in names


def test_select_name_column():
    job_res = client.post("/api/jobs").json()
    job_id = job_res["job_id"]

    csv_content = "user_id,full_name,alias\n101,Johnathan Doe,JDoe\n102,Jane Smith,JSmith\n"
    client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("users.csv", csv_content.encode("utf-8"), "text/csv")},
    )

    # Change selected column to 'alias'
    res = client.post(
        f"/api/jobs/{job_id}/select-name-column",
        json={"column_name": "alias"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["csv_summary"]["selected_name_column"] == "alias"
    assert data["participants_preview"][0]["name"] == "JDoe"


def test_malformed_csv():
    job_res = client.post("/api/jobs").json()
    job_id = job_res["job_id"]

    # Invalid non-UTF-8 sequence
    bad_bytes = b"name,score\n\x80\x81invalid,100"
    res = client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("broken.csv", bad_bytes, "text/csv")},
    )
    assert res.status_code == 400
    assert "encoding" in res.json()["detail"].lower()


def test_job_isolation_and_safe_preview_access():
    job1 = client.post("/api/jobs").json()["job_id"]
    job2 = client.post("/api/jobs").json()["job_id"]

    png1 = create_test_image("PNG", size=(400, 300), color=(100, 100, 100))
    client.post(
        f"/api/jobs/{job1}/template",
        files={"file": ("t1.png", png1, "image/png")},
    )

    # Job 1 has preview, Job 2 does not yet
    assert client.get(f"/api/jobs/{job1}/template/preview").status_code == 200
    assert client.get(f"/api/jobs/{job2}/template/preview").status_code == 404

    # Path traversal attempt in job ID
    bad_res = client.get("/api/jobs/../../etc/passwd")
    assert bad_res.status_code in (404, 400)


def test_replacement_invalidates_prior_state():
    job_res = client.post("/api/jobs").json()
    job_id = job_res["job_id"]

    # Upload template 1
    t1 = create_test_image("PNG", size=(500, 500))
    client.post(f"/api/jobs/{job_id}/template", files={"file": ("t1.png", t1, "image/png")})

    # Upload CSV 1
    c1 = "name\nUser A\nUser B\n".encode("utf-8")
    res1 = client.post(f"/api/jobs/{job_id}/csv", files={"file": ("c1.csv", c1, "text/csv")})
    assert res1.json()["status"] == "ready"
    assert res1.json()["csv_summary"]["valid_count"] == 2

    # Replace with CSV 2
    c2 = "Student Name\nStudent One\nStudent Two\nStudent Three\n".encode("utf-8")
    res2 = client.post(f"/api/jobs/{job_id}/csv", files={"file": ("c2.csv", c2, "text/csv")})
    assert res2.json()["csv_summary"]["valid_count"] == 3
    assert res2.json()["csv_summary"]["selected_name_column"] == "Student Name"
