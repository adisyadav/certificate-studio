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
from app.schemas.validation import (
    ValidationLevel,
    BatchValidationReport,
    VisualVerificationResult,
)
from app.services.job_service import JobService, JobNotFoundError
from app.services.typography_service import TypographyService
from app.services.pdf_service import PDFService, PDFGenerationError
from app.services.zip_service import ZipService, ZipPackagingError
from app.services.validation_service import ValidationService, ValidationError
from app.utils.filenames import FilenameGenerator


class BatchGenerationError(Exception):
    pass


class BatchGenerationService:
    """
    Orchestrates batch certificate generation and export with:
    1. Pre-export Quality Assurance verification pipeline.
    2. Bounded local background concurrency (semaphore).
    3. Immutable configuration snapshot isolation.
    4. Incremental PDF generation with immediate resource cleanup.
    5. Post-generation structural and visual output verification.
    6. Atomic ZIP publication.
    7. Stale export state detection and recovery.
    """

    _active_exports: Dict[str, ExportJobResponse] = {}
    _lock = threading.Lock()
    _semaphore = threading.Semaphore(2)  # Bounded concurrency: max 2 simultaneous active batch workers

    @classmethod
    def get_export_dir(cls, job_id: str, export_id: str) -> Path:
        job_dir = JobService.get_job_dir(job_id)
        return job_dir / "exports" / export_id

    @classmethod
    def reconcile_stale_exports(cls, job_id: str) -> None:
        """
        Scans export directories for the given job.
        If an export was left in an in-progress state (e.g., server was restarted while generating),
        reconciles it safely to 'failed' rather than leaving it indefinitely spinning.
        """
        job_dir = JobService.get_job_dir(job_id)
        exports_root = job_dir / "exports"
        if not exports_root.exists():
            return

        for export_path in exports_root.iterdir():
            if export_path.is_dir():
                meta_file = export_path / "export.json"
                if meta_file.exists():
                    try:
                        data = json.loads(meta_file.read_text(encoding="utf-8"))
                        status = data.get("status")
                        export_id = data.get("export_id")
                        if status in [
                            ExportStatus.PENDING.value,
                            ExportStatus.VALIDATING.value,
                            ExportStatus.GENERATING.value,
                            ExportStatus.PACKAGING.value,
                            ExportStatus.VERIFYING.value,
                        ]:
                            with cls._lock:
                                # If it's not currently tracked in active memory, it was orphaned by server restart
                                if export_id not in cls._active_exports:
                                    data["status"] = ExportStatus.FAILED.value
                                    data["completed_at"] = datetime.now(timezone.utc).isoformat()
                                    data["error_message"] = (
                                        "Export was interrupted by a server restart or process termination. "
                                        "You may safely retry this export."
                                    )
                                    meta_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
                    except Exception:
                        pass

    @classmethod
    def validate_job_readiness(cls, job_id: str) -> BatchValidationReport:
        """
        Authoritative pre-export QA validation pipeline.
        Evaluates template integrity, participant records, placement, font glyphs, and layout containment.
        """
        job = JobService.get_job(job_id)
        template_path = JobService.get_original_template_path(job_id) if job.template else None
        participants = JobService.get_all_participants(job_id)

        report = ValidationService.validate_pre_export(
            template_meta=job.template,
            template_file_path=template_path,
            placement=job.placement,
            typography=job.typography,
            participants=participants,
        )
        return report

    @classmethod
    def start_batch_export(cls, job_id: str) -> ExportJobResponse:
        """
        Validates job configuration and initiates a bounded background export job.
        Captures an immutable configuration snapshot before launching the worker.
        """
        cls.reconcile_stale_exports(job_id)
        job = JobService.get_job(job_id)
        template_path = JobService.get_original_template_path(job_id)

        # 1. Run full Quality Assurance pre-flight validation
        validation_report = cls.validate_job_readiness(job_id)
        if not validation_report.is_ready_to_export:
            blocking = [f.message for f in validation_report.findings if f.level == ValidationLevel.BLOCKING_ERROR]
            sample_errors = "\n".join(blocking[:5])
            if len(blocking) > 5:
                sample_errors += f"\n...and {len(blocking) - 5} more."
            raise BatchGenerationError(
                f"Export quality checks failed:\n{sample_errors}\n"
                f"Please adjust settings or recipient area before generating."
            )

        participants = JobService.get_all_participants(job_id)
        valid_participants = [p for p in participants if p.is_valid and p.name.strip()]

        # 2. Create isolated Export Directory
        export_id = str(uuid.uuid4())
        export_dir = cls.get_export_dir(job_id, export_id)
        export_dir.mkdir(parents=True, exist_ok=True)

        # 3. Create Immutable Configuration Snapshot
        snapshot_data = {
            "job_id": job_id,
            "export_id": export_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "template": job.template.model_dump(),
            "placement": job.placement.model_dump(),
            "typography": job.typography.model_dump(),
            "participants": [p.model_dump() for p in valid_participants],
            "validation_summary": validation_report.model_dump(),
        }
        (export_dir / "config_snapshot.json").write_text(
            json.dumps(snapshot_data, indent=2), encoding="utf-8"
        )

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

        # 4. Spawn background thread with bounded semaphore
        thread = threading.Thread(
            target=cls._run_export_worker_bounded,
            args=(job_id, export_id, snapshot_data, template_path),
            daemon=True,
        )
        thread.start()

        return initial_export

    @classmethod
    def get_export_status(cls, job_id: str, export_id: str) -> ExportJobResponse:
        """
        Retrieves export job status from memory or persistent export.json.
        Reconciles stale exports if necessary.
        """
        with cls._lock:
            if export_id in cls._active_exports:
                return cls._active_exports[export_id]

        cls.reconcile_stale_exports(job_id)

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
    def _run_export_worker_bounded(
        cls,
        job_id: str,
        export_id: str,
        snapshot_data: dict,
        template_path: Path,
    ) -> None:
        """
        Executes export under semaphore to constrain simultaneous resource utilization.
        """
        cls._semaphore.acquire()
        try:
            cls._run_export_worker(job_id, export_id, snapshot_data, template_path)
        finally:
            cls._semaphore.release()

    @classmethod
    def _run_export_worker(
        cls,
        job_id: str,
        export_id: str,
        snapshot_data: dict,
        template_path: Path,
    ) -> None:
        export_dir = cls.get_export_dir(job_id, export_id)
        pdf_output_dir = export_dir / "pdfs"
        pdf_output_dir.mkdir(parents=True, exist_ok=True)

        try:
            cls._update_status(job_id, export_id, ExportStatus.VALIDATING)

            # Reconstruct models from immutable snapshot
            from app.schemas.job import TemplateMetadata, ParticipantRecord
            from app.schemas.placement import PlacementRegion
            from app.schemas.typography import TypographyConfig

            template_meta = TemplateMetadata(**snapshot_data["template"])
            placement = PlacementRegion(**snapshot_data["placement"])
            typography = TypographyConfig(**snapshot_data["typography"])
            participants = [ParticipantRecord(**p) for p in snapshot_data["participants"]]

            total = len(participants)
            filename_gen = FilenameGenerator()
            generated_pdfs: List[Tuple[Path, str]] = []
            participant_reports: List[ParticipantExportRecord] = []

            # Update status to generating
            cls._update_status(job_id, export_id, ExportStatus.GENERATING)

            # Incremental generation: process sequentially without holding full-res images in memory
            for idx, p in enumerate(participants, start=1):
                clean_name = p.name.strip()
                pdf_filename = filename_gen.get_pdf_filename(clean_name)
                target_pdf = pdf_output_dir / pdf_filename

                # Authoritative single certificate generation
                layout = PDFService.generate_certificate_pdf(
                    original_template_path=template_path,
                    template_meta=template_meta,
                    placement=placement,
                    typography_config=typography,
                    participant_name=clean_name,
                    output_pdf_path=target_pdf,
                )

                # Verify single PDF structure immediately
                ValidationService.verify_single_generated_pdf(
                    pdf_path=target_pdf,
                    expected_meta=template_meta,
                    expected_name=clean_name,
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

                # Update progress (0% -> 80% is generation)
                percent = int((idx / total) * 80)
                cls._update_progress(job_id, export_id, idx, percent)

            # Post-generation Visual Verification on representative samples
            cls._update_status(job_id, export_id, ExportStatus.VERIFYING, percent=85)
            cls._run_representative_visual_checks(
                generated_pdfs=generated_pdfs,
                template_path=template_path,
                template_meta=template_meta,
                placement=placement,
                typography=typography,
            )

            # Packaging
            cls._update_status(job_id, export_id, ExportStatus.PACKAGING, percent=90)

            # Compile machine-readable generation report
            now_iso = datetime.now(timezone.utc).isoformat()
            report = GenerationReport(
                job_id=job_id,
                export_id=export_id,
                timestamp=now_iso,
                template_format=template_meta.format,
                template_dimensions={
                    "width": template_meta.width,
                    "height": template_meta.height,
                    "aspect_ratio": template_meta.aspect_ratio,
                    "orientation": template_meta.orientation,
                },
                font=typography.font_id,
                text_color=typography.text_color,
                alignment=typography.alignment.value,
                auto_fit_enabled=True,
                total_participants=total,
                successful=len(generated_pdfs),
                failed=0,
                certificates=participant_reports,
            )

            # Atomic ZIP creation: write to temporary file first, then atomically replace
            zip_final = export_dir / "certificates.zip"
            zip_temp = export_dir / f"certificates.tmp.{uuid.uuid4().hex}.zip"

            try:
                zip_size = ZipService.create_certificates_zip(
                    pdf_files=generated_pdfs,
                    generation_report_json=report.model_dump_json(indent=2),
                    output_zip_path=zip_temp,
                )
                if not zip_temp.exists() or zip_size <= 0:
                    raise BatchGenerationError("ZIP archive generation produced empty or missing file.")
                # Atomic publication
                zip_temp.replace(zip_final)
            except Exception as e:
                if zip_temp.exists():
                    zip_temp.unlink()
                raise BatchGenerationError(f"Atomic ZIP packaging failed: {e}")

            # Mark complete
            cls._complete_export(
                job_id=job_id,
                export_id=export_id,
                report=report,
                zip_size_bytes=zip_final.stat().st_size,
            )

        except Exception as e:
            cls._fail_export(job_id, export_id, str(e))

    @classmethod
    def _run_representative_visual_checks(
        cls,
        generated_pdfs: List[Tuple[Path, str]],
        template_path: Path,
        template_meta: Any,
        placement: Any,
        typography: Any,
    ) -> None:
        """
        Runs visual verification on representative outputs (first, middle, last).
        Ensures PDF visual raster has non-blank ink and matches expected page boundaries.
        """
        if not generated_pdfs:
            return

        sample_indices = [0, len(generated_pdfs) // 2, len(generated_pdfs) - 1]
        for idx in set(sample_indices):
            pdf_path, _ = generated_pdfs[idx]
            # Verify visual rendering
            res = ValidationService.verify_visual_rendering(
                generated_pdf_path=pdf_path,
                original_template_path=template_path,
                template_meta=template_meta,
                placement=placement,
                typography=typography,
                participant_name=f"Sample #{idx+1}",
                sample_type="representative",
            )
            if not res.verified:
                raise BatchGenerationError(
                    f"Visual quality verification failed for certificate '{pdf_path.name}': {res.notes}"
                )

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
