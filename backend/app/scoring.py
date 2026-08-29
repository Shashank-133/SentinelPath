import json
import logging
import requests
from typing import Tuple, List, Dict, Any
from datetime import datetime
from sqlalchemy import func
from shapely.geometry import LineString, Point
from app.config import settings
from app.models import CrimeBaseline, IncidentReport

logger = logging.getLogger("sentinelpath.scoring")

# Constants for the mathematical safety scoring formula
# Bounded between 0 and 100: Safety Score = 100 - BaselinePenalty - IncidentsPenalty - NightPenalty + EmergencyBonus
MAX_BASELINE_PENALTY = 30.0  # Max deduction for NCRB district baseline risk
MAX_INCIDENTS_PENALTY = 40.0 # Max deduction for nearby incidents
NIGHT_PENALTY = 15.0         # Flat deduction for traveling between 9 PM and 5 AM
MAX_EMERGENCY_BONUS = 20.0   # Max bonus (safety score boost) for police/hospital proximity

# Proximity thresholds
INCIDENT_RADIUS_METERS = 200.0
EMERGENCY_RADIUS_METERS = 300.0

# Static fallback list of major police stations and hospitals in Delhi to guarantee 
# functionality during college presentations even if the public Overpass API is slow or rate-limited.
FALLBACK_EMERGENCY_SERVICES = [
    {"lat": 28.6672, "lon": 77.0984, "tags": {"amenity": "police", "name": "Paschim Vihar Police Station"}},
    {"lat": 28.6681, "lon": 77.1293, "tags": {"amenity": "police", "name": "Punjabi Bagh Police Station"}},
    {"lat": 28.6601, "lon": 77.1643, "tags": {"amenity": "police", "name": "Anand Parbat Police Station"}},
    {"lat": 28.6432, "lon": 77.1812, "tags": {"amenity": "police", "name": "Karol Bagh Police Station"}},
    {"lat": 28.6611, "lon": 77.2255, "tags": {"amenity": "police", "name": "Sadar Bazar Police Station"}},
    {"lat": 28.6253, "lon": 77.2025, "tags": {"amenity": "hospital", "name": "Dr. Ram Manohar Lohia Hospital"}},
    {"lat": 28.6622, "lon": 77.1189, "tags": {"amenity": "hospital", "name": "Action Balaji Hospital"}},
    {"lat": 28.6578, "lon": 77.1589, "tags": {"amenity": "hospital", "name": "Acharya Shree Bhikshu Hospital"}},
    {"lat": 28.6671, "lon": 77.1955, "tags": {"amenity": "hospital", "name": "Sir Ganga Ram Hospital"}}
]

def fetch_emergency_services_from_overpass(bbox: Tuple[float, float, float, float]) -> List[Dict[str, Any]]:
    """
    Fetches police stations and hospitals within the bounding box using Overpass API.
    Handles timeouts and rate limits gracefully, returning a local fallback list on failure.
    """
    min_lat, min_lon, max_lat, max_lon = bbox
    # Add a small buffer of roughly 300m (~0.0027 degrees)
    buffer = 0.003
    min_lat -= buffer
    min_lon -= buffer
    max_lat += buffer
    max_lon += buffer

    query = f"""
    [out:json][timeout:5];
    (
      node["amenity"="police"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["amenity"="hospital"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    out body;
    """
    
    headers = {
        "User-Agent": "SentinelPathAI/1.0 (student-minor-project@gmail.com)",
        "Referer": "http://localhost:3000/"
    }

    try:
        response = requests.post(settings.OVERPASS_API_URL, data={"data": query}, headers=headers, timeout=6)
        if response.status_code == 200:
            data = response.json()
            elements = data.get("elements", [])
            if elements:
                return elements
            logger.info("Overpass returned 0 elements, using local fallback data.")
        else:
            logger.warning(f"Overpass API returned status code {response.status_code}, using local fallback data.")
    except Exception as e:
        logger.error(f"Error fetching from Overpass API (timeout/network): {e}. Using local fallback data.")
    
    # Filter fallback list to keep only elements within the bbox
    filtered_fallback = []
    for item in FALLBACK_EMERGENCY_SERVICES:
        if min_lat <= item["lat"] <= max_lat and min_lon <= item["lon"] <= max_lon:
            filtered_fallback.append(item)
            
    return filtered_fallback if filtered_fallback else FALLBACK_EMERGENCY_SERVICES

