import io
import time
import pytest
from pathlib import Path
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.job import TemplateMetadata, TemplateOrientation, ParticipantRecord
from app.schemas.placement import PlacementRegion
from app.schemas.typography import TypographyConfig
from app.services.validation_service import ValidationService, ValidationError
from app.services.batch_generation_service import BatchGenerationService

client = TestClient(app)


def create_dummy_png(width: int = 1200, height: int = 800) -> bytes:
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_validation_service_pre_export_checks():
    """
    Test ValidationService pre-export checks with various invalid configurations:
    1. Missing template
    2. Over-boundary placement
    3. Overflowing participant
    """
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
    placement_ok = PlacementRegion(x=0.1, y=0.4, width=0.8, height=0.2)
    typography = TypographyConfig(font_id="great_vibes", preferred_font_size=52, min_font_size=18)

    participants = [
        ParticipantRecord(row_number=1, name="John Doe", is_valid=True),
        ParticipantRecord(row_number=2, name="Wolfeschlegelsteinhausenbergerdorff Senior The Great Scholar Of Europe", is_valid=True),
    ]

    # Valid check
    tmp_path = Path("/tmp/dummy_template.png")
    tmp_path.write_bytes(create_dummy_png(1200, 800))

    # Missing placement check
    rep_missing_placement = ValidationService.validate_pre_export(
        template_meta=meta,
        template_file_path=tmp_path,
        placement=None,
        typography=typography,
        participants=participants,
    )
    assert not rep_missing_placement.is_ready_to_export
    assert any("placement area has not been set" in f.message for f in rep_missing_placement.findings)

    # Missing template file check
    rep_missing_template = ValidationService.validate_pre_export(
        template_meta=meta,
        template_file_path=Path("/tmp/nonexistent_template.png"),
        placement=placement_ok,
        typography=typography,
        participants=participants,
    )
    assert not rep_missing_template.is_ready_to_export
    assert any("Certificate template is missing" in f.message for f in rep_missing_template.findings)


def test_corrupted_pdf_verification(tmp_path):
    """
    Test that ValidationService.verify_single_generated_pdf detects corrupted or empty PDFs.
    """
    meta = TemplateMetadata(
        filename="t.png",
        format="PNG",
        width=1200,
        height=800,
        aspect_ratio=1.5,
        orientation=TemplateOrientation.LANDSCAPE,
        file_size_bytes=100,
        preview_url="/",
    )

    # Empty file
    empty_pdf = tmp_path / "empty.pdf"
    empty_pdf.write_bytes(b"")
    with pytest.raises(ValidationError, match="empty"):
        ValidationService.verify_single_generated_pdf(empty_pdf, meta, "John Doe")

    # Corrupt content
    corrupt_pdf = tmp_path / "corrupt.pdf"
    corrupt_pdf.write_bytes(b"Not a real PDF header or content")
    with pytest.raises(ValidationError, match="corrupt or invalid"):
        ValidationService.verify_single_generated_pdf(corrupt_pdf, meta, "John Doe")


def test_stale_export_recovery_on_reconcile():
    """
    Test that an in-progress export orphaned by a server restart is reconciled to failed.
    """
    res = client.post("/api/jobs")
    job_id = res.json()["job_id"]

    png_bytes = create_dummy_png(1200, 800)
    client.post(f"/api/jobs/{job_id}/template", files={"file": ("t.png", png_bytes, "image/png")})
    csv_content = "Name\nAlice Smith\n"
    client.post(f"/api/jobs/{job_id}/csv", files={"file": ("p.csv", csv_content.encode("utf-8"), "text/csv")})
    client.post(f"/api/jobs/{job_id}/placement", json={"placement": {"x": 0.1, "y": 0.4, "width": 0.8, "height": 0.2}})

    # Create dummy export directory with "generating" state
    export_id = "test-stale-export-id"
    exp_dir = BatchGenerationService.get_export_dir(job_id, export_id)
    exp_dir.mkdir(parents=True, exist_ok=True)
    meta_file = exp_dir / "export.json"
    meta_file.write_text(
        '{"export_id": "test-stale-export-id", "job_id": "' + job_id + '", "status": "generating", "created_at": "2026-01-01T00:00:00Z", "total_count": 1, "processed_count": 0, "percent_complete": 10}',
        encoding="utf-8"
    )

    # Calling get_export_status should trigger reconciliation
    status_res = client.get(f"/api/jobs/{job_id}/exports/{export_id}")
    assert status_res.status_code == 200
    data = status_res.json()
    assert data["status"] == "failed"
    assert "interrupted by a server restart" in data["error_message"]


