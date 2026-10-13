from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum

from app.schemas.placement import PlacementRegion


class CleanupMode(str, Enum):
    NONE = "none"
    SOLID = "solid"
    INPAINT = "inpaint"
    PDF_REDACT = "pdf_redact"


class CleanupConfig(BaseModel):
    mode: CleanupMode = CleanupMode.NONE
    region: Optional[PlacementRegion] = None
    background_color: Optional[str] = Field(default=None, pattern=r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
    auto_sample_color: bool = True
    inpaint_radius: int = Field(default=5, ge=1, le=20)


class SaveCleanupRequest(BaseModel):
    cleanup: CleanupConfig
