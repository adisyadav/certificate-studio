from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class ValidationLevel(str, Enum):
    PASSED = "passed"
    WARNING = "warning"
    BLOCKING_ERROR = "blocking_error"


class ValidationFinding(BaseModel):
    level: ValidationLevel
    category: str
    message: str
    details: Optional[Dict[str, Any]] = None
    row_number: Optional[int] = None
    participant_name: Optional[str] = None


class BatchValidationReport(BaseModel):
    is_ready_to_export: bool
    total_participants: int
    blocking_error_count: int = 0
    warning_count: int = 0
    passed_count: int = 0
    summary_message: str
    findings: List[ValidationFinding] = Field(default_factory=list)


class VisualVerificationResult(BaseModel):
    participant_name: str
    sample_type: str  # "shortest", "typical", "longest", "widest", "reduced"
    verified: bool
    ink_detected: bool
    dimensions_match: bool
    placement_aligned: bool
    notes: Optional[str] = None
