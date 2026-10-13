from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

from app.schemas.job import TemplateMetadata
from app.schemas.placement import PlacementRegion
from app.schemas.typography import TypographyConfig


class SavePresetRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="User-defined preset name")


class PresetMetadata(BaseModel):
    preset_id: str
    name: str
    template_meta: TemplateMetadata
    placement: PlacementRegion
    typography: TypographyConfig
    created_at: str
    updated_at: str
    thumbnail_url: str


class PresetListResponse(BaseModel):
    presets: List[PresetMetadata] = Field(default_factory=list)


class UsePresetResponse(BaseModel):
    job_id: str
    preset: PresetMetadata
