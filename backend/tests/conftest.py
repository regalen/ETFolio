import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings

# Disable scheduler and set testing flag BEFORE app import
settings.TESTING = True
settings.SCHEDULER_ENABLED = False

from app.db import get_db, set_session_factory, Base
from app.main import app

@pytest.fixture(autouse=True)
def setup_test_db(tmp_path):
    db_file = tmp_path / "test_db.sqlite3"
    db_url = f"sqlite:///{db_file}"

    test_engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False}
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    Base.metadata.create_all(bind=test_engine)
    set_session_factory(TestingSessionLocal)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    yield TestingSessionLocal

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)

@pytest.fixture
def client(setup_test_db):
    with TestClient(app) as c:
        yield c
