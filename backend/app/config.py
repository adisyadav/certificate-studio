from pydantic import BaseModel
from typing import List, Optional
import os


class Settings(BaseModel):
    app_name: str = "Certificate Studio"
    api_prefix: str = "/api"
    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    debug: bool = False

    @classmethod
    def load(cls) -> "Settings":
        env_origins = os.getenv("CORS_ORIGINS")
        origins = (
            [orig.strip() for orig in env_origins.split(",") if orig.strip()]
            if env_origins
            else None
        )
        debug = os.getenv("DEBUG", "false").lower() in ("1", "true", "yes")

        kwargs = {"debug": debug}
        if origins:
            kwargs["cors_origins"] = origins

        return cls(**kwargs)


settings = Settings.load()
