from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres_secure_pass@localhost:5432/sentinelpath"
    
    # OSRM demo server URL (free, no key required)
    OSRM_API_URL: str = "https://router.project-osrm.org/route/v1"
    
    # Overpass API URL (free, no key required)
    OVERPASS_API_URL: str = "https://overpass-api.de/api/interpreter"
    
    # Safety Score Algorithm weights (must sum to 1.0 or be normalized)
    # safety_score = 100 - (W1 * baseline_risk + W2 * incident_density + W3 * night_penalty - W4 * emergency_proximity)
    # We will configure default weights here:
    WEIGHT_BASELINE: float = 0.3      # Weight for NCRB district baseline risk (out of 100)
    WEIGHT_INCIDENTS: float = 0.4     # Weight for user-reported incident density
    WEIGHT_TIME: float = 0.15          # Weight for night penalty
    WEIGHT_EMERGENCY: float = 0.15     # Weight reduction for emergency service proximity (subtracts from risk)

    class Config:
        env_file = ".env"

settings = Settings()
