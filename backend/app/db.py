import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.config import settings

# Ensure parent directory of database exists
db_dir = os.path.dirname(settings.DATABASE_PATH)
if db_dir:
    os.makedirs(db_dir, exist_ok=True)

# Ensure sqlite URL prefix
db_url = f"sqlite:///{settings.DATABASE_PATH}"

engine = create_engine(
    db_url,
    connect_args={"check_same_thread": False},
    future=True,
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
_session_factory = SessionLocal

def get_session_factory():
    return _session_factory

def set_session_factory(factory):
    global _session_factory
    _session_factory = factory

Base = declarative_base()

def get_db():
    factory = get_session_factory()
    db = factory()
    try:
        yield db
    finally:
        db.close()
