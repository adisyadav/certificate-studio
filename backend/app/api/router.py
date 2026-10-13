from fastapi import APIRouter
from app.api import health, jobs

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(jobs.router, tags=["Jobs"])
