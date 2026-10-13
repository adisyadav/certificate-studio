from pydantic import BaseModel, Field, model_validator
from typing import Optional


class PlacementRegion(BaseModel):
    x: float = Field(..., ge=0.0, le=1.0, description="Normalized X coordinate (0.0 to 1.0)")
    y: float = Field(..., ge=0.0, le=1.0, description="Normalized Y coordinate (0.0 to 1.0)")
    width: float = Field(..., gt=0.0, le=1.0, description="Normalized width (0.0 to 1.0)")
    height: float = Field(..., gt=0.0, le=1.0, description="Normalized height (0.0 to 1.0)")

    @model_validator(mode="after")
    def validate_bounds(self) -> "PlacementRegion":
        # Allow tiny epsilon for floating point representation tolerance
        epsilon = 0.0001
        if self.x + self.width > 1.0 + epsilon:
            raise ValueError(
                f"Region exceeds horizontal bounds: x ({self.x}) + width ({self.width}) = {self.x + self.width:.4f} > 1.0"
            )
        if self.y + self.height > 1.0 + epsilon:
            raise ValueError(
                f"Region exceeds vertical bounds: y ({self.y}) + height ({self.height}) = {self.y + self.height:.4f} > 1.0"
            )
        return self


class SavePlacementRequest(BaseModel):
    placement: PlacementRegion


class PlacementResponse(BaseModel):
    job_id: str
    placement: Optional[PlacementRegion] = None
