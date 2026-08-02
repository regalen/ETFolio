from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.models import User, ImportBatch
from app.auth.dependencies import get_current_user, require_portfolio_access
from app.services.importer import preview_import, commit_import, undo_import

router = APIRouter(prefix="/api", tags=["import"])

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
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_portfolio_access(id, "edit", current_user, db)
    content = await file.read()
    try:
        batch, affected = commit_import(db, id, file.filename or "import.csv", content)
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
