from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from enum import Enum
from datetime import datetime

from app.schemas.placement import PlacementRegion
from app.schemas.typography import TypographyConfig, BatchTypographyReport


class JobStatus(str, Enum):
    CREATED = "created"
    TEMPLATE_UPLOADED = "template_uploaded"
    CSV_UPLOADED = "csv_uploaded"
    READY = "ready"


class TemplateOrientation(str, Enum):
    LANDSCAPE = "landscape"
    PORTRAIT = "portrait"
    SQUARE = "square"


class TemplateMetadata(BaseModel):
    filename: str
    format: str
    width: int
    height: int
    aspect_ratio: float
    orientation: TemplateOrientation
    file_size_bytes: int
    preview_url: str


class ParticipantRecord(BaseModel):
    row_number: int
    name: str
    extra_fields: Dict[str, str] = Field(default_factory=dict)
    is_valid: bool = True
    is_duplicate: bool = False
    validation_errors: List[str] = Field(default_factory=list)


class CsvSummary(BaseModel):
    filename: str
    total_rows: int
    valid_count: int
    invalid_count: int
    duplicate_count: int
    headers: List[str]
    candidate_name_columns: List[str]
    selected_name_column: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


class JobResponse(BaseModel):
    job_id: str
    created_at: datetime
    status: JobStatus
    template: Optional[TemplateMetadata] = None
    csv_summary: Optional[CsvSummary] = None
    placement: Optional[PlacementRegion] = None
    typography: Optional[TypographyConfig] = None
    batch_analysis: Optional[BatchTypographyReport] = None
    participants_preview: List[ParticipantRecord] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


class SelectNameColumnRequest(BaseModel):
    column_name: str
