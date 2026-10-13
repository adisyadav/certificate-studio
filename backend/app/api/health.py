from fastapi import APIRouter
from app.schemas.health import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    """Return application health status."""
    return HealthResponse(status="ok", app="Certificate Studio", version="0.1.0")
