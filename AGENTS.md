# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

ETFolio — a self-hosted, Docker-based ASX ETF portfolio and Australian tax tracker. FastAPI backend, React frontend, SQLite storage, single Docker image serving both.

## Stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.x, Alembic migrations, APScheduler for background price refresh, argon2 for password hashing, `yfinance==0.2.54` (pinned) for price data.
- **Frontend:** React 19 + TypeScript, Vite, React Router, TanStack Query, Astryx design system (`@astryxdesign/core` + `theme-neutral`), Recharts for charts.
- **Data:** SQLite at `/data/db/etfolio.sqlite3` in the container; file attachments at `/data/files`.
- **Deploy:** Single multi-stage Dockerfile (frontend build → copied into the Python runtime image), served via `docker-compose.yml`.

## Repository layout

```
backend/
  app/
    api/        # FastAPI routers, one file per resource (auth, portfolios, trades, holdings, distributions, valuation, reports, importer, attachments, tags, instruments)
    models/     # SQLAlchemy models (models.py)
    schemas/    # Pydantic request/response schemas
    services/   # Business logic — cgt.py (CGT replay engine), valuation.py, pricing.py, importer.py, reports.py, attachments.py
    auth/       # Session auth
    main.py     # App entrypoint, router registration, SPA static file mounting
    scheduler.py
  alembic/      # DB migrations
  tests/
    api/        # Integration tests against the FastAPI app
    unit/       # Unit tests, notably the CGT engine and valuation metrics
frontend/
  src/
    pages/        # Route-level components (Dashboard, Login, Register, TradeEntry, HoldingDetail, Reports, Importer, Settings)
    components/    # Shared components (Navbar, HoldingsTable, MetricCard, PortfolioAreaChart, DateRangePicker)
    theme/         # ThemeModeProvider — light/dark mode via Astryx's <Theme>, persisted to localStorage
    lib/           # routerLink.tsx (Astryx Link ↔ React Router adapter), format.ts, api client helpers
    api/           # apiFetch wrapper
  .claude/CLAUDE.md  # Astryx agent cheat sheet — read this before touching any frontend UI
```

## Backend conventions

- **Money is Decimal, always.** Never use `float` for currency, quantities, or tax calculations — the CGT replay engine and valuation metrics depend on exact decimal arithmetic.
- **CGT is a pure-function replay engine** (`app/services/cgt.py`): given the full trade/distribution history, it deterministically recomputes parcels and realised gains from scratch. Supports FIFO, LIFO, and Min-CGT (tax-minimisation) allocation methods, the 50% 12-month discount rule, and AMIT cost-base adjustments (including E4 capital gain events). When editing trades/distributions, the engine re-runs (validate-replay-on-edit) rather than patching state incrementally — don't try to special-case incremental updates.
- **Returns use the Sharesight Simple Method** (see README.md for the exact formulas: capital gain, income, total return, simple return %, annualised % p.a.). Match these formulas exactly if touching `valuation.py`.
- Permissions are portfolio-scoped: `owner` / `edit` / `view`, enforced per-request — check `tests/api/test_permission_matrix.py` for the expected matrix before changing access logic.
- Imports (CSV trade history) are preview → commit → undo, never a direct one-shot import — preserve that three-step flow if touching `importer.py`. Column detection is header-keyword based (`find_column`), not tied to any one broker's export format — a downloadable template (`build_import_template_csv`) documents the canonical column names, but Sharesight-style exports and similar still parse via the same keyword matching.

## Frontend conventions

- **UI is built on Astryx**, not raw Tailwind/CSS — Tailwind has been fully removed from this project (no config, no deps, no utility classes anywhere in `src/`). Do not reintroduce it.
- Read `frontend/.claude/CLAUDE.md` before writing any UI — it has the Astryx CLI workflow (`astryx build "<idea>"`, `astryx component <Name>`, `astryx docs <topic>`) and hard rules (no raw `<div>` for layout, components/tokens only, frame-first with Layout/AppShell).
- Every Astryx `Link`/`TopNavItem`/etc. is routed through React Router by the app-root `LinkProvider` (see `App.tsx`) using the adapter in `lib/routerLink.tsx`. For anything that must stay a real `<a>` (file downloads, external URLs), use the `PlainAnchor` export from the same file and pass it via the component's `as` prop — otherwise it will incorrectly SPA-navigate instead of downloading.
- Light/dark mode is controlled by `ThemeModeProvider` (`src/theme/ThemeModeProvider.tsx`), which wraps the app in Astryx's `<Theme mode>` plus a `LayerProvider`. The `LayerProvider` wrapper is load-bearing: Astryx's `useToast` fallback viewport portals to `document.body` by default, which sits outside the theme's `@scope`'d CSS tokens and renders unstyled — `LayerProvider` keeps the toast viewport in-tree instead. Don't remove it.
- Table columns needing sort UI must set `sortable: true` (or `{sortKey}`) — the `useTableSortable` plugin only decorates the header cell, it does not sort data; row sorting stays the consumer's responsibility.

## Known gaps / follow-ups (not blocking, but real)

- `HoldingDetail.tsx` still uses native `confirm()`/`alert()` for the two cascade-delete conflict flows (trade/distribution deletion when a linked record exists). These need a proper `AlertDialog` + pending-action state to match the rest of the app's Astryx styling.
- In `deleteTradeMutation`'s error handler (`HoldingDetail.tsx`), the retry call passes `err.message` (a string) as the trade ID on cascade retry — pre-existing bug, not yet fixed.
- Page content width is inconsistent: some pages (TradeEntry, Settings) cap their own max-width inline; others (Dashboard, Reports, HoldingDetail, Importer) run full-bleed under `AppShell`, capping only individual form-like cards (see `Importer.tsx`'s upload `Card`) rather than the whole page. Needs a deliberate decision for the remaining pages, not more inline caps.
- Any `Table` column using a fractional `proportional()` width (e.g. `proportional(0.5)`) blows up the table's derived min-width (`max(minWidth * totalProportion / proportion)` across columns) and forces horizontal overflow — use `pixel()` for narrow fixed-width columns (row numbers, chevrons) instead, per `HoldingsTable.tsx` and `Importer.tsx`.

## Commands

```bash
# Backend tests
.venv/bin/pytest backend/tests/

# Frontend — inside frontend/
npm run dev      # vite dev server, proxies /api to localhost:8000
npm run build    # tsc + vite build
npx tsc --noEmit # type-check only

# Full stack via Docker (project root)
docker compose up -d --build
```

If using Podman instead of Docker, the default socket is permission-denied — set `DOCKER_HOST=unix:///run/user/1000/podman/podman.sock` before `docker compose` commands.

## Environment

See `.env.example` / README.md for the full variable list (`SECRET_KEY`, `TZ`, `REGISTRATION_OPEN`, `MAX_UPLOAD_MB`, `COOKIE_SECURE`, `DATABASE_PATH`, `ATTACHMENTS_DIR`).
