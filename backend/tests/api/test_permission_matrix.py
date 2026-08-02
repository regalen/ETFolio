import pytest
from fastapi.testclient import TestClient

def test_permission_matrix_trades_distributions_reports_attachments(client: TestClient):
    # Register & Login users, obtaining token per user
    def create_user_client(username: str):
        c = TestClient(client.app)
        c.post("/api/auth/register", json={"username": username, "password": "password123"})
        resp = c.post("/api/auth/login", json={"username": username, "password": "password123"})
        token = c.cookies.get("session_token")
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return c, headers

    client_owner, headers_owner = create_user_client("matrix_owner")
    client_edit, headers_edit = create_user_client("matrix_editor")
    client_view, headers_view = create_user_client("matrix_viewer")
    client_none, headers_none = create_user_client("matrix_none")

    # 2. Owner creates portfolio -> 201
    p_resp = client_owner.post("/api/portfolios", json={"name": "Matrix Portfolio"}, headers=headers_owner)
    assert p_resp.status_code == 201
    p_id = p_resp.json()["id"]

    # Share permissions
    client_owner.post(f"/api/portfolios/{p_id}/shares", json={"username": "matrix_editor", "permission": "edit"}, headers=headers_owner)
    client_owner.post(f"/api/portfolios/{p_id}/shares", json={"username": "matrix_viewer", "permission": "view"}, headers=headers_owner)

    # 3. Create trade as Editor -> 201
    trade_req = {
        "symbol": "VAS.AX",
        "type": "BUY",
        "trade_date": "2025-01-15",
        "quantity": "10",
        "unit_price": "85.50",
        "brokerage": "9.95"
    }
    t_resp = client_edit.post(f"/api/portfolios/{p_id}/trades", json=trade_req, headers=headers_edit)
    assert t_resp.status_code == 201
    trade_id = t_resp.json()["id"]
    holding_id = t_resp.json()["holding_id"]

    # Viewer attempts trade create -> 403
    t_view_create = client_view.post(f"/api/portfolios/{p_id}/trades", json=trade_req, headers=headers_view)
    assert t_view_create.status_code == 403

    # None user attempts trade create -> 403
    t_none_create = client_none.post(f"/api/portfolios/{p_id}/trades", json=trade_req, headers=headers_none)
    assert t_none_create.status_code == 403

    # Viewer attempts trade edit -> 403
    t_view_edit = client_view.patch(f"/api/trades/{trade_id}", json={"notes": "Viewer edit"}, headers=headers_view)
    assert t_view_edit.status_code == 403

    # None user attempts trade edit -> 403
    t_none_edit = client_none.patch(f"/api/trades/{trade_id}", json={"notes": "None edit"}, headers=headers_none)
    assert t_none_edit.status_code == 403

    # 4. Create distribution as Editor -> 201
    dist_req = {
        "pay_date": "2025-04-15",
        "amount_per_share": "0.50",
        "gross_amount": "5.00"
    }
    d_resp = client_edit.post(f"/api/holdings/{holding_id}/distributions", json=dist_req, headers=headers_edit)
    assert d_resp.status_code == 201
    dist_id = d_resp.json()["id"]

    # Viewer attempts distribution create -> 403
    d_view_create = client_view.post(f"/api/holdings/{holding_id}/distributions", json=dist_req, headers=headers_view)
    assert d_view_create.status_code == 403

    # None user attempts distribution create -> 403
    d_none_create = client_none.post(f"/api/holdings/{holding_id}/distributions", json=dist_req, headers=headers_none)
    assert d_none_create.status_code == 403

    # 5. Read reports: Viewer -> 200, None -> 403
    r_view = client_view.get(f"/api/portfolios/{p_id}/reports/cgt?fy=2025", headers=headers_view)
    assert r_view.status_code == 200

    r_none = client_none.get(f"/api/portfolios/{p_id}/reports/cgt?fy=2025", headers=headers_none)
    assert r_none.status_code == 403

    # 6. Upload attachment as Editor -> 201
    file_tuple = ("file", ("test.pdf", b"%PDF-dummy-content", "application/pdf"))
    att_resp = client_edit.post(
        "/api/attachments",
        data={"owner_type": "trade", "owner_id": str(trade_id)},
        files=[file_tuple],
        headers=headers_edit
    )
    assert att_resp.status_code == 201
    att_id = att_resp.json()["id"]

    # Viewer attempts attachment upload -> 403
    att_view_post = client_view.post(
        "/api/attachments",
        data={"owner_type": "trade", "owner_id": str(trade_id)},
        files=[("file", ("test.pdf", b"%PDF", "application/pdf"))],
        headers=headers_view
    )
    assert att_view_post.status_code == 403

    # Viewer can read/download attachment -> 200
    att_view_get = client_view.get(f"/api/attachments/{att_id}/download", headers=headers_view)
    assert att_view_get.status_code == 200

    # None user attempts download -> 403
    att_none_get = client_none.get(f"/api/attachments/{att_id}/download", headers=headers_none)
    assert att_none_get.status_code == 403
