import json
import uuid
import shutil
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from app.config import settings
from app.schemas.job import (
    JobResponse,
    JobStatus,
    TemplateMetadata,
    CsvSummary,
    ParticipantRecord,
)


class JobNotFoundError(Exception):
    pass


class JobService:
    @classmethod
    def get_job_dir(cls, job_id: str) -> Path:
        # Validate format of job_id to prevent path traversal
        clean_id = job_id.strip()
        # Verify valid UUID or alphanumeric string
        try:
            uuid.UUID(clean_id)
        except ValueError:
            # Allow clean alphanumeric string
            if not clean_id.isalnum() and not all(c in "0123456789abcdefABCDEF-" for c in clean_id):
                raise JobNotFoundError(f"Invalid job identifier: {clean_id}")

        job_dir = settings.storage_dir / "jobs" / clean_id
        # Strict directory containment check
        try:
            job_dir.resolve().relative_to(settings.storage_dir.resolve())
        except ValueError:
            raise JobNotFoundError("Directory traversal detected.")

        return job_dir

    @classmethod
    def create_job(cls) -> JobResponse:
        job_id = str(uuid.uuid4())
        job_dir = cls.get_job_dir(job_id)
        job_dir.mkdir(parents=True, exist_ok=True)

        job_data = {
            "job_id": job_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": JobStatus.CREATED.value,
            "template": None,
            "csv_summary": None,
            "participants": [],
            "warnings": [],
            "errors": [],
        }

        cls._save_atomic(job_dir, job_data)
        return cls._to_response(job_data)

    @classmethod
    def get_job(cls, job_id: str) -> JobResponse:
        job_dir = cls.get_job_dir(job_id)
        meta_file = job_dir / "job.json"
        if not meta_file.exists():
            raise JobNotFoundError(f"Job {job_id} not found.")

        data = json.loads(meta_file.read_text(encoding="utf-8"))
        return cls._to_response(data)

    @classmethod
    def update_template(
        cls, job_id: str, template: TemplateMetadata
    ) -> JobResponse:
        job_dir = cls.get_job_dir(job_id)
        meta_file = job_dir / "job.json"
        if not meta_file.exists():
            raise JobNotFoundError(f"Job {job_id} not found.")

        data = json.loads(meta_file.read_text(encoding="utf-8"))
        data["template"] = template.model_dump()

        # Update status
        if data.get("csv_summary"):
            data["status"] = JobStatus.READY.value
        else:
            data["status"] = JobStatus.TEMPLATE_UPLOADED.value

        cls._save_atomic(job_dir, data)
        return cls._to_response(data)

    @classmethod
    def update_csv(
        cls,
        job_id: str,
        summary: CsvSummary,
        participants: List[ParticipantRecord],
        raw_csv_bytes: bytes,
    ) -> JobResponse:
        job_dir = cls.get_job_dir(job_id)
        meta_file = job_dir / "job.json"
        if not meta_file.exists():
            raise JobNotFoundError(f"Job {job_id} not found.")

        # Invalidate previous participants and persist original raw CSV
        (job_dir / "participants.csv").write_bytes(raw_csv_bytes)

        data = json.loads(meta_file.read_text(encoding="utf-8"))
        data["csv_summary"] = summary.model_dump()
        data["participants"] = [p.model_dump() for p in participants]

        if data.get("template"):
            data["status"] = JobStatus.READY.value
        else:
            data["status"] = JobStatus.CSV_UPLOADED.value

        cls._save_atomic(job_dir, data)
        return cls._to_response(data)

    @classmethod
    def get_raw_csv_bytes(cls, job_id: str) -> bytes:
        job_dir = cls.get_job_dir(job_id)
        csv_file = job_dir / "participants.csv"
        if not csv_file.exists():
            raise JobNotFoundError("CSV file does not exist for this job.")
        return csv_file.read_bytes()

    @classmethod
    def get_preview_path(cls, job_id: str) -> Path:
        job_dir = cls.get_job_dir(job_id)
        preview_path = job_dir / "preview.png"
        if not preview_path.exists():
            raise JobNotFoundError("Template preview not found.")
        return preview_path

    @classmethod
    def cleanup_job(cls, job_id: str) -> bool:
        job_dir = cls.get_job_dir(job_id)
        if job_dir.exists():
            shutil.rmtree(job_dir)
            return True
        return False

    @classmethod
    def _save_atomic(cls, job_dir: Path, data: Dict[str, Any]) -> None:
        target = job_dir / "job.json"
        tmp_target = job_dir / f"job.tmp.{uuid.uuid4().hex}"
        tmp_target.write_text(json.dumps(data, indent=2), encoding="utf-8")
        tmp_target.replace(target)

    @classmethod
    def _to_response(cls, data: Dict[str, Any]) -> JobResponse:
        participants = [ParticipantRecord(**p) for p in data.get("participants", [])]
        # Provide preview of participants (up to 50 for quick display)
        participants_preview = participants[:50]

        template_meta = (
            TemplateMetadata(**data["template"]) if data.get("template") else None
        )
        csv_meta = (
            CsvSummary(**data["csv_summary"]) if data.get("csv_summary") else None
        )

        return JobResponse(
            job_id=data["job_id"],
            created_at=datetime.fromisoformat(data["created_at"]),
            status=JobStatus(data["status"]),
            template=template_meta,
            csv_summary=csv_meta,
            participants_preview=participants_preview,
            warnings=data.get("warnings", []),
            errors=data.get("errors", []),
        )