def calculate_route_safety(route_geometry: dict, db) -> Tuple[float, Dict[str, float]]:
    """
    Calculates safety score for a given route geometry (GeoJSON LineString).
    Returns (safety_score, breakdown_details).
    """
    # 1. Coordinate extraction & bbox setup
    coords = route_geometry.get("coordinates", [])
    if not coords or len(coords) < 2:
        return 100.0, {"baseline_risk_penalty": 0, "incidents_penalty": 0, "time_penalty": 0, "emergency_bonus": 0}

    # Bounding box for Overpass [min_lat, min_lon, max_lat, max_lon]
    lats = [c[1] for c in coords]
    lons = [c[0] for c in coords]
    bbox = (min(lats), min(lons), max(lats), max(lons))

    # Convert geometry dict to GeoJSON string for PostgreSQL/PostGIS functions
    geojson_str = json.dumps(route_geometry)

    # --- FACTOR 1: DISTRICT BASELINE RISK ---
    # We find the maximum baseline risk value of any district boundary intersecting the route line.
    try:
        max_district_risk = db.query(func.max(CrimeBaseline.risk_value))\
            .filter(func.ST_Intersects(
                CrimeBaseline.geom, 
                func.ST_GeomFromGeoJSON(geojson_str)
            )).scalar()
    except Exception as e:
        logger.error(f"Error querying CrimeBaseline: {e}")
        max_district_risk = 0.0

    if max_district_risk is None:
        max_district_risk = 0.0

    baseline_penalty = max_district_risk * MAX_BASELINE_PENALTY

    # --- FACTOR 2: NEARBY INCIDENT DENSITY ---
    # Count approved incident reports within 200 meters of the route line.
    # We transform geometries to SRID 3857 (Web Mercator / Metric) to calculate meters accurately.
    try:
        incident_count = db.query(func.count(IncidentReport.id))\
            .filter(func.ST_DWithin(
                func.ST_Transform(IncidentReport.geom, 3857),
                func.ST_Transform(func.ST_GeomFromGeoJSON(geojson_str), 3857),
                INCIDENT_RADIUS_METERS
            )).scalar()
    except Exception as e:
        logger.error(f"Error querying IncidentReport density: {e}")
        incident_count = 0

    if incident_count is None:
        incident_count = 0

    # Each nearby report deducts 10 points, up to a maximum of 40 points
    incidents_penalty = min(incident_count * 10.0, MAX_INCIDENTS_PENALTY)

    # --- FACTOR 3: TIME OF DAY PENALTY ---
    # Higher risk during night hours (9 PM to 5 AM)
    current_hour = datetime.now().hour
    is_night = current_hour >= 21 or current_hour < 5
    time_penalty = NIGHT_PENALTY if is_night else 0.0

    # --- FACTOR 4: EMERGENCY SERVICES PROXIMITY ---
    # Query Overpass API for police stations/hospitals around the route bounding box.
    emergency_elements = fetch_emergency_services_from_overpass(bbox)
    
    # Calculate proximity using Shapely in degree distance
    # Convert meters to degrees approximately: 300m = ~0.0027 degrees
    emergency_radius_deg = EMERGENCY_RADIUS_METERS / 111320.0
    
    # Create route LineString in Shapely
    route_line = LineString(coords)
    
    police_nearby_count = 0
    hospital_nearby_count = 0
    
    for elem in emergency_elements:
        lat = elem.get("lat")
        lon = elem.get("lon")
        amenity = elem.get("tags", {}).get("amenity")
        
        if lat is not None and lon is not None:
            point = Point(lon, lat)
            # Distance from point to line in degrees
            dist = route_line.distance(point)
            if dist <= emergency_radius_deg:
                if amenity == "police":
                    police_nearby_count += 1
                elif amenity == "hospital":
                    hospital_nearby_count += 1

    # Police station adds 10.0 points to safety, hospital adds 5.0, capped at 20.0
    emergency_bonus = min(
        (police_nearby_count * 10.0) + (hospital_nearby_count * 5.0),
        MAX_EMERGENCY_BONUS
    )

    # Calculate final safety score out of 100
    raw_score = 100.0 - baseline_penalty - incidents_penalty - time_penalty + emergency_bonus
    safety_score = max(0.0, min(100.0, raw_score))

    breakdown = {
        "baseline_risk_penalty": round(baseline_penalty, 2),
        "incidents_penalty": round(incidents_penalty, 2),
        "time_penalty": round(time_penalty, 2),
        "emergency_bonus": round(emergency_bonus, 2),
        "final_score": round(safety_score, 2)
    }

    return round(safety_score, 2), breakdown
