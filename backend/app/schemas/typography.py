from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum
from app.schemas.placement import PlacementRegion


class TextAlignment(str, Enum):
    CENTER = "center"
    LEFT = "left"
    RIGHT = "right"


class FontInfo(BaseModel):
    id: str
    name: str
    category: str
    filename: str
    sample_text: str = "Jane Doe"


class TypographyConfig(BaseModel):
    font_id: str = "great_vibes"
    preferred_font_size: int = Field(default=52, ge=12, le=200)
    min_font_size: int = Field(default=18, ge=8, le=100)
    text_color: str = Field(default="#111827", pattern=r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
    alignment: TextAlignment = TextAlignment.CENTER


class GlyphCheckResult(BaseModel):
    supported: bool
    unsupported_chars: List[str] = Field(default_factory=list)


class LayoutBounds(BaseModel):
    x: float
    y: float
    width: float
    height: float


class TypographyLayoutResult(BaseModel):
    font_size: int
    fits: bool
    fitted_at_reduced_size: bool
    text_bounds: LayoutBounds
    draw_position: Dict[str, float]
    warnings: List[str] = Field(default_factory=list)


class ParticipantTypographyAnalysis(BaseModel):
    row_number: int
    name: str
    fitted_font_size: int
    is_overflowing: bool
    requires_reduction: bool
    has_unsupported_glyphs: bool
    unsupported_glyphs: List[str] = Field(default_factory=list)
    visual_width: float


class BatchTypographyReport(BaseModel):
    total_analyzed: int
    all_fit: bool
    overflow_count: int
    reduction_count: int
    unsupported_glyph_count: int
    shortest_name: Optional[str] = None
    longest_name_by_chars: Optional[str] = None
    widest_name: Optional[str] = None
    widest_visual_width: float = 0.0
    participants_analysis: List[ParticipantTypographyAnalysis] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class LayoutCalculateRequest(BaseModel):
    sample_text: Optional[str] = None
    participant_row: Optional[int] = None
    placement: Optional[PlacementRegion] = None
    typography: Optional[TypographyConfig] = None


class AutoFitResponse(BaseModel):
    typography: TypographyConfig
    batch_analysis: BatchTypographyReport
    summary: str
    optimal_size: int
    all_fit: bool
    overflow_count: int

