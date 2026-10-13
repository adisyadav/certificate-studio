from fastapi import APIRouter, UploadFile, File, HTTPException, status
from fastapi.responses import FileResponse
from typing import Optional

from app.schemas.job import (
    JobResponse,
    SelectNameColumnRequest,
)
from app.schemas.placement import (
    PlacementRegion,
    SavePlacementRequest,
    PlacementResponse,
)
from app.services.job_service import JobService, JobNotFoundError
from app.services.template_service import (
    TemplateService,
    TemplateProcessingError,
)
from app.services.csv_service import (
    CsvService,
    CsvProcessingError,
)

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.post("", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job() -> JobResponse:
    """Create a new certificate processing job session."""
    return JobService.create_job()


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str) -> JobResponse:
    """Retrieve details and parsed records for a job."""
    try:
        return JobService.get_job(job_id)
    except JobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )


@router.post("/{job_id}/template", response_model=JobResponse)
async def upload_template(
    job_id: str,
    file: UploadFile = File(...),
) -> JobResponse:
    """Upload certificate template (PNG, JPG, or single-page PDF)."""
    try:
        job_dir = JobService.get_job_dir(job_id)
        # Ensure job exists
        JobService.get_job(job_id)
    except JobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )

    file_bytes = await file.read()
    filename = file.filename or "template"

    try:
        metadata = TemplateService.process_and_save(
            file_bytes=file_bytes,
            filename=filename,
            job_dir=job_dir,
            job_id=job_id,
        )
        return JobService.update_template(job_id=job_id, template=metadata)
    except TemplateProcessingError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/{job_id}/template/preview")
async def get_template_preview(job_id: str):
    """Retrieve browser-compatible PNG preview of the uploaded template."""
    try:
        preview_path = JobService.get_preview_path(job_id)
        return FileResponse(
            path=str(preview_path),
            media_type="image/png",
            filename="preview.png",
        )
    except JobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template preview not found.",
        )


@router.post("/{job_id}/csv", response_model=JobResponse)
async def upload_csv(
    job_id: str,
    file: UploadFile = File(...),
) -> JobResponse:
    """Upload CSV participant list."""
    try:
        JobService.get_job(job_id)
    except JobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )

    file_bytes = await file.read()
    filename = file.filename or "participants.csv"

    try:
        summary, records = CsvService.parse_csv(
            file_bytes=file_bytes,
            filename=filename,
        )
        return JobService.update_csv(
            job_id=job_id,
            summary=summary,
            participants=records,
            raw_csv_bytes=file_bytes,
        )
    except CsvProcessingError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/{job_id}/select-name-column", response_model=JobResponse)
async def select_name_column(
    job_id: str,
    request: SelectNameColumnRequest,
) -> JobResponse:
    """Select or change the column used as participant names."""
    try:
        JobService.get_job(job_id)
        raw_bytes = JobService.get_raw_csv_bytes(job_id)
    except JobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' or CSV file not found.",
        )

    try:
        # Re-parse raw bytes using preferred column
        summary, records = CsvService.parse_csv(
            file_bytes=raw_bytes,
            filename="participants.csv",
            preferred_name_column=request.column_name,
        )
        return JobService.update_csv(
            job_id=job_id,
            summary=summary,
            participants=records,
            raw_csv_bytes=raw_bytes,
        )
    except CsvProcessingError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/{job_id}/placement", response_model=JobResponse)
async def save_placement(
    job_id: str,
    request: SavePlacementRequest,
) -> JobResponse:
    """Save normalized placement region for participant name."""
    try:
        job = JobService.get_job(job_id)
    except JobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )

    if not job.template:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot save placement without an uploaded certificate template.",
        )

    return JobService.save_placement(job_id, request.placement)


@router.get("/{job_id}/placement", response_model=PlacementResponse)
async def get_placement(job_id: str) -> PlacementResponse:
    """Retrieve saved placement region for a job."""
    try:
        placement = JobService.get_placement(job_id)
        return PlacementResponse(job_id=job_id, placement=placement)
    except JobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cleanup_job(job_id: str):
    """Delete a job and its associated files."""
    cleaned = JobService.cleanup_job(job_id)
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )
