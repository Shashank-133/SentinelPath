import logging
import requests
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from geoalchemy2.shape import to_shape, from_shape
from shapely.geometry import Point, Polygon
from typing import List
from datetime import datetime

from app.config import settings
from app.database import get_db, init_db
from app.models import IncidentReport, CrimeBaseline, SafetyGridCell
from app.schemas import (
    IncidentReportCreate, IncidentReportResponse, 
    RouteResponse, SafetyScoreBreakdown, SafetyHeatmapResponse
)
from app.moderation import moderate_report
from app.scoring import calculate_route_safety, fetch_emergency_services_from_overpass

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sentinelpath.main")

app = FastAPI(
    title="SentinelPath AI Backend",
    description="Safety-oriented routing and reporting API for college minor project"
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    """
    Runs on backend startup: Initializes connection to DB, 
    creates PostGIS extension, and boots tables.
    """
    try:
        init_db()
        logger.info("Database initialized successfully with PostGIS.")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}. Ensure Docker container is running.")

@app.get("/api/ping")
def ping(db: Session = Depends(get_db)):
    """
    Health check endpoint to test connection to FastAPI and PostgreSQL/PostGIS.
    """
    try:
        # Simple query to check if DB is responsive and PostGIS is enabled
        postgis_version = db.execute(text("SELECT PostGIS_Full_Version();")).scalar()
        return {
            "status": "healthy",
            "database": "connected",
            "postgis_version": postgis_version
        }
    except Exception as e:
        logger.error(f"Database ping failed: {e}")
        return {
            "status": "partial_health",
            "database": "disconnected",
            "error": str(e)
        }

@app.post("/api/incidents", response_model=IncidentReportResponse)
def create_incident(report: IncidentReportCreate, db: Session = Depends(get_db)):
    """
    Submit an anonymous incident report.
    Validates content using rule-based moderation.
    """
    # 1. Moderation filter check
    is_approved, reasons = moderate_report(report.category, report.description)
    if not is_approved:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Report rejected by automatic moderation filters.",
                "reasons": reasons
            }
        )

    # 2. Convert lat/lng to geoalchemy2 geometry
    point_geom = f"SRID=4326;POINT({report.longitude} {report.latitude})"

    # 3. Save to database
    db_report = IncidentReport(
        latitude=report.latitude,
        longitude=report.longitude,
        geom=point_geom,
        category=report.category,
        description=report.description
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report

@app.get("/api/incidents", response_model=List[IncidentReportResponse])
def get_incidents(db: Session = Depends(get_db)):
    """
    Fetches active incident reports to draw on the map.
    """
    incidents = db.query(IncidentReport).order_by(IncidentReport.created_at.desc()).limit(150).all()
    return incidents

@app.get("/api/routes", response_model=List[RouteResponse])
def get_routes(
    start_lat: float = Query(...),
    start_lng: float = Query(...),
    end_lat: float = Query(...),
    end_lng: float = Query(...),
    db: Session = Depends(get_db)
):
    """
    Fetches alternative routes from OSRM and computes the safety score for each.
    """
    osrm_url = f"{settings.OSRM_API_URL}/driving/{start_lng},{start_lat};{end_lng},{end_lat}"
    params = {
        "overview": "full",
        "geometries": "geojson",
        "alternatives": "true"
    }

    try:
        response = requests.get(osrm_url, params=params, timeout=5)
        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"OSRM Routing service error: {response.text}"
            )
        
        data = response.json()
        routes_data = data.get("routes", [])
        if not routes_data:
            raise HTTPException(status_code=404, detail="No route found between coordinates.")
        
        calculated_routes = []
        for route in routes_data:
            geom = route.get("geometry")
            dist = route.get("distance")
            dur = route.get("duration")
            
            # Run safety scoring
            safety_score, breakdown = calculate_route_safety(geom, db)
            
            calculated_routes.append({
                "geometry": geom,
                "distance": dist,
                "duration": dur,
                "safety_score": safety_score,
                "safety_breakdown": SafetyScoreBreakdown(
                    baseline_risk_penalty=breakdown["baseline_risk_penalty"],
                    incidents_penalty=breakdown["incidents_penalty"],
                    time_penalty=breakdown["time_penalty"],
                    emergency_bonus=breakdown["emergency_bonus"],
                    final_score=breakdown["final_score"]
                ),
                "is_recommended": False  # Will update below
            })
            
        # Recommend the route with the HIGHEST safety score
        if calculated_routes:
            # Sort by safety score descending, and resolve ties using duration ascending
            calculated_routes.sort(key=lambda r: (-r["safety_score"], r["duration"]))
            calculated_routes[0]["is_recommended"] = True
            
        return calculated_routes

    except requests.exceptions.RequestException as e:
        logger.error(f"OSRM request failed: {e}")
        raise HTTPException(status_code=503, detail="Routing server is currently unreachable.")

@app.get("/api/heatmap", response_model=List[SafetyHeatmapResponse])
def get_heatmap(db: Session = Depends(get_db)):
    """
    Fetches precomputed safety grid cells to render on the map.
    """
    cells = db.query(SafetyGridCell).all()
    response_cells = []
    
    for cell in cells:
        # Convert WKB geometry to Shapely polygon
        shape = to_shape(cell.geom)
        if isinstance(shape, Polygon):
            # Extract coordinates and swap from (lon, lat) to (lat, lon) for Leaflet
            coords = [[pt[1], pt[0]] for pt in shape.exterior.coords]
            response_cells.append({
                "id": cell.id,
                "coordinates": coords,
                "safety_score": cell.safety_score
            })
            
    return response_cells

@app.post("/api/heatmap/refresh")
def refresh_heatmap(
    center_lat: float = Query(28.6139, description="Center latitude of grid coverage (default Delhi)"),
    center_lng: float = Query(77.2090, description="Center longitude of grid coverage (default Delhi)"),
    db: Session = Depends(get_db)
):
    """
    Precomputes the safety score for a grid of 500m x 500m cells.
    Refreshes the safety_grid database table.
    We cover a 10km x 10km grid area.
    """
    try:
        # Clear existing grid
        db.query(SafetyGridCell).delete()
        db.commit()

        # Step sizes in degrees (~500 meters)
        lat_step = 0.0045
        lng_step = 0.0051

        # We build a 20x20 cell grid covering roughly 10km x 10km around center
        grid_size = 10
        start_lat = center_lat - (grid_size * lat_step)
        start_lng = center_lng - (grid_size * lng_step)

        # Pre-fetch all incident reports and baselines to do matching in memory or simple DB calls
        # To avoid querying Overpass 400 times (which would block/rate limit us),
        # we do a single bounding box query from Overpass covering the entire 10km area.
        bbox = (
            center_lat - (grid_size + 1) * lat_step,
            center_lng - (grid_size + 1) * lng_step,
            center_lat + (grid_size + 1) * lat_step,
            center_lng + (grid_size + 1) * lng_step
        )
        logger.info(f"Pre-fetching Overpass safety data for bounding box: {bbox}")
        emergency_elements = fetch_emergency_services_from_overpass(bbox)

        # Separate into police and hospital coordinates
        police_points = []
        hospital_points = []
        for elem in emergency_elements:
            lat = elem.get("lat")
            lon = elem.get("lon")
            amenity = elem.get("tags", {}).get("amenity")
            if lat is not None and lon is not None:
                if amenity == "police":
                    police_points.append(Point(lon, lat))
                elif amenity == "hospital":
                    hospital_points.append(Point(lon, lat))

        logger.info(f"Found {len(police_points)} police and {len(hospital_points)} hospital nodes in grid bbox.")

        # Generate and insert cell entries
        cells_to_insert = []
        for i in range(20):
            for j in range(20):
                cell_min_lat = start_lat + (i * lat_step)
                cell_max_lat = cell_min_lat + lat_step
                cell_min_lng = start_lng + (j * lng_step)
                cell_max_lng = cell_min_lng + lng_step

                # Create polygon geometry
                poly = Polygon([
                    (cell_min_lng, cell_min_lat),
                    (cell_max_lng, cell_min_lat),
                    (cell_max_lng, cell_max_lat),
                    (cell_min_lng, cell_max_lat),
                    (cell_min_lng, cell_min_lat)
                ])

                # Get center point for safety scoring
                center_pt = poly.centroid

                # --- 1. District baseline risk ---
                poly_wkt = poly.wkt
                try:
                    district_risk = db.query(func.max(CrimeBaseline.risk_value))\
                        .filter(func.ST_Intersects(
                            CrimeBaseline.geom, 
                            func.ST_GeomFromWKT(f"SRID=4326;{poly_wkt}")
                        )).scalar()
                except Exception:
                    district_risk = 0.0
                
                if district_risk is None:
                    district_risk = 0.0
                
                baseline_penalty = district_risk * 30.0

                # --- 2. Incident reports density (within cell polygon or 200m buffer) ---
                # We can buffer the poly in degrees roughly (~0.0018 degrees)
                poly_buffered = poly.buffer(0.0018)
                buffered_wkt = poly_buffered.wkt
                
                try:
                    incident_count = db.query(func.count(IncidentReport.id))\
                        .filter(func.ST_Intersects(
                            IncidentReport.geom,
                            func.ST_GeomFromWKT(f"SRID=4326;{buffered_wkt}")
                        )).scalar()
                except Exception:
                    incident_count = 0
                
                if incident_count is None:
                    incident_count = 0
                
                incidents_penalty = min(incident_count * 10.0, 40.0)

                # --- 3. Time penalty (default night context is checked) ---
                current_hour = datetime.now().hour
                is_night = current_hour >= 21 or current_hour < 5
                time_penalty = 15.0 if is_night else 0.0

                # --- 4. Emergency services proximity ---
                # 300 meters is roughly 0.0027 degrees
                police_count = sum(1 for p in police_points if center_pt.distance(p) <= 0.0027)
                hospital_count = sum(1 for h in hospital_points if center_pt.distance(h) <= 0.0027)
                emergency_bonus = min((police_count * 10.0) + (hospital_count * 5.0), 20.0)

                # Score math
                raw_score = 100.0 - baseline_penalty - incidents_penalty - time_penalty + emergency_bonus
                safety_score = max(0.0, min(100.0, raw_score))

                # Create model instance
                geo_alchemy_geom = from_shape(poly, srid=4326)
                cell_obj = SafetyGridCell(
                    geom=geo_alchemy_geom,
                    safety_score=round(safety_score, 2)
                )
                cells_to_insert.append(cell_obj)

        db.add_all(cells_to_insert)
        db.commit()
        logger.info(f"Heatmap grid successfully refreshed with {len(cells_to_insert)} cells.")
        return {"status": "success", "cells_refreshed": len(cells_to_insert)}

    except Exception as e:
        logger.error(f"Failed to refresh safety grid: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Grid precomputation failed: {str(e)}")
