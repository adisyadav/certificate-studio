from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(default="ok", description="Operational status of the service")
    app: str = Field(default="Certificate Studio", description="Application name")
    version: str = Field(default="0.1.0", description="API version")
