from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse
from typing import List

from app.schemas.preset import (
    PresetMetadata,
    PresetListResponse,
    SavePresetRequest,
    UsePresetResponse,
)
from app.schemas.job import JobResponse
from app.services.preset_service import (
    PresetService,
    PresetError,
    PresetNotFoundError,
)
from app.services.job_service import JobNotFoundError

router = APIRouter(tags=["Saved Templates & Presets"])


@router.get("/presets", response_model=PresetListResponse)
async def list_presets() -> PresetListResponse:
    """List all saved certificate template presets."""
    presets = PresetService.list_presets()
    return PresetListResponse(presets=presets)


@router.post("/jobs/{job_id}/save-preset", response_model=PresetMetadata)
async def save_preset_from_job(job_id: str, payload: SavePresetRequest) -> PresetMetadata:
    """
    Saves the configured template, placement, and typography from an active job as a reusable preset.
    """
    try:
        return PresetService.save_preset_from_job(job_id=job_id, name=payload.name)
    except JobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )
    except PresetError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/presets/{preset_id}", response_model=PresetMetadata)
async def get_preset(preset_id: str) -> PresetMetadata:
    """Retrieve details of a saved preset."""
    try:
        return PresetService.get_preset(preset_id)
    except PresetNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset '{preset_id}' not found.",
        )
    except PresetError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/presets/{preset_id}/thumbnail")
async def get_preset_thumbnail(preset_id: str):
    """Serve the thumbnail preview of a saved preset."""
    try:
        thumb_path = PresetService.get_preset_thumbnail_path(preset_id)
        return FileResponse(path=str(thumb_path), media_type="image/png")
    except PresetNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset '{preset_id}' not found.",
        )


@router.post("/presets/{preset_id}/use", response_model=JobResponse)
async def use_preset(preset_id: str) -> JobResponse:
    """
    Creates a new independent job with the template, placement, and typography
    restored from the saved preset.
    """
    try:
        return PresetService.use_preset(preset_id)
    except PresetNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset '{preset_id}' not found.",
        )
    except PresetError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/presets/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_preset(preset_id: str):
    """Delete a saved template preset without affecting existing jobs."""
    try:
        PresetService.delete_preset(preset_id)
        return None
    except PresetNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset '{preset_id}' not found.",
        )
