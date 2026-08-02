import pytest
from fastapi.testclient import TestClient

def test_auth_and_portfolio_sharing(client: TestClient):
    client_a = client
    client_b = TestClient(client.app)

    # 1. Register User A and User B
    resp_a = client_a.post("/api/auth/register", json={"username": "usera", "password": "password123"})
    assert resp_a.status_code == 201
    resp_b = client_b.post("/api/auth/register", json={"username": "userb", "password": "password123"})
    assert resp_b.status_code == 201

    # 2. Login User A and User B
    login_a = client_a.post("/api/auth/login", json={"username": "usera", "password": "password123"})
    assert login_a.status_code == 200
    login_b = client_b.post("/api/auth/login", json={"username": "userb", "password": "password123"})
    assert login_b.status_code == 200

    # Check /me
    me_a = client_a.get("/api/auth/me")
    assert me_a.status_code == 200
    assert me_a.json()["username"] == "usera"

    # 3. User A creates a portfolio
    create_p = client_a.post("/api/portfolios", json={"name": "A's Portfolio"})
    assert create_p.status_code == 201
    p_id = create_p.json()["id"]
    assert create_p.json()["permission"] == "owner"

    # User B should NOT see A's portfolio initially
    list_b = client_b.get("/api/portfolios")
    assert list_b.status_code == 200
    assert len(list_b.json()) == 0

    # User B cannot view A's portfolio directly (403)
    get_b = client_b.get(f"/api/portfolios/{p_id}")
    assert get_b.status_code == 403

    # 4. User A shares portfolio view-only with User B
    share_resp = client_a.post(f"/api/portfolios/{p_id}/shares", json={"username": "userb", "permission": "view"})
    assert share_resp.status_code == 201

    # 5. User B lists portfolios — now sees A's portfolio with view permission
    list_b2 = client_b.get("/api/portfolios")
    assert list_b2.status_code == 200
    assert len(list_b2.json()) == 1
    assert list_b2.json()[0]["id"] == p_id
    assert list_b2.json()[0]["permission"] == "view"

    # User B can view details
    get_b2 = client_b.get(f"/api/portfolios/{p_id}")
    assert get_b2.status_code == 200
    assert get_b2.json()["permission"] == "view"

    # 6. User B attempts to mutate portfolio (e.g. rename) -> MUST receive 403
    rename_b = client_b.patch(f"/api/portfolios/{p_id}", json={"name": "B's Hack Name"})
    assert rename_b.status_code == 403

    # User B attempts to delete portfolio -> 403
    del_b = client_b.delete(f"/api/portfolios/{p_id}")
    assert del_b.status_code == 403

    # 7. User A updates permission to edit
    share_resp2 = client_a.post(f"/api/portfolios/{p_id}/shares", json={"username": "userb", "permission": "edit"})
    assert share_resp2.status_code == 201

    # User B can now rename
    rename_b2 = client_b.patch(f"/api/portfolios/{p_id}", json={"name": "A's Renamed Portfolio"})
    assert rename_b2.status_code == 200
    assert rename_b2.json()["name"] == "A's Renamed Portfolio"

    # But User B still cannot delete portfolio (only owner)
    del_b2 = client_b.delete(f"/api/portfolios/{p_id}")
    assert del_b2.status_code == 403

    # User A deletes portfolio
    del_a = client_a.delete(f"/api/portfolios/{p_id}")
    assert del_a.status_code == 204


def test_logout_revokes_session_token(client: TestClient):
    """Regression test for Item 4: logout must delete session row from DB and invalidate token."""
    client.post("/api/auth/register", json={"username": "revokeuser", "password": "password123"})
    login_resp = client.post("/api/auth/login", json={"username": "revokeuser", "password": "password123"})
    assert login_resp.status_code == 200

    token = client.cookies.get("session_token")
    assert token is not None

    # Logout
    logout_resp = client.post("/api/auth/logout")
    assert logout_resp.status_code == 200

    # Replay old token via Authorization: Bearer header -> MUST receive 401
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 401

