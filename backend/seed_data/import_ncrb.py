import os
import csv
import sys
from sqlalchemy import func

# Ensure backend directory is in python path so app modules can be loaded
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, init_db
from app.models import CrimeBaseline

def seed_crime_data():
    """
    Reads static district-level crime data from NCRB baseline CSV 
    and imports it into the crime_baseline table.
    
    Design Choice Note for College Viva:
    This dataset represents official annual crime statistics (NCRB baseline risk indexes).
    We store the geometries (polygons) of the districts. During routing queries, 
    the backend automatically detects which district the user's route passes through 
    and applies the corresponding baseline risk factor. This is a robust and honest 
    implementation for version 1, serving as a solid benchmark.
    """
    csv_file_path = os.path.join(os.path.dirname(__file__), "ncrb_districts.csv")
    
    if not os.path.exists(csv_file_path):
        print(f"Error: CSV file not found at {csv_file_path}")
        return

    print("Initializing database and ensuring PostGIS extension is loaded...")
    init_db()
    
    db = SessionLocal()
    try:
        # Clear existing baseline entries to prevent duplicates (idempotent seeding)
        print("Clearing old crime baseline data...")
        db.query(CrimeBaseline).delete()
        db.commit()

        print("Importing district-level crime rates from NCRB CSV...")
        with open(csv_file_path, mode="r", encoding="utf-8") as file:
            reader = csv.DictReader(file)
            count = 0
            for row in reader:
                district_name = row["district_name"]
                risk_value = float(row["risk_value"])
                geom_wkt = row["geom_wkt"]
                
                # We use PostGIS ST_GeomFromText to convert WKT polygons to spatial objects in SRID 4326 (WGS 84 GPS coordinates)
                geom_spatial = func.ST_GeomFromText(geom_wkt, 4326)
                
                baseline = CrimeBaseline(
                    district_name=district_name,
                    risk_value=risk_value,
                    geom=geom_spatial
                )
                db.add(baseline)
                count += 1
            
            db.commit()
            print(f"Successfully seeded {count} NCRB districts.")
            
    except Exception as e:
        print(f"Seeding failed due to error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_crime_data()
