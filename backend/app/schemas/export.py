from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class ExportStatus(str, Enum):
    PENDING = "pending"
    VALIDATING = "validating"
    GENERATING = "generating"
    PACKAGING = "packaging"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ParticipantExportRecord(BaseModel):
    csv_row: int
    name: str
    filename: str
    fitted_font_size: int
    status: str = "success"  # 'success' | 'failed'
    error_message: Optional[str] = None


class GenerationReport(BaseModel):
    job_id: str
    export_id: str
    timestamp: str
    template_format: str
    template_dimensions: Dict[str, Any]
    font: str
    text_color: str
    alignment: str
    auto_fit_enabled: bool = True
    total_participants: int
    successful: int
    failed: int
    certificates: List[ParticipantExportRecord] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


class ExportJobResponse(BaseModel):
    export_id: str
    job_id: str
    status: ExportStatus
    created_at: str
    completed_at: Optional[str] = None
    total_count: int = 0
    processed_count: int = 0
    percent_complete: int = 0
    report: Optional[GenerationReport] = None
    error_message: Optional[str] = None
    zip_size_bytes: Optional[int] = None
