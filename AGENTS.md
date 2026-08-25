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

## Git workflow & CI/CD

`main` is the only long-lived branch and is always deployable. Never commit or push directly to `main` — all changes reach it through squash-merged pull requests.

### Authorship

The sole contributor is **regalen**. Never add `Co-Authored-By`, `Generated-by`, or any other trailer or language in commits, PRs, or release notes that attributes or references an LLM, AI assistant, or coding agent.

### Branch naming

Use short-lived branches named `<type>/<short-slug>` (kebab-case): `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/`, `perf/`.

```bash
git checkout main && git pull
git checkout -b feat/my-feature
```

Push the branch, open a PR targeting `main`, wait for CI validation, squash merge, delete the branch.

### PR titles

PR titles must be clean Conventional Commit-style lines (e.g., `feat: add DRP auto-linking`) — the squash-merge title becomes the commit on `main` and feeds release notes.

### CI pipeline

Defined in `.github/workflows/build.yml`. All jobs run on GitHub-hosted `ubuntu-latest` runners.

- **validate** (PR only): installs deps, runs `tsc --noEmit`, `npm run build`, and `pytest backend/tests/`.
- **build-and-push** (push to `main` or `v*` tag): builds `linux/amd64` Docker image, pushes to GHCR.
- **release** (`v*` tag only): creates a GitHub Release with generated notes.

Feature-branch pushes without an open PR run no CI. If `main` moves after validation, rebase and get a fresh green run before merging.

### Releases

```bash
git checkout main && git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

### Docker safety

Always `docker compose build` before `docker compose up -d` to avoid validating a stale image. Never run `docker compose down -v`, `docker volume prune`, or `docker system prune` without explicit confirmation.

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

## UI Verification & Testing Protocol (Playwright MCP)

Any task involving UI/UX modifications, frontend component updates, or layout changes **must** be visually and functionally verified using the Playwright MCP server before the task is considered complete. Type-checking and test suites verify code correctness, not feature correctness — Playwright MCP closes that gap.

### Required SOP steps

1. **Ensure the local development server is running.**
   Start the Vite dev server (`npm run dev` inside `frontend/`) and, if the change touches API-connected views, the FastAPI backend (`uvicorn` or `docker compose up`). Confirm the app is reachable (default: `http://localhost:5173`) before proceeding.

2. **Navigate and interact with the modified views using Playwright MCP tools.**
   - `browser_navigate` — open the page(s) affected by the change.
   - `browser_snapshot` — capture the accessibility tree to verify DOM structure and element presence.
   - `browser_click`, `browser_fill_form`, `browser_select_option`, `browser_press_key` — exercise interactive elements (buttons, forms, dropdowns, modals) to confirm expected state transitions.
   - `browser_take_screenshot` — capture visual output for layout, alignment, and theme verification.

3. **Verify the following before marking the task complete:**
   - **Responsiveness:** Use `browser_resize` to test at common breakpoints (mobile 375px, tablet 768px, desktop 1280px+). Confirm no horizontal overflow or broken layouts.
   - **UI state changes:** Confirm loading states, empty states, error states, and success feedback render correctly.
   - **Visual alignment:** Check spacing, typography, and component alignment against the Astryx design system expectations.
   - **Zero browser console errors:** Run `browser_console_messages` (level: `error`) after each navigation and interaction. Any unexpected errors or warnings must be investigated and resolved before completion.
   - **Light/dark mode:** If the change touches themed components, verify both modes via the app's theme toggle.

4. **Save reference screenshots when visual regression testing is required.**
   Store screenshots with descriptive filenames (e.g., `dashboard-light-desktop.png`, `holding-detail-dark-mobile.png`) in the scratchpad directory. Note any visual deviations in the task summary.

### When to skip

This protocol may be skipped **only** when the change is purely backend (no frontend files touched), purely configuration, or limited to test files. Document the skip reason in the task summary if asked.

## Environment

See `.env.example` / README.md for the full variable list (`SECRET_KEY`, `TZ`, `REGISTRATION_OPEN`, `MAX_UPLOAD_MB`, `COOKIE_SECURE`, `DATABASE_PATH`, `ATTACHMENTS_DIR`).
