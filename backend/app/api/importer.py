import datetime
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db import get_db, get_session_factory
from app.models.models import User, ImportBatch, Instrument
from app.auth.dependencies import get_current_user, require_portfolio_access
from app.services.importer import preview_import, commit_import, undo_import, build_import_template_csv
from app.services.pricing import backfill_prices

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["import"])


def _backfill_symbol_in_background(symbol: str, since_date: datetime.date) -> None:
    """Runs after the commit response has already been sent to the client, so
    it needs its own DB session — the request's session is closed by then."""
    db = get_session_factory()()
    try:
        inst = db.query(Instrument).filter(Instrument.symbol == symbol).first()
        if inst:
            backfill_prices(db, inst, since_date)
    except Exception:
        logger.exception(f"Background price backfill failed for {symbol}")
    finally:
        db.close()

@router.get("/import/template")
def download_import_template(current_user: User = Depends(get_current_user)):
    return Response(
        content=build_import_template_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=etfolio_trade_import_template.csv"}
    )

@router.post("/portfolios/{id}/import/preview")
async def preview_csv_import(
    id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_portfolio_access(id, "view", current_user, db)
    content = await file.read()
    return preview_import(content)

@router.post("/portfolios/{id}/import/commit")
async def commit_csv_import(
    id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_portfolio_access(id, "edit", current_user, db)
    content = await file.read()
    try:
        batch, affected, backfill_targets = commit_import(db, id, file.filename or "import.csv", content)
        for symbol, since_date in backfill_targets:
            background_tasks.add_task(_backfill_symbol_in_background, symbol, since_date)
        return {
            "batch_id": batch.id,
            "filename": batch.filename,
            "row_count": batch.row_count,
            "imported_at": batch.imported_at.isoformat()
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/import-batches/{bid}", status_code=status.HTTP_204_NO_CONTENT)
def undo_csv_import(
    bid: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    batch = db.query(ImportBatch).filter(ImportBatch.id == bid).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found")

    require_portfolio_access(batch.portfolio_id, "edit", current_user, db)

    try:
        undo_import(db, bid)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
