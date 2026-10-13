import io
import json
import time
import zipfile
import pytest

from PIL import Image
import fitz
from fastapi.testclient import TestClient

from app.main import app
from app.utils.filenames import sanitize_filename_base, FilenameGenerator
from app.schemas.placement import PlacementRegion
from app.schemas.typography import TypographyConfig
from app.services.pdf_service import PDFService
from app.services.batch_generation_service import BatchGenerationService

client = TestClient(app)


def create_dummy_png(width: int = 1200, height: int = 800) -> bytes:
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def create_dummy_single_page_pdf(width: float = 612.0, height: float = 792.0) -> bytes:
    doc = fitz.open()
    doc.new_page(width=width, height=height)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def test_filename_sanitization_and_collision():
    # Basic names
    assert sanitize_filename_base("Aarav Sharma") == "Aarav Sharma"
    # Unsafe path traversal characters
    assert sanitize_filename_base("../../etc/passwd") == "etc_passwd"
    assert sanitize_filename_base("Dr. Jane / Doe: 2026") == "Dr. Jane _ Doe_ 2026"
    # Windows reserved name
    assert sanitize_filename_base("CON") == "Certificate_CON"
    # Empty name
    assert sanitize_filename_base("   ") == "Certificate"

    # Generator duplicate resolution
    gen = FilenameGenerator()
    f1 = gen.get_pdf_filename("Aarav Sharma")
    f2 = gen.get_pdf_filename("Aarav Sharma")
    f3 = gen.get_pdf_filename("Aarav Sharma")
    assert f1 == "Aarav Sharma.pdf"
    assert f2 == "Aarav Sharma (2).pdf"
    assert f3 == "Aarav Sharma (3).pdf"


def test_single_certificate_pdf_generation_from_raster(tmp_path):
    png_bytes = create_dummy_png(1200, 800)
    template_path = tmp_path / "template.png"
    template_path.write_bytes(png_bytes)

    from app.schemas.job import TemplateMetadata, TemplateOrientation
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
    placement = PlacementRegion(x=0.2, y=0.45, width=0.6, height=0.15)
    config = TypographyConfig(font_id="great_vibes", preferred_font_size=52, min_font_size=18)

    output_pdf = tmp_path / "cert.pdf"
    layout = PDFService.generate_certificate_pdf(
        original_template_path=template_path,
        template_meta=meta,
        placement=placement,
        typography_config=config,
        participant_name="Ada Lovelace",
        output_pdf_path=output_pdf,
    )

    assert output_pdf.exists()
    assert layout.font_size > 0
    # Open and verify with PyMuPDF
    doc = fitz.open(str(output_pdf))
    assert doc.page_count == 1
    page = doc[0]
    assert page.rect.width > 0
    assert page.rect.height > 0
    doc.close()


def test_single_certificate_pdf_generation_from_pdf(tmp_path):
    pdf_bytes = create_dummy_single_page_pdf(600, 400)
    template_path = tmp_path / "template.pdf"
    template_path.write_bytes(pdf_bytes)

    from app.schemas.job import TemplateMetadata, TemplateOrientation
    meta = TemplateMetadata(
        filename="template.pdf",
        format="PDF",
        width=600,
        height=400,
        aspect_ratio=1.5,
        orientation=TemplateOrientation.LANDSCAPE,
        file_size_bytes=len(pdf_bytes),
        preview_url="/api/jobs/test/preview",
    )
    placement = PlacementRegion(x=0.2, y=0.45, width=0.6, height=0.15)
    config = TypographyConfig(font_id="alex_brush", preferred_font_size=48, min_font_size=18)

    output_pdf = tmp_path / "cert_pdf_template.pdf"
    layout = PDFService.generate_certificate_pdf(
        original_template_path=template_path,
        template_meta=meta,
        placement=placement,
        typography_config=config,
        participant_name="Bartholomew Montgomery",
        output_pdf_path=output_pdf,
    )

    assert output_pdf.exists()
    assert layout.font_size > 0
    doc = fitz.open(str(output_pdf))
    assert doc.page_count == 1
    doc.close()


def test_end_to_end_batch_export_workflow():
    # 1. Create job
    res = client.post("/api/jobs")
    job_id = res.json()["job_id"]

    # 2. Upload template
    png_bytes = create_dummy_png(1200, 800)
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("template.png", png_bytes, "image/png")},
    )

    # 3. Upload CSV with diverse names (short, long, duplicate)
    csv_content = (
        "Name,Department\n"
        "Ada Lovelace,Computing\n"
        "Aarav Sharma,Engineering\n"
        "Aarav Sharma,Design\n"  # duplicate
        "Bartholomew Montgomery-Fitzgerald III,Research\n"
        "John Doe,Operations\n"
    )
    client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("participants.csv", csv_content.encode("utf-8"), "text/csv")},
    )

    # 4. Placement & Typography
    client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.1, "y": 0.4, "width": 0.8, "height": 0.2}},
    )

    client.post(
        f"/api/jobs/{job_id}/typography",
        json={
            "font_id": "great_vibes",
            "preferred_font_size": 56,
            "min_font_size": 18,
            "text_color": "#0f172a",
            "alignment": "center",
        },
    )

    # 5. Start Export
    exp_res = client.post(f"/api/jobs/{job_id}/exports")
    assert exp_res.status_code == 200
    export_id = exp_res.json()["export_id"]

    # 6. Poll until completed
    completed = False
    for _ in range(50):
        time.sleep(0.1)
        status_res = client.get(f"/api/jobs/{job_id}/exports/{export_id}")
        data = status_res.json()
        if data["status"] == "completed":
            completed = True
            break
        elif data["status"] == "failed":
            pytest.fail(f"Export failed: {data.get('error_message')}")

    assert completed is True
    assert data["processed_count"] == 5
    assert data["percent_complete"] == 100
    assert data["report"] is not None
    assert data["report"]["successful"] == 5
    assert data["report"]["failed"] == 0

    # 7. Download ZIP
    dl_res = client.get(f"/api/jobs/{job_id}/exports/{export_id}/download")
    assert dl_res.status_code == 200
    assert dl_res.headers["content-type"] == "application/zip"

    # 8. Verify ZIP contents
    zip_bytes = io.BytesIO(dl_res.content)
    with zipfile.ZipFile(zip_bytes, "r") as zf:
        namelist = zf.namelist()
        # 5 PDFs + 1 generation_report.json = 6 items
        assert len(namelist) == 6
        assert "generation_report.json" in namelist
        assert "Ada Lovelace.pdf" in namelist
        assert "Aarav Sharma.pdf" in namelist
        assert "Aarav Sharma (2).pdf" in namelist  # duplicate handled
        assert "John Doe.pdf" in namelist

        # Verify generation report json inside zip
        rep_data = json.loads(zf.read("generation_report.json").decode("utf-8"))
        assert rep_data["total_participants"] == 5
        assert rep_data["successful"] == 5

        # Verify an extracted PDF is structurally valid
        ada_pdf_bytes = zf.read("Ada Lovelace.pdf")
        doc = fitz.open(stream=ada_pdf_bytes, filetype="pdf")
        assert doc.page_count == 1
        doc.close()
