import os
import sys

# Ensure backend directory is in python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import IncidentReport

def seed_incidents():
    """
    Seeds sample safety incidents along Rohtak Road (West Delhi to Central Delhi)
    to dynamically demonstrate safety score calculations on Route A and Route B.
    """
    db = SessionLocal()
    try:
        # Clear existing user reports first to prevent duplicates
        print("Clearing old incident reports...")
        db.query(IncidentReport).delete()
        db.commit()

        # Define coordinates along the route
        # Route A (shorter, 14.5km) and Route B (longer, 15.5km)
        sample_incidents = [
            {
                "latitude": 28.6695,
                "longitude": 77.1325, # Near Punjabi Bagh
                "category": "poor_lighting",
                "description": "Streetlights on the main road flyover are completely broken since Tuesday."
            },
            {
                "latitude": 28.6651,
                "longitude": 77.1421, # Near Inderlok/Shastri Nagar junction
                "category": "harassment",
                "description": "Incidents of catcalling reported near the metro station exit at night."
            },
            {
                "latitude": 28.6620,
                "longitude": 77.1620, # Near Anand Parbat
                "category": "suspicious_activity",
                "description": "Groups loitering in dark alleyways. Avoid this side street alone."
            }
        ]

        print("Seeding sample incident reports...")
        for item in sample_incidents:
            point_geom = f"SRID=4326;POINT({item['longitude']} {item['latitude']})"
            report = IncidentReport(
                latitude=item["latitude"],
                longitude=item["longitude"],
                geom=point_geom,
                category=item["category"],
                description=item["description"]
            )
            db.add(report)
        
        db.commit()
        print(f"Successfully seeded {len(sample_incidents)} safety incident alerts.")
        
    except Exception as e:
        print(f"Failed to seed incidents: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_incidents()