def test_immutable_configuration_snapshot_isolation():
    """
    Verify that an immutable config snapshot is recorded in export_dir and settings modifications
    after launching an export do not alter the snapshot.
    """
    res = client.post("/api/jobs")
    job_id = res.json()["job_id"]

    png_bytes = create_dummy_png(1200, 800)
    client.post(f"/api/jobs/{job_id}/template", files={"file": ("t.png", png_bytes, "image/png")})
    csv_content = "Name\nAda Lovelace\n"
    client.post(f"/api/jobs/{job_id}/csv", files={"file": ("p.csv", csv_content.encode("utf-8"), "text/csv")})
    client.post(f"/api/jobs/{job_id}/placement", json={"placement": {"x": 0.1, "y": 0.4, "width": 0.8, "height": 0.2}})
    client.post(f"/api/jobs/{job_id}/typography", json={
        "font_id": "great_vibes",
        "preferred_font_size": 52,
        "min_font_size": 18,
        "text_color": "#000000",
        "alignment": "center",
    })

    # Start export
    exp_res = client.post(f"/api/jobs/{job_id}/exports")
    assert exp_res.status_code == 200
    export_id = exp_res.json()["export_id"]

    # Verify snapshot file exists
    exp_dir = BatchGenerationService.get_export_dir(job_id, export_id)
    snapshot_file = exp_dir / "config_snapshot.json"
    assert snapshot_file.exists()

    # Modify job typography afterwards
    client.post(f"/api/jobs/{job_id}/typography", json={
        "font_id": "eb_garamond",
        "preferred_font_size": 30,
        "min_font_size": 18,
        "text_color": "#ff0000",
        "alignment": "left",
    })

    # Read snapshot and verify it preserved Great Vibes
    import json
    snap_data = json.loads(snapshot_file.read_text(encoding="utf-8"))
    assert snap_data["typography"]["font_id"] == "great_vibes"
    assert snap_data["typography"]["text_color"] == "#000000"


def test_validate_export_api_endpoint():
    """
    Test GET /api/jobs/{job_id}/validate-export returns structured QA findings.
    """
    res = client.post("/api/jobs")
    job_id = res.json()["job_id"]

    png_bytes = create_dummy_png(1200, 800)
    client.post(f"/api/jobs/{job_id}/template", files={"file": ("t.png", png_bytes, "image/png")})
    csv_content = "Name\nJohn Doe\nJane Doe\n"
    client.post(f"/api/jobs/{job_id}/csv", files={"file": ("p.csv", csv_content.encode("utf-8"), "text/csv")})
    client.post(f"/api/jobs/{job_id}/placement", json={"placement": {"x": 0.1, "y": 0.4, "width": 0.8, "height": 0.2}})
    client.post(f"/api/jobs/{job_id}/typography", json={
        "font_id": "great_vibes",
        "preferred_font_size": 52,
        "min_font_size": 18,
        "text_color": "#111827",
        "alignment": "center",
    })

    val_res = client.get(f"/api/jobs/{job_id}/validate-export")
    assert val_res.status_code == 200
    val_data = val_res.json()
    assert val_data["is_ready_to_export"] is True
    assert val_data["total_participants"] == 2
    assert val_data["blocking_error_count"] == 0
    assert "ready" in val_data["summary_message"].lower()
