from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional

class IncidentReportCreate(BaseModel):
    latitude: float = Field(..., ge=-90, le=90, description="Latitude of incident")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude of incident")
    category: str = Field(..., description="Category of incident: poor_lighting, harassment, suspicious_activity, other")
    description: Optional[str] = Field(None, max_length=500, description="Optional text description")

class IncidentReportResponse(BaseModel):
    id: int
    latitude: float
    longitude: float
    category: str
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class SafetyScoreBreakdown(BaseModel):
    baseline_risk_penalty: float
    incidents_penalty: float
    time_penalty: float
    emergency_bonus: float
    final_score: float

class RouteResponse(BaseModel):
    geometry: dict  # GeoJSON representation
    distance: float  # In meters
    duration: float  # In seconds
    safety_score: float  # 0 to 100
    safety_breakdown: SafetyScoreBreakdown
    is_recommended: bool

class SafetyHeatmapResponse(BaseModel):
    id: int
    coordinates: List[List[float]]  # Array of [lat, lng] representing polygon corners
    safety_score: float
