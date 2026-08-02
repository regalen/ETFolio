import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from app.api import (
    auth,
    portfolios,
    instruments,
    trades,
    distributions,
    holdings,
    valuation,
    reports,
    importer,
    attachments,
    tags,
)
from app.scheduler import start_scheduler, stop_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: start scheduler
    start_scheduler()
    yield
    # Shutdown: stop scheduler
    stop_scheduler()

app = FastAPI(title="ETFolio API", version="0.1.0", lifespan=lifespan)

# CORS middleware for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth.router)
app.include_router(portfolios.router)
app.include_router(instruments.router)
app.include_router(trades.router)
app.include_router(distributions.router)
app.include_router(holdings.router)
app.include_router(valuation.router)
app.include_router(reports.router)
app.include_router(importer.router)
app.include_router(attachments.router)
app.include_router(tags.router)

# Mount SPA static files if built frontend exists
frontend_dist = os.path.realpath(os.path.join(os.path.dirname(__file__), "../../frontend/dist"))

if os.path.exists(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if full_path == "api" or full_path.startswith("api/"):
        return JSONResponse({"detail": "Not found"}, status_code=404)

    if not os.path.exists(frontend_dist):
        return JSONResponse({"detail": "Frontend assets not found"}, status_code=404)

    target_path = os.path.realpath(os.path.join(frontend_dist, full_path))
    if os.path.commonpath([target_path, frontend_dist]) != frontend_dist:
        return JSONResponse({"detail": "Not found"}, status_code=404)

    if os.path.isfile(target_path):
        return FileResponse(target_path)

    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)

    return JSONResponse({"detail": "Not found"}, status_code=404)
