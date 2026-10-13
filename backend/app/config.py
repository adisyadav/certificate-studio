from pydantic import BaseModel
from typing import List
from pathlib import Path
import os


class Settings(BaseModel):
    app_name: str = "Certificate Studio"
    api_prefix: str = "/api"
    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    debug: bool = False

    # Storage and file paths
    storage_dir: Path = Path(__file__).resolve().parent.parent.parent / "storage"

    # Upload Constraints
    max_template_size_bytes: int = 20 * 1024 * 1024  # 20 MB
    max_image_dimension_px: int = 10000  # Max width or height in pixels
    max_csv_size_bytes: int = 5 * 1024 * 1024  # 5 MB
    max_csv_rows: int = 10000

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

        custom_storage = os.getenv("STORAGE_DIR")
        if custom_storage:
            kwargs["storage_dir"] = Path(custom_storage)

        return cls(**kwargs)


settings = Settings.load()
