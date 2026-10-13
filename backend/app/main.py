from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import settings


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        description="Local-first bulk certificate generation engine",
        version="0.1.0",
        debug=settings.debug,
    )

    # Local CORS settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include API routes under configured prefix
    app.include_router(api_router, prefix=settings.api_prefix)

    return app


app = create_app()
