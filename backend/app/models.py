import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime
from geoalchemy2 import Geometry
from app.database import Base

class CrimeBaseline(Base):
    """
    NCRB District-level Static Crime Baseline.
    Stores the geographical boundary or centroid of each district and its safety/risk factor.
    
    Why PostGIS: Plain SQL databases cannot easily represent or index arbitrary shapes (polygons/points).
    We use the Geometry column type (srid=4326) to store district geometries, allowing us to perform
    efficient spatial queries (e.g., finding which district boundaries contain a route line).
    """
    __tablename__ = "crime_baseline"

    id = Column(Integer, primary_key=True, index=True)
    district_name = Column(String(100), unique=True, nullable=False, index=True)
    risk_value = Column(Float, nullable=False)  # Normalized 0.0 (safe) to 1.0 (unsafe)
    # Stores the district polygon boundary or centroid
    geom = Column(Geometry(geometry_type='GEOMETRY', srid=4326), nullable=False)


class IncidentReport(Base):
    """
    User-submitted anonymous safety incident reports.
    Provides real-time peer reports (e.g., poor lighting, harassment) to feed the routing logic.
    """
    __tablename__ = "incident_reports"

    id = Column(Integer, primary_key=True, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    # Point representation for spatial distance queries (e.g., ST_DWithin)
    geom = Column(Geometry(geometry_type='POINT', srid=4326), nullable=False)
    category = Column(String(50), nullable=False)  # e.g., "harassment", "poor_lighting", "suspicious_activity", "other"
    description = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class SafetyGridCell(Base):
    """
    Precomputed safety cells for the heatmap overlay.
    Avoids calculating heavy spatial scoring formulas on the fly for thousands of grid points.
    We refresh this grid periodically.
    """
    __tablename__ = "safety_grid"

    id = Column(Integer, primary_key=True, index=True)
    # A 500m x 500m square polygon cell
    geom = Column(Geometry(geometry_type='POLYGON', srid=4326), nullable=False)
    safety_score = Column(Float, nullable=False)  # 0 to 100
    last_updated = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
