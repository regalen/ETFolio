import pytest
from fastapi.testclient import TestClient

def test_api_404_returns_json_not_500(client: TestClient):
    """Regression test for Item 6: unknown /api/ endpoint must return 404 JSON, not 500."""
    resp = client.get("/api/nope")
    assert resp.status_code == 404
    assert resp.headers["content-type"].startswith("application/json")
    assert resp.json() == {"detail": "Not found"}

    resp2 = client.get("/api/portfolios/99999/not_exist")
    assert resp2.status_code == 404
    assert resp2.json() == {"detail": "Not found"}


def test_spa_path_traversal_prevention(client: TestClient):
    """Regression test for Item 6: path traversal attempts outside frontend_dist must be rejected with 404."""
    resp = client.get("/..%2f..%2fetc%2fpasswd")
    assert resp.status_code == 404
    assert resp.json() == {"detail": "Not found"}

    resp2 = client.get("/..%2f..%2fdata%2fdb%2fetfolio.sqlite3")
    assert resp2.status_code == 404
    assert resp2.json() == {"detail": "Not found"}
