from fastapi import APIRouter
from app.api import health, jobs, typography, export

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(jobs.router, tags=["Jobs"])
api_router.include_router(typography.router, tags=["Typography & Rendering"])
api_router.include_router(export.router, tags=["Export & Download"])

