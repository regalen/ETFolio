from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.models import User
from app.auth.dependencies import get_current_user, require_portfolio_access
from app.services.reports import generate_cgt_report, generate_income_report, export_cgt_csv, export_income_csv

router = APIRouter(prefix="/api/portfolios", tags=["reports"])

@router.get("/{id}/reports/cgt")
def get_cgt_report(
    id: int,
    fy: int = 2026,
    format: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_portfolio_access(id, "view", current_user, db)
    report = generate_cgt_report(db, id, fy)

    if format == "csv":
        csv_data = export_cgt_csv(report)
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=cgt_report_fy{fy}.csv"}
        )
    return report

@router.get("/{id}/reports/income")
def get_income_report(
    id: int,
    fy: int = 2026,
    format: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_portfolio_access(id, "view", current_user, db)
    report = generate_income_report(db, id, fy)

    if format == "csv":
        csv_data = export_income_csv(report)
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=income_report_fy{fy}.csv"}
        )
    return report
