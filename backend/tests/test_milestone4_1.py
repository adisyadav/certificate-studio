import io
import pytest
from PIL import Image, ImageDraw
import fitz
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.placement import PlacementRegion
from app.schemas.cleanup import CleanupConfig
from app.services.placeholder_removal_service import PlaceholderRemovalService

client = TestClient(app)


def create_sample_png_bytes(width: int = 400, height: int = 300, text: str = "Placeholder Name") -> bytes:
    img = Image.new("RGB", (width, height), color=(250, 248, 240))
    draw = ImageDraw.Draw(img)
    # Draw sample text and a background box
    draw.rectangle([50, 100, 350, 200], fill=(240, 235, 220))
    draw.text((80, 140), text, fill=(20, 20, 20))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def create_sample_pdf_bytes(text: str = "Recipient Name") -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=400, height=300)
    page.draw_rect(fitz.Rect(50, 100, 350, 200), color=(0.8, 0.8, 0.8), fill=(0.95, 0.95, 0.9))
    page.insert_text(fitz.Point(80, 150), text, fontsize=24, color=(0.1, 0.1, 0.1))
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def test_solid_cleanup_raster_with_auto_border_sampling():
    png_bytes = create_sample_png_bytes()
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    region = PlacementRegion(x=0.1, y=0.3, width=0.8, height=0.4)
    config = CleanupConfig(
        mode="solid",
        region=region,
        auto_sample_color=True,
    )

    cleaned_img, _ = PlaceholderRemovalService._clean_raster_image(img, config)
    assert cleaned_img.size == (400, 300)
    # Check that pixel within the region has been replaced with the background/border color
    center_pixel = cleaned_img.getpixel((200, 150))
    # It should not be the dark text color (20, 20, 20)
    assert center_pixel[0] > 150
    assert center_pixel[1] > 150
    assert center_pixel[2] > 150


def test_inpaint_cleanup_raster_telea():
    png_bytes = create_sample_png_bytes()
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    region = PlacementRegion(x=0.1, y=0.3, width=0.8, height=0.4)
    config = CleanupConfig(
        mode="inpaint",
        region=region,
        inpaint_radius=3,
    )

    cleaned_img, _ = PlaceholderRemovalService._clean_raster_image(img, config)
    assert cleaned_img.size == (400, 300)
    center_pixel = cleaned_img.getpixel((200, 150))
    # Telea inpainting smoothly fills the region
    assert center_pixel[0] > 100


def test_pdf_vector_text_redaction(tmp_path):
    pdf_bytes = create_sample_pdf_bytes(text="Recipient To Redact")
    pdf_file = tmp_path / "cert.pdf"
    pdf_file.write_bytes(pdf_bytes)

    region = PlacementRegion(x=0.1, y=0.25, width=0.8, height=0.5)
    cleaned_img, warning = PlaceholderRemovalService._clean_pdf_text(pdf_file, region)
    assert cleaned_img is not None
    assert cleaned_img.size[0] > 0


def test_save_cleanup_api_and_cleaned_preview():
    # 1. Create Job
    job_resp = client.post("/api/jobs")
    assert job_resp.status_code == 201
    job_id = job_resp.json()["job_id"]

    # 2. Upload template
    png_bytes = create_sample_png_bytes()
    up_resp = client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("certificate.png", png_bytes, "image/png")},
    )
    assert up_resp.status_code == 200

    # 3. Save placement
    client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.2, "y": 0.4, "width": 0.6, "height": 0.2}},
    )

    # 4. Save cleanup configuration
    cleanup_payload = {
        "mode": "solid",
        "region": {"x": 0.15, "y": 0.35, "width": 0.7, "height": 0.3},
        "auto_sample_color": True,
        "background_color": None,
        "inpaint_radius": 3,
    }
    save_resp = client.post(f"/api/jobs/{job_id}/cleanup", json=cleanup_payload)
    assert save_resp.status_code == 200
    saved_job = save_resp.json()
    assert saved_job["cleanup"] is not None
    assert saved_job["cleanup"]["mode"] == "solid"
    assert saved_job["cleanup"]["region"]["width"] == 0.7

    # 5. Fetch cleaned preview
    cleaned_prev_resp = client.get(f"/api/jobs/{job_id}/preview/cleaned")
    assert cleaned_prev_resp.status_code == 200
    assert cleaned_prev_resp.headers["content-type"] == "image/png"

    # 6. Fetch personalized preview with cleanup active
    preview_resp = client.get(f"/api/jobs/{job_id}/preview?sample_text=Jane%20Doe")
    assert preview_resp.status_code == 200
    assert preview_resp.headers["content-type"] == "image/png"


def test_template_preservation_and_cleanup_invalidation():
    # 1. Create Job & upload template
    job_resp = client.post("/api/jobs")
    job_id = job_resp.json()["job_id"]

    png1 = create_sample_png_bytes(width=400, height=300)
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("cert1.png", png1, "image/png")},
    )

    # 2. Save cleanup
    client.post(
        f"/api/jobs/{job_id}/cleanup",
        json={
            "mode": "solid",
            "region": {"x": 0.1, "y": 0.1, "width": 0.5, "height": 0.2},
            "auto_sample_color": True,
            "background_color": None,
            "inpaint_radius": 3,
        },
    )
    job_after_cleanup = client.get(f"/api/jobs/{job_id}").json()
    assert job_after_cleanup["cleanup"] is not None

    # 3. Upload new template -> must invalidate cleanup and placement
    png2 = create_sample_png_bytes(width=500, height=350)
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("cert2.png", png2, "image/png")},
    )
    job_after_new_template = client.get(f"/api/jobs/{job_id}").json()
    assert job_after_new_template["cleanup"] is None
    assert job_after_new_template["placement"] is None
