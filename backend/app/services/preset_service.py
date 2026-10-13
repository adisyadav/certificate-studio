import json
import uuid
import shutil
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional
from PIL import Image

from app.config import settings
from app.schemas.job import TemplateMetadata, JobResponse, JobStatus
from app.schemas.placement import PlacementRegion
from app.schemas.typography import TypographyConfig
from app.schemas.preset import PresetMetadata, SavePresetRequest
from app.services.job_service import JobService, JobNotFoundError


class PresetError(Exception):
    pass


class PresetNotFoundError(PresetError):
    pass


class PresetService:
    """
    Dedicated local preset management service.
    Stores reusable certificate presets in storage/presets/{preset_id}/
    with complete independence from temporary jobs.
    """

    @classmethod
    def get_presets_root(cls) -> Path:
        presets_dir = settings.storage_dir / "presets"
        presets_dir.mkdir(parents=True, exist_ok=True)
        return presets_dir

    @classmethod
    def get_preset_dir(cls, preset_id: str) -> Path:
        clean_id = preset_id.strip()
        try:
            uuid.UUID(clean_id)
        except ValueError:
            if not clean_id.isalnum() and not all(c in "0123456789abcdefABCDEF-" for c in clean_id):
                raise PresetNotFoundError(f"Invalid preset identifier: {clean_id}")

        presets_root = cls.get_presets_root()
        preset_dir = presets_root / clean_id

        # Path traversal prevention
        try:
            preset_dir.resolve().relative_to(presets_root.resolve())
        except ValueError:
            raise PresetNotFoundError("Directory traversal detected.")

        return preset_dir

    @classmethod
    def save_preset_from_job(cls, job_id: str, name: str) -> PresetMetadata:
        """
        Creates a new preset from the specified job's active template, placement, and typography.
        Never modifies the original job files.
        """
        clean_name = name.strip()
        if not clean_name:
            raise PresetError("Preset name cannot be empty.")

        job = JobService.get_job(job_id)
        if not job.template:
            raise PresetError("Cannot save preset: Job does not contain a certificate template.")
        if not job.placement:
            raise PresetError("Cannot save preset: Recipient placement region has not been set.")
        if not job.typography:
            raise PresetError("Cannot save preset: Typography configuration is missing.")

        orig_template_path = JobService.get_original_template_path(job_id)
        if not orig_template_path.exists():
            raise PresetError("Original template file not found on disk.")

        preset_id = str(uuid.uuid4())
        preset_dir = cls.get_preset_dir(preset_id)
        preset_dir.mkdir(parents=True, exist_ok=True)

        # 1. Preserved copy of original template file
        template_ext = orig_template_path.suffix.lower()
        saved_template_path = preset_dir / f"template_original{template_ext}"
        shutil.copy2(orig_template_path, saved_template_path)

        # 2. Generate small thumbnail preview
        thumbnail_path = preset_dir / "thumbnail.png"
        try:
            if template_ext in [".png", ".jpg", ".jpeg"]:
                with Image.open(saved_template_path) as img:
                    img_thumb = img.convert("RGB")
                    img_thumb.thumbnail((400, 300))
                    img_thumb.save(thumbnail_path, format="PNG")
            elif template_ext == ".pdf":
                import fitz
                doc = fitz.open(str(saved_template_path))
                try:
                    page = doc[0]
                    pix = page.get_pixmap(dpi=72)
                    pix.save(str(thumbnail_path))
                finally:
                    doc.close()
        except Exception:
            # Non-blocking thumbnail generation fallback
            fallback_img = Image.new("RGB", (400, 280), color=(240, 240, 240))
            fallback_img.save(thumbnail_path, format="PNG")

        now_str = datetime.now(timezone.utc).isoformat()
        preset_meta = PresetMetadata(
            preset_id=preset_id,
            name=clean_name,
            template_meta=job.template,
            placement=job.placement,
            typography=job.typography,
            created_at=now_str,
            updated_at=now_str,
            thumbnail_url=f"/api/presets/{preset_id}/thumbnail",
        )

        # 3. Atomic metadata save
        cls._save_atomic(preset_dir, preset_meta)
        return preset_meta

    @classmethod
    def list_presets(cls) -> List[PresetMetadata]:
        """
        Lists all saved presets sorted by updated timestamp (newest first).
        Gracefully ignores corrupted preset folders.
        """
        presets_root = cls.get_presets_root()
        presets: List[PresetMetadata] = []

        for item in presets_root.iterdir():
            if item.is_dir():
                meta_file = item / "preset.json"
                if meta_file.exists():
                    try:
                        data = json.loads(meta_file.read_text(encoding="utf-8"))
                        presets.append(PresetMetadata(**data))
                    except Exception:
                        continue

        presets.sort(key=lambda p: p.updated_at, reverse=True)
        return presets

    @classmethod
    def get_preset(cls, preset_id: str) -> PresetMetadata:
        preset_dir = cls.get_preset_dir(preset_id)
        meta_file = preset_dir / "preset.json"
        if not meta_file.exists():
            raise PresetNotFoundError(f"Preset '{preset_id}' not found.")

        try:
            data = json.loads(meta_file.read_text(encoding="utf-8"))
            return PresetMetadata(**data)
        except Exception as e:
            raise PresetError(f"Corrupted preset metadata: {e}")

    @classmethod
    def get_preset_thumbnail_path(cls, preset_id: str) -> Path:
        preset_dir = cls.get_preset_dir(preset_id)
        if not preset_dir.exists():
            raise PresetNotFoundError(f"Preset '{preset_id}' not found.")

        thumb_path = preset_dir / "thumbnail.png"
        if thumb_path.exists():
            return thumb_path

        # If thumbnail doesn't exist, create fallback
        fallback_img = Image.new("RGB", (400, 280), color=(240, 240, 240))
        fallback_img.save(thumb_path, format="PNG")
        return thumb_path

    @classmethod
    def get_preset_template_path(cls, preset_id: str) -> Path:
        preset_dir = cls.get_preset_dir(preset_id)
        if not preset_dir.exists():
            raise PresetNotFoundError(f"Preset '{preset_id}' not found.")

        for ext in [".png", ".jpg", ".jpeg", ".pdf"]:
            cand = preset_dir / f"template_original{ext}"
            if cand.exists():
                return cand
        raise PresetError(f"Original template file for preset '{preset_id}' is missing.")

    @classmethod
    def delete_preset(cls, preset_id: str) -> None:
        """
        Safely deletes preset directory.
        Has zero impact on existing jobs or exports.
        """
        preset_dir = cls.get_preset_dir(preset_id)
        if not preset_dir.exists():
            raise PresetNotFoundError(f"Preset '{preset_id}' not found.")

        shutil.rmtree(preset_dir)

    @classmethod
    def use_preset(cls, preset_id: str) -> JobResponse:
        """
        Creates a brand-new independent job pre-populated with the preset's template,
        placement, and typography.
        Leaves CSV and participant records empty for fresh batch workflow.
        """
        preset = cls.get_preset(preset_id)
        preset_template_path = cls.get_preset_template_path(preset_id)

        # 1. Create fresh job
        new_job = JobService.create_job()
        new_job_id = new_job.job_id
        new_job_dir = JobService.get_job_dir(new_job_id)

        # 2. Copy preserved template file to new job
        template_ext = preset_template_path.suffix.lower()
        job_template_path = new_job_dir / f"template_original{template_ext}"
        shutil.copy2(preset_template_path, job_template_path)

        # 3. Update template metadata in job
        updated_template_meta = TemplateMetadata(
            filename=preset.template_meta.filename,
            format=preset.template_meta.format,
            width=preset.template_meta.width,
            height=preset.template_meta.height,
            aspect_ratio=preset.template_meta.aspect_ratio,
            orientation=preset.template_meta.orientation,
            file_size_bytes=job_template_path.stat().st_size,
            preview_url=f"/api/jobs/{new_job_id}/preview",
        )
        JobService.update_template(new_job_id, updated_template_meta)

        # 4. Copy placement and typography
        JobService.save_placement(new_job_id, preset.placement)
        JobService.save_typography_config(new_job_id, preset.typography)

        # Return refreshed job representation
        return JobService.get_job(new_job_id)

    @classmethod
    def _save_atomic(cls, preset_dir: Path, meta: PresetMetadata) -> None:
        target = preset_dir / "preset.json"
        tmp = preset_dir / f"preset.tmp.{uuid.uuid4().hex}"
        tmp.write_text(meta.model_dump_json(indent=2), encoding="utf-8")
        tmp.replace(target)
