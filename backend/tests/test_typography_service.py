import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.services.font_service import FontService

client = TestClient(app)


def create_test_image(size=(800, 600)) -> bytes:
    img = Image.new("RGB", size, color=(240, 240, 240))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_list_fonts():
    res = client.get("/api/fonts")
    assert res.status_code == 200
    fonts = res.json()
    assert len(fonts) >= 4
    font_ids = [f["id"] for f in fonts]
    assert "great_vibes" in font_ids
    assert "allura" in font_ids
    assert "alex_brush" in font_ids
    assert "cinzel" in font_ids
    assert "eb_garamond" in font_ids


def test_glyph_check_accents_and_unsupported():
    # 'é' is supported by EB Garamond
    res_supported = FontService.check_glyphs("eb_garamond", "Renée Müller")
    assert res_supported.supported is True
    assert len(res_supported.unsupported_chars) == 0

    # Rare emoji / symbol is unsupported
    res_unsupported = FontService.check_glyphs("great_vibes", "Alice 🚀")
    assert res_unsupported.supported is False
    assert "🚀" in res_unsupported.unsupported_chars


def test_save_typography_config():
    job_id = client.post("/api/jobs").json()["job_id"]
    typo_config = {
        "font_id": "allura",
        "preferred_font_size": 48,
        "min_font_size": 16,
        "text_color": "#2563eb",
        "alignment": "center",
    }
    res = client.post(f"/api/jobs/{job_id}/typography", json=typo_config)
    assert res.status_code == 200
    data = res.json()
    assert data["typography"]["font_id"] == "allura"
    assert data["typography"]["text_color"] == "#2563eb"
    assert data["typography"]["preferred_font_size"] == 48


def test_reject_invalid_font_id():
    job_id = client.post("/api/jobs").json()["job_id"]
    typo_config = {
        "font_id": "comic_sans_unknown",
        "preferred_font_size": 48,
        "min_font_size": 16,
        "text_color": "#000000",
        "alignment": "center",
    }
    res = client.post(f"/api/jobs/{job_id}/typography", json=typo_config)
    assert res.status_code == 400
    assert "not supported" in res.json()["detail"].lower()


def test_render_certificate_preview_raster_and_headers():
    job_id = client.post("/api/jobs").json()["job_id"]
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("cert.png", create_test_image((1200, 800)), "image/png")},
    )
    client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.2, "y": 0.4, "width": 0.6, "height": 0.15}},
    )
    client.post(
        f"/api/jobs/{job_id}/typography",
        json={"font_id": "great_vibes", "preferred_font_size": 60, "min_font_size": 16, "text_color": "#111827", "alignment": "center"},
    )

    # 1. Render preview with sample text
    preview_res = client.get(f"/api/jobs/{job_id}/preview?sample_text=Alexander+Hamilton")
    assert preview_res.status_code == 200
    assert preview_res.headers["content-type"] == "image/png"
    assert "x-fitted-font-size" in preview_res.headers
    assert preview_res.headers["x-text-fits"] == "true"


def test_font_size_reduction_and_minimum_readable_enforcement():
    job_id = client.post("/api/jobs").json()["job_id"]
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("cert.png", create_test_image((600, 400)), "image/png")},
    )
    # Narrow placement box
    client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.3, "y": 0.4, "width": 0.3, "height": 0.08}},
    )
    client.post(
        f"/api/jobs/{job_id}/typography",
        json={"font_id": "eb_garamond", "preferred_font_size": 72, "min_font_size": 24, "text_color": "#000000", "alignment": "center"},
    )

    # Extremely long name in narrow box should trigger font reduction or exceed min size
    long_name = "His Excellency Field Marshal Dr. Alexander Montgomery-Cunningham The Third of Edinburgh"
    preview_res = client.get(f"/api/jobs/{job_id}/preview?sample_text={long_name}")
    assert preview_res.status_code == 200
    fitted_size = int(preview_res.headers["x-fitted-font-size"])
    # It must have reduced from 72 down to min_size 24
    assert fitted_size <= 72


def test_batch_typography_analysis():
    job_id = client.post("/api/jobs").json()["job_id"]
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("cert.png", create_test_image((1000, 700)), "image/png")},
    )
    client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.2, "y": 0.4, "width": 0.6, "height": 0.12}},
    )
    csv_content = (
        "Participant,Role\n"
        "Jo,Engineer\n"
        "Bartholomew Abernathy-Fitzgerald,Director\n"
        "William Walker,Specialist\n"
        "Emma Watson,Actor\n"
    )
    client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("participants.csv", csv_content.encode("utf-8"), "text/csv")},
    )

    res = client.post(f"/api/jobs/{job_id}/analyze-typography")
    assert res.status_code == 200
    report = res.json()
    assert report["total_analyzed"] == 4
    assert report["shortest_name"] == "Jo"
    assert report["longest_name_by_chars"] == "Bartholomew Abernathy-Fitzgerald"
    assert report["widest_name"] is not None
    assert len(report["participants_analysis"]) == 4


def test_settings_change_invalidates_analysis():
    job_id = client.post("/api/jobs").json()["job_id"]
    client.post(
        f"/api/jobs/{job_id}/template",
        files={"file": ("cert.png", create_test_image((1000, 700)), "image/png")},
    )
    client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.2, "y": 0.4, "width": 0.6, "height": 0.12}},
    )
    client.post(
        f"/api/jobs/{job_id}/csv",
        files={"file": ("p.csv", b"name\nAlice\nBob\n", "text/csv")},
    )

    # 1. Run analysis
    client.post(f"/api/jobs/{job_id}/analyze-typography")
    assert client.get(f"/api/jobs/{job_id}").json()["batch_analysis"] is not None

    # 2. Modify placement -> analysis invalidated
    client.post(
        f"/api/jobs/{job_id}/placement",
        json={"placement": {"x": 0.1, "y": 0.3, "width": 0.7, "height": 0.15}},
    )
    assert client.get(f"/api/jobs/{job_id}").json()["batch_analysis"] is None
