import json
import uuid
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple

from app.config import settings
from app.schemas.job import JobResponse
from app.schemas.export import (
    ExportStatus,
    ExportJobResponse,
    GenerationReport,
    ParticipantExportRecord,
)
from app.services.job_service import JobService, JobNotFoundError
from app.services.typography_service import TypographyService
from app.services.pdf_service import PDFService, PDFGenerationError
from app.services.zip_service import ZipService, ZipPackagingError
from app.utils.filenames import FilenameGenerator


class BatchGenerationError(Exception):
    pass


class BatchGenerationService:
    """
    Orchestrates batch certificate generation and export.
    Provides bounded local background execution, tracking progress and status.
    """

    _active_exports: Dict[str, ExportJobResponse] = {}
    _lock = threading.Lock()

    @classmethod
    def get_export_dir(cls, job_id: str, export_id: str) -> Path:
        job_dir = JobService.get_job_dir(job_id)
        return job_dir / "exports" / export_id

    @classmethod
    def start_batch_export(cls, job_id: str) -> ExportJobResponse:
        """
        Validates job configuration and initiates a background export job.
        Returns the initial ExportJobResponse.
        """
        job = JobService.get_job(job_id)

        # 1. Validation of required job configuration
        if not job.template:
            raise BatchGenerationError("Cannot export: Certificate template is missing.")
        if not job.csv_summary:
            raise BatchGenerationError("Cannot export: Participant CSV has not been uploaded.")
        if not job.placement:
            raise BatchGenerationError("Cannot export: Recipient name placement region is not set.")
        if not job.typography:
            raise BatchGenerationError("Cannot export: Typography configuration is missing.")

        participants = JobService.get_all_participants(job_id)
        valid_participants = [p for p in participants if p.is_valid and p.name.strip()]
        if not valid_participants:
            raise BatchGenerationError("Cannot export: No valid participants found in CSV.")

        # 2. Check for blocking errors in batch analysis (All-or-nothing policy for V1)
        # Verify participants with TypographyService
        blocking_errors = []
        for p in valid_participants:
            layout = TypographyService.calculate_layout(
                text=p.name,
                config=job.typography,
                placement=job.placement,
                target_width=job.template.width,
                target_height=job.template.height,
            )
            if not layout.fits:
                blocking_errors.append(
                    f"Participant '{p.name}' (row {p.row_number}) overflows the placement box "
                    f"at minimum font size {job.typography.min_font_size}px."
                )

        if blocking_errors:
            sample_errors = "\n".join(blocking_errors[:5])
            if len(blocking_errors) > 5:
                sample_errors += f"\n...and {len(blocking_errors) - 5} more."
            raise BatchGenerationError(
                f"Validation failed for batch export:\n{sample_errors}\n"
                f"Please enlarge the placement box or adjust typography settings before generating."
            )

        # 3. Create Export Job
        export_id = str(uuid.uuid4())
        export_dir = cls.get_export_dir(job_id, export_id)
        export_dir.mkdir(parents=True, exist_ok=True)

        now_str = datetime.now(timezone.utc).isoformat()
        initial_export = ExportJobResponse(
            export_id=export_id,
            job_id=job_id,
            status=ExportStatus.PENDING,
            created_at=now_str,
            total_count=len(valid_participants),
            processed_count=0,
            percent_complete=0,
        )

        with cls._lock:
            cls._active_exports[export_id] = initial_export
            cls._save_export_state(export_dir, initial_export)

        # 4. Spawn background thread
        thread = threading.Thread(
            target=cls._run_export_worker,
            args=(job_id, export_id, valid_participants),
            daemon=True,
        )
        thread.start()

        return initial_export

    @classmethod
    def get_export_status(cls, job_id: str, export_id: str) -> ExportJobResponse:
        """
        Retrieves export job status from memory or persistent export.json.
        """
        with cls._lock:
            if export_id in cls._active_exports:
                return cls._active_exports[export_id]

        export_dir = cls.get_export_dir(job_id, export_id)
        meta_file = export_dir / "export.json"
        if not meta_file.exists():
            raise BatchGenerationError(f"Export job {export_id} not found.")

        data = json.loads(meta_file.read_text(encoding="utf-8"))
        export_obj = ExportJobResponse(**data)
        with cls._lock:
            cls._active_exports[export_id] = export_obj
        return export_obj

    @classmethod
    def get_export_zip_path(cls, job_id: str, export_id: str) -> Path:
        """
        Returns verified path to completed certificates.zip.
        """
        export_dir = cls.get_export_dir(job_id, export_id)
        zip_path = export_dir / "certificates.zip"
        if not zip_path.exists():
            raise BatchGenerationError(f"Completed ZIP not found for export {export_id}")
        return zip_path

    @classmethod
    def _run_export_worker(
        cls,
        job_id: str,
        export_id: str,
        valid_participants: list,
    ) -> None:
        export_dir = cls.get_export_dir(job_id, export_id)
        pdf_output_dir = export_dir / "pdfs"
        pdf_output_dir.mkdir(parents=True, exist_ok=True)

        try:
            # Update state to validating
            cls._update_status(job_id, export_id, ExportStatus.VALIDATING)

            job = JobService.get_job(job_id)
            template_path = JobService.get_original_template_path(job_id)

            filename_gen = FilenameGenerator()
            generated_pdfs: List[Tuple[Path, str]] = []
            participant_reports: List[ParticipantExportRecord] = []

            total = len(valid_participants)

            # Update state to generating
            cls._update_status(job_id, export_id, ExportStatus.GENERATING)

            # Generate individual PDFs sequentially with bounded resource consumption
            for idx, p in enumerate(valid_participants, start=1):
                clean_name = p.name.strip()
                pdf_filename = filename_gen.get_pdf_filename(clean_name)
                target_pdf = pdf_output_dir / pdf_filename

                # Authoritative single certificate generation
                layout = PDFService.generate_certificate_pdf(
                    original_template_path=template_path,
                    template_meta=job.template,
                    placement=job.placement,
                    typography_config=job.typography,
                    participant_name=clean_name,
                    output_pdf_path=target_pdf,
                )

                generated_pdfs.append((target_pdf, pdf_filename))
                participant_reports.append(
                    ParticipantExportRecord(
                        csv_row=p.row_number,
                        name=clean_name,
                        filename=pdf_filename,
                        fitted_font_size=layout.font_size,
                        status="success",
                    )
                )

                # Update progress
                percent = int((idx / total) * 85)  # 0 to 85% is PDF generation
                cls._update_progress(job_id, export_id, idx, percent)

            # Update state to packaging
            cls._update_status(job_id, export_id, ExportStatus.PACKAGING, percent=90)

            # Generate machine-readable report
            now_iso = datetime.now(timezone.utc).isoformat()
            report = GenerationReport(
                job_id=job_id,
                export_id=export_id,
                timestamp=now_iso,
                template_format=job.template.format,
                template_dimensions={
                    "width": job.template.width,
                    "height": job.template.height,
                    "aspect_ratio": job.template.aspect_ratio,
                    "orientation": job.template.orientation,
                },
                font=job.typography.font_id,
                text_color=job.typography.text_color,
                alignment=job.typography.alignment.value,
                auto_fit_enabled=True,
                total_participants=total,
                successful=len(generated_pdfs),
                failed=0,
                certificates=participant_reports,
            )

            # Package ZIP
            zip_target = export_dir / "certificates.zip"
            zip_size = ZipService.create_certificates_zip(
                pdf_files=generated_pdfs,
                generation_report_json=report.model_dump_json(indent=2),
                output_zip_path=zip_target,
            )

            # Update state to verifying
            cls._update_status(job_id, export_id, ExportStatus.VERIFYING, percent=98)

            # Verify ZIP file exists and size > 0
            if not zip_target.exists() or zip_size <= 0:
                raise BatchGenerationError("Generated ZIP validation failed.")

            # Mark completed
            cls._complete_export(
                job_id=job_id,
                export_id=export_id,
                report=report,
                zip_size_bytes=zip_size,
            )

        except Exception as e:
            cls._fail_export(job_id, export_id, str(e))

    @classmethod
    def _update_status(
        cls,
        job_id: str,
        export_id: str,
        status: ExportStatus,
        percent: Optional[int] = None,
    ) -> None:
        export_dir = cls.get_export_dir(job_id, export_id)
        with cls._lock:
            if export_id in cls._active_exports:
                exp = cls._active_exports[export_id]
                exp.status = status
                if percent is not None:
                    exp.percent_complete = percent
                cls._save_export_state(export_dir, exp)

    @classmethod
    def _update_progress(
        cls,
        job_id: str,
        export_id: str,
        processed: int,
        percent: int,
    ) -> None:
        export_dir = cls.get_export_dir(job_id, export_id)
        with cls._lock:
            if export_id in cls._active_exports:
                exp = cls._active_exports[export_id]
                exp.processed_count = processed
                exp.percent_complete = percent
                cls._save_export_state(export_dir, exp)

    @classmethod
    def _complete_export(
        cls,
        job_id: str,
        export_id: str,
        report: GenerationReport,
        zip_size_bytes: int,
    ) -> None:
        export_dir = cls.get_export_dir(job_id, export_id)
        with cls._lock:
            if export_id in cls._active_exports:
                exp = cls._active_exports[export_id]
                exp.status = ExportStatus.COMPLETED
                exp.completed_at = datetime.now(timezone.utc).isoformat()
                exp.percent_complete = 100
                exp.processed_count = exp.total_count
                exp.report = report
                exp.zip_size_bytes = zip_size_bytes
                cls._save_export_state(export_dir, exp)

    @classmethod
    def _fail_export(cls, job_id: str, export_id: str, error_message: str) -> None:
        export_dir = cls.get_export_dir(job_id, export_id)
        with cls._lock:
            if export_id in cls._active_exports:
                exp = cls._active_exports[export_id]
                exp.status = ExportStatus.FAILED
                exp.completed_at = datetime.now(timezone.utc).isoformat()
                exp.error_message = error_message
                cls._save_export_state(export_dir, exp)

    @classmethod
    def _save_export_state(cls, export_dir: Path, exp: ExportJobResponse) -> None:
        target = export_dir / "export.json"
        tmp = export_dir / f"export.tmp.{uuid.uuid4().hex}"
        tmp.write_text(exp.model_dump_json(indent=2), encoding="utf-8")
        tmp.replace(target)
