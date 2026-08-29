from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

# Create database engine
# For geospatial queries, we use psycopg2 which connects to PostGIS
engine = create_engine(settings.DATABASE_URL)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative base class for models
Base = declarative_base()

def init_db():
    """
    Initializes the database by creating the postgis extension if not exists,
    and creating all tables.
    """
    # Open connection and execute CREATE EXTENSION
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
        conn.commit()
    
    # Create all tables defined in models.py
    Base.metadata.create_all(bind=engine)

def get_db():
    """
    Dependency to get a database session per request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
