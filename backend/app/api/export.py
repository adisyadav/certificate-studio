from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.schemas.export import ExportJobResponse
from app.services.job_service import JobService, JobNotFoundError
from app.services.batch_generation_service import (
    BatchGenerationService,
    BatchGenerationError,
)

router = APIRouter(tags=["Export & Download"])


@router.post("/jobs/{job_id}/exports", response_model=ExportJobResponse)
async def start_export(job_id: str) -> ExportJobResponse:
    """
    Initiates a batch certificate export for all valid participants.
    Returns the newly created export job details.
    """
    try:
        JobService.get_job(job_id)
    except JobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )

    try:
        return BatchGenerationService.start_batch_export(job_id)
    except BatchGenerationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/jobs/{job_id}/exports/{export_id}", response_model=ExportJobResponse)
async def get_export_status(job_id: str, export_id: str) -> ExportJobResponse:
    """
    Polls the progress, status, and completion report of a batch export job.
    """
    try:
        JobService.get_job(job_id)
    except JobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )

    try:
        return BatchGenerationService.get_export_status(job_id, export_id)
    except BatchGenerationError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.get("/jobs/{job_id}/exports/{export_id}/download")
async def download_export_zip(job_id: str, export_id: str):
    """
    Downloads the completed certificates.zip file.
    Only available after export job status is 'completed'.
    """
    try:
        JobService.get_job(job_id)
    except JobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )

    try:
        export_job = BatchGenerationService.get_export_status(job_id, export_id)
    except BatchGenerationError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )

    if export_job.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Export is not completed yet (current status: {export_job.status}).",
        )

    zip_path = BatchGenerationService.get_export_zip_path(job_id, export_id)
    return FileResponse(
        path=str(zip_path),
        media_type="application/zip",
        filename="certificates.zip",
        headers={
            "Content-Disposition": 'attachment; filename="certificates.zip"',
        },
    )
