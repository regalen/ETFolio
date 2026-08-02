# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python Backend Runtime
FROM python:3.12-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY backend/pyproject.toml ./backend/
RUN pip install --no-cache-dir ./backend

# Copy backend code
COPY backend/ ./backend/

# Copy built frontend assets from stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Setup data directories
RUN mkdir -p /data/db /data/files

ENV DATABASE_PATH=/data/db/etfolio.sqlite3 \
    ATTACHMENTS_DIR=/data/files \
    PYTHONPATH=/app/backend

EXPOSE 8000

CMD ["sh", "-c", "alembic -c backend/alembic.ini upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
