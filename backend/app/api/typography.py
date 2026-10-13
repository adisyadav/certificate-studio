from fastapi import APIRouter, HTTPException, status, Query, Response
from typing import List, Optional

from app.schemas.typography import (
    FontInfo,
    TypographyConfig,
    BatchTypographyReport,
)
from app.schemas.job import JobResponse
from app.services.font_service import FontService, FontNotFoundError
from app.services.job_service import JobService, JobNotFoundError
from app.services.rendering_service import RenderingService, RenderingError
from app.services.batch_analysis_service import BatchAnalysisService

router = APIRouter(tags=["Typography & Rendering"])


@router.get("/fonts", response_model=List[FontInfo])
async def list_fonts() -> List[FontInfo]:
    """List bundled, legally redistributable fonts with display metadata."""
    return FontService.list_fonts()


@router.post("/jobs/{job_id}/typography", response_model=JobResponse)
async def save_typography(
    job_id: str,
    config: TypographyConfig,
) -> JobResponse:
    """Save typography preferences (font, sizes, color, alignment) for a job."""
    try:
        # Validate font exists
        FontService.get_font_path(config.font_id)
        return JobService.save_typography_config(job_id, config)
    except FontNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Font '{config.font_id}' is not supported.",
        )
    except JobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )


@router.get("/jobs/{job_id}/preview")
async def get_rendered_preview(
    job_id: str,
    participant_row: Optional[int] = Query(None, description="Optional 1-based CSV row number"),
    sample_text: Optional[str] = Query(None, description="Optional custom preview text"),
):
    """
    Render a personalized certificate preview PNG using authoritative backend typography and layout.
    """
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
            detail="Cannot render preview: No template uploaded.",
        )

    if not job.placement:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot render preview: No placement region specified.",
        )

    # Determine preview text
    text_to_render = sample_text
    if not text_to_render and participant_row is not None:
        all_participants = JobService.get_all_participants(job_id)
        match = next((p for p in all_participants if p.row_number == participant_row), None)
        if match and match.name:
            text_to_render = match.name

    if not text_to_render:
        # Fallback to first valid participant or default sample
        all_participants = JobService.get_all_participants(job_id)
        first_valid = next((p for p in all_participants if p.is_valid and p.name), None)
        text_to_render = first_valid.name if first_valid else "Jane Doe"

    template_path = JobService.get_original_template_path(job_id)
    typography_config = job.typography or TypographyConfig()

    try:
        preview_bytes, layout = RenderingService.render_certificate_preview(
            original_template_path=template_path,
            template_meta=job.template,
            placement=job.placement,
            typography_config=typography_config,
            participant_name=text_to_render,
        )

        return Response(
            content=preview_bytes,
            media_type="image/png",
            headers={
                "X-Fitted-Font-Size": str(layout.font_size),
                "X-Text-Fits": str(layout.fits).lower(),
            },
        )
    except RenderingError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post("/jobs/{job_id}/analyze-typography", response_model=BatchTypographyReport)
async def analyze_typography(job_id: str) -> BatchTypographyReport:
    """Analyze all valid participant names against the current placement and typography settings."""
    try:
        job = JobService.get_job(job_id)
    except JobNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found.",
        )

    if not job.template or not job.placement:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both template and placement are required to run typography analysis.",
        )

    participants = JobService.get_all_participants(job_id)
    config = job.typography or TypographyConfig()

    report = BatchAnalysisService.analyze_participants(
        participants=participants,
        template_meta=job.template,
        placement=job.placement,
        config=config,
    )

    # Persist report with job
    JobService.save_batch_analysis(job_id, report)
    return report
