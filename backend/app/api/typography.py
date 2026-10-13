from fastapi import APIRouter, HTTPException, status, Query, Response
from typing import List, Optional

from app.schemas.typography import (
    FontInfo,
    TypographyConfig,
    TypographyLayoutResult,
    BatchTypographyReport,
    LayoutCalculateRequest,
    AutoFitResponse,
)

from app.schemas.job import JobResponse
from app.services.font_service import FontService, FontNotFoundError
from app.services.job_service import JobService, JobNotFoundError
from app.services.rendering_service import RenderingService, RenderingError
from app.services.typography_service import TypographyService
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


@router.get("/jobs/{job_id}/layout", response_model=TypographyLayoutResult)
async def get_text_layout(
    job_id: str,
    participant_row: Optional[int] = Query(None, description="Optional 1-based CSV row number"),
    sample_text: Optional[str] = Query(None, description="Optional custom preview text"),
) -> TypographyLayoutResult:
    """
    Lightweight authoritative layout calculation using saved job settings.
    """
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
            detail="Template and placement are required to calculate layout.",
        )

    text_to_render = sample_text
    if not text_to_render and participant_row is not None:
        all_participants = JobService.get_all_participants(job_id)
        match = next((p for p in all_participants if p.row_number == participant_row), None)
        if match and match.name:
            text_to_render = match.name

    if not text_to_render:
        all_participants = JobService.get_all_participants(job_id)
        first_valid = next((p for p in all_participants if p.is_valid and p.name), None)
        text_to_render = first_valid.name if first_valid else "Jane Doe"

    typography_config = job.typography or TypographyConfig()

    layout = TypographyService.calculate_layout(
        text=text_to_render,
        config=typography_config,
        placement=job.placement,
        target_width=job.template.width,
        target_height=job.template.height,
    )
    return layout


@router.post("/jobs/{job_id}/layout/calculate", response_model=TypographyLayoutResult)
async def calculate_text_layout_in_memory(
    job_id: str,
    payload: LayoutCalculateRequest,
) -> TypographyLayoutResult:
    """
    Lightweight authoritative layout calculation with in-memory overrides.
    Does not require saving placement or typography to disk first, eliminating feedback loops.
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
            detail="Template is required to calculate layout.",
        )

    active_placement = payload.placement or job.placement
    if not active_placement:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Placement region is required to calculate layout.",
        )

    active_typography = payload.typography or job.typography or TypographyConfig()

    text_to_render = payload.sample_text
    if not text_to_render and payload.participant_row is not None:
        all_participants = JobService.get_all_participants(job_id)
        match = next((p for p in all_participants if p.row_number == payload.participant_row), None)
        if match and match.name:
            text_to_render = match.name

    if not text_to_render:
        all_participants = JobService.get_all_participants(job_id)
        first_valid = next((p for p in all_participants if p.is_valid and p.name), None)
        text_to_render = first_valid.name if first_valid else "Jane Doe"

    layout = TypographyService.calculate_layout(
        text=text_to_render,
        config=active_typography,
        placement=active_placement,
        target_width=job.template.width,
        target_height=job.template.height,
    )
    return layout


@router.get("/jobs/{job_id}/preview")
async def get_rendered_preview(
    job_id: str,
    participant_row: Optional[int] = Query(None, description="Optional 1-based CSV row number"),
    sample_text: Optional[str] = Query(None, description="Optional custom preview text"),
):
    """
    Render personalized certificate preview PNG on the blank template.
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
    """Analyze all valid participant names against current placement and typography settings."""
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

    JobService.save_batch_analysis(job_id, report)
    return report


@router.post("/jobs/{job_id}/auto-fit", response_model=AutoFitResponse)
async def auto_fit_typography(job_id: str) -> AutoFitResponse:
    """
    Intelligently auto-fits typography across all valid participants:
    1. Preserves font_id, text_color, and alignment.
    2. Calculates the optimal preferred_font_size ensuring short/standard names
       are prominently readable while outlier names downscale safely.
    3. Saves optimized typography to the job.
    4. Automatically generates and stores an updated BatchTypographyReport.
    5. Returns the updated configuration, batch report, and summary message.
    """
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
            detail="Both template and placement are required to auto-fit typography.",
        )

    participants = JobService.get_all_participants(job_id)
    valid_names = [p.name.strip() for p in participants if p.is_valid and p.name.strip()]

    current_config = job.typography or TypographyConfig()

    # Determine optimal preferred font size
    optimal_size = TypographyService.optimize_typography_for_batch(
        names=valid_names if valid_names else ["Jane Doe"],
        config=current_config,
        placement=job.placement,
        target_width=job.template.width,
        target_height=job.template.height,
    )

    optimized_config = TypographyConfig(
        font_id=current_config.font_id,
        preferred_font_size=optimal_size,
        min_font_size=current_config.min_font_size,
        text_color=current_config.text_color,
        alignment=current_config.alignment,
        sizing_mode=current_config.sizing_mode,
        vertical_clearance_percent=current_config.vertical_clearance_percent,
        horizontal_clearance_percent=current_config.horizontal_clearance_percent,
    )

    # Save to job
    JobService.save_typography_config(job_id, optimized_config)

    # Run batch analysis
    report = BatchAnalysisService.analyze_participants(
        participants=participants,
        template_meta=job.template,
        placement=job.placement,
        config=optimized_config,
    )
    JobService.save_batch_analysis(job_id, report)

    # Format user-facing summary
    total = report.total_analyzed
    overflows = report.overflow_count
    reductions = report.reduction_count

    if overflows > 0:
        summary = (
            f"Optimized font size to {optimal_size}px. Warning: {overflows} of {total} names still exceed "
            f"the designated area at min font size ({optimized_config.min_font_size}px). Consider widening the placement box."
        )
    elif reductions > 0:
        summary = (
            f"Successfully auto-fitted all {total} names! Preferred size set to {optimal_size}px. "
            f"{reductions} longer names will scale down gracefully."
        )
    else:
        summary = (
            f"Successfully auto-fitted all {total} names! Preferred size set to {optimal_size}px with zero overflows."
        )

    return AutoFitResponse(
        typography=optimized_config,
        batch_analysis=report,
        summary=summary,
        optimal_size=optimal_size,
        all_fit=report.all_fit,
        overflow_count=overflows,
    )

