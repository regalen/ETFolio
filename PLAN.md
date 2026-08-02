# ETFolio — Implementation Plan & Specification

> **A lightweight, self-hosted, Docker-based ETF portfolio tracker for Australian investors.**
> This document is the complete, self-contained specification for implementing ETFolio v1. It is written so an engineer (or LLM) with no prior context can build the app. Follow it closely; where it says "MUST", treat as a hard requirement.

---

## 1. Product Overview

ETFolio is a privacy-first Sharesight alternative for Australian retail investors holding ASX-listed ETFs (e.g. DHHF, VAS, VGS, A200). It tracks multiple portfolios, buy/sell trades at parcel level, dividend distributions with franking credits and AMIT cost-base adjustments, computes parcel-level CGT with the 12-month discount, produces per-financial-year tax reports, and stores trade-confirmation attachments — all locally, with no cloud dependency except free Yahoo Finance price data.

**Confirmed product decisions (do not re-litigate):**

| Decision | Choice |
|---|---|
| Stack | Python FastAPI backend + React (Vite, TypeScript) frontend, SQLite |
| Auth | Multi-user accounts (username/password, server-side sessions); portfolio owner + optional per-user view/edit sharing |
| Currency | AUD only; ASX tickers only (Yahoo `.AX` suffix) |
| Price history | Backfill full daily history from Yahoo since first trade; daily EOD append job |
| Tax engine | Full parcel-level CGT; per-sale allocation FIFO / LIFO / min-CGT (default min-CGT); 12-month 50% discount; AMIT cost-base adjustments incl. E4 excess as capital gain; franking credits tracked |
| Distributions | Manual entry only. DRP: a "reinvested" option on the distribution form creates a linked zero-brokerage BUY; a per-holding DRP toggle pre-ticks that option |
| Import | Sharesight trade-export CSV (preview → commit → undo) |
| Reports | Per Australian FY (1 Jul – 30 Jun): realised CGT report + taxable income report, both exportable as CSV |
| V1 extras | Custom groups/tags on holdings (dashboard group-by). **Out of scope:** target prices, merge-holding, benchmarks, news, auto-fetched dividends, multi-currency |
| Return method | Sharesight "simple method" (see §7 for exact formulas) |
| Packaging | Single Docker image (backend serves built frontend), docker-compose with two named volumes (DB, attachments) |

---

## 2. Repository Layout

```
ETFolio/
├── docker-compose.yml
├── Dockerfile                     # multi-stage: node builds frontend → python image serves it
├── .env.example
├── README.md
├── PLAN.md                        # this file
├── backend/
│   ├── pyproject.toml             # fastapi, uvicorn[standard], sqlalchemy>=2.0, alembic,
│   │                              # apscheduler, yfinance (pinned), httpx, argon2-cffi,
│   │                              # python-multipart, pydantic-settings
│   ├── alembic/                   # migrations (alembic init; run `alembic upgrade head` on container start)
│   ├── app/
│   │   ├── main.py                # app factory, routers, static SPA mount, lifespan (scheduler start)
│   │   ├── config.py              # pydantic-settings: SECRET_KEY, DATABASE_PATH, ATTACHMENTS_DIR,
│   │   │                          # REGISTRATION_OPEN, MAX_UPLOAD_MB, TZ
│   │   ├── db.py                  # engine/session; pragmas: WAL, foreign_keys=ON, busy_timeout=5000
│   │   ├── scheduler.py           # APScheduler AsyncIOScheduler job definitions
│   │   ├── models/                # SQLAlchemy models per §3
│   │   ├── schemas/               # Pydantic request/response models
│   │   ├── auth/                  # password hashing, session issue/verify, dependencies
│   │   ├── api/                   # routers: auth, portfolios, instruments, holdings, trades,
│   │   │                          # distributions, valuation, reports, importer, attachments, tags
│   │   └── services/
│   │       ├── pricing.py         # Yahoo search / backfill / EOD append
│   │       ├── valuation.py       # daily value series + simple-method metrics
│   │       ├── cgt.py             # parcel replay engine (pure functions)
│   │       ├── reports.py         # FY CGT + taxable income reports
│   │       ├── importer.py        # Sharesight CSV parse/preview/commit
│   │       └── attachments.py     # file storage
│   └── tests/
│       ├── unit/                  # cgt golden cases, valuation, importer
│       └── api/                   # TestClient integration tests (Yahoo mocked with respx)
├── frontend/
│   ├── package.json               # react 18, react-router, @tanstack/react-query, recharts,
│   │                              # react-hook-form, zod, tailwindcss
│   ├── vite.config.ts             # dev proxy: /api → http://localhost:8000
│   └── src/
│       ├── api/                   # typed fetch client (credentials: 'include') + query hooks
│       ├── components/            # shared UI
│       ├── pages/                 # route components per §8
│       └── lib/                   # date-range utils, AU FY helpers, currency formatting
└── data/                          # gitignored; local dev DB + attachments
```

---

## 3. Database Schema

SQLAlchemy 2.0 + Alembic. **All money and quantity columns are stored as TEXT and handled as `decimal.Decimal` in Python. Floats are banned in every money/quantity path.** Round only at display/report boundaries (cents, half-up).

| Table | Columns (→ = FK) |
|---|---|
| `users` | id PK, username TEXT UNIQUE NOT NULL, password_hash TEXT (argon2id), created_at |
| `sessions` | id PK, token_hash TEXT UNIQUE (sha256 of random 256-bit token), user_id →users, created_at, expires_at, last_seen_at |
| `portfolios` | id PK, owner_id →users, name TEXT NOT NULL, created_at |
| `portfolio_shares` | id PK, portfolio_id →portfolios, user_id →users, permission TEXT CHECK IN ('view','edit'); UNIQUE(portfolio_id, user_id) |
| `instruments` | id PK, symbol TEXT UNIQUE (e.g. `VAS.AX`), name TEXT, exchange TEXT ('ASX'), currency TEXT ('AUD'), last_price TEXT, last_price_date DATE. **Global** — shared across all users so prices are fetched once |
| `holdings` | id PK, portfolio_id →portfolios, instrument_id →instruments, drp_enabled BOOL default false, notes TEXT default '', created_at; UNIQUE(portfolio_id, instrument_id). A holding persists at quantity 0 (fully sold) for historical reporting; explicit delete cascades trades/distributions/attachments after confirmation |
| `trades` | id PK, holding_id →holdings, type TEXT CHECK IN ('BUY','SELL'), trade_date DATE, quantity TEXT, unit_price TEXT, brokerage TEXT default '0', broker TEXT NULL, notes TEXT default '', sell_allocation_method TEXT NULL CHECK IN ('fifo','lifo','min_cgt') (required when type=SELL, NULL for BUY), source_distribution_id →distributions NULL (set on DRP-created BUYs), import_batch_id →import_batches NULL, created_at, updated_at |
| `distributions` | id PK, holding_id →holdings, pay_date DATE, ex_date DATE NULL, amount_per_share TEXT NULL, gross_amount TEXT NOT NULL, franking_credits TEXT default '0', amit_cost_base_increase TEXT default '0', amit_cost_base_decrease TEXT default '0', net_payment TEXT NOT NULL, notes TEXT default '', created_at, updated_at |
| `price_history` | id PK, instrument_id →instruments, date DATE, close TEXT; UNIQUE(instrument_id, date). Store **raw close**, not adjusted close (distributions are tracked explicitly, so adjusted close would double-count) |
| `attachments` | id PK, owner_type TEXT CHECK IN ('trade','distribution','holding'), owner_id INTEGER, filename_original TEXT, stored_path TEXT (uuid4 + original extension, relative to ATTACHMENTS_DIR), mime_type TEXT, size_bytes INTEGER, uploaded_by →users, created_at. Owner existence enforced in service layer |
| `tags` | id PK, portfolio_id →portfolios, name TEXT; UNIQUE(portfolio_id, name) |
| `holding_tags` | holding_id →holdings, tag_id →tags, PK(holding_id, tag_id) |
| `import_batches` | id PK, portfolio_id →portfolios, filename TEXT, imported_at, row_count INTEGER |

**Distribution entry rule:** the user enters *either* amount-per-share *or* gross amount; the server derives the other using units held on ex_date (fallback: pay_date) from the trade history, stores both. `net_payment` defaults to gross − any reinvested amount but is user-editable.

### Key architectural decision: no materialised parcel tables

Trades are the single source of truth. The CGT engine (§6) **replays** each holding's ordered event stream (buys, sells, AMIT adjustments) at read time to derive parcels, allocations, and realised gains. Nothing derived is persisted.

Rationale: trade edits/deletes are a core requirement. Materialised parcel/allocation rows would require cascading invalidation on every historical edit — a classic corruption source. Replay is pure, deterministic, unit-testable, and costs microseconds at realistic scale (an ETF holding has tens–hundreds of trades). Do not add caching tables in v1.

---

## 4. Backend

### 4.1 Auth (hand-rolled sessions — do NOT use fastapi-users)

- `POST /api/auth/register` — open only while `REGISTRATION_OPEN=true` (env). Validates username (3–32 chars, `[a-zA-Z0-9_.-]`), password ≥ 8 chars. Hash with argon2id.
- `POST /api/auth/login` — verify, create session (random 256-bit token; store sha256 hash; 30-day expiry, sliding `last_seen_at`), set cookie: `HttpOnly; SameSite=Lax; Path=/` (+ `Secure` when `COOKIE_SECURE=true` env).
- `POST /api/auth/logout` — delete session row, clear cookie. `GET /api/auth/me` — current user.
- Dependencies: `current_user` (401 if no valid session) and `require_portfolio(min_permission)` which resolves a portfolio id to (portfolio, effective_permission) where the owner has full access, shared users have their `portfolio_shares.permission`, and everyone else gets 403. All mutating endpoints require `edit`; reads require `view`.

### 4.2 Pricing service (`services/pricing.py`) — the ONLY module that talks to Yahoo

- `symbol_search(query)` → GET `https://query1.finance.yahoo.com/v1/finance/search?q={query}` via httpx with a browser User-Agent header; filter results to symbols ending `.AX`; return `[{symbol, name}]`. In-memory LRU cache with 24 h TTL.
- `ensure_instrument(symbol)` → validate the symbol via Yahoo, create the `instruments` row with the long name.
- `backfill(instrument, since_date)` → `yf.Ticker(symbol).history(start=since_date, interval='1d', auto_adjust=False)` → upsert `price_history` (raw Close). Called when a holding gets its first trade, and when a trade is added/edited to a date earlier than the current earliest stored price.
- `append_eod()` → for every instrument referenced by at least one holding, fetch the trailing **7 days** and upsert (idempotent; self-heals holidays and container downtime).
- Rate-limit posture: serialise all Yahoo calls through one `asyncio.Semaphore(1)` with 0.5–1 s spacing; retry with exponential backoff (3 tries) on HTTP 429/999. Pin the yfinance version in pyproject. If yfinance breaks, the fallback is the direct chart API `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=...&interval=1d` — keep all Yahoo access in this one file so a swap is contained.

### 4.3 Scheduler

APScheduler `AsyncIOScheduler` started in the FastAPI lifespan (single process, single uvicorn worker — enforce in Dockerfile CMD):
- `append_eod` daily at 18:30 `Australia/Sydney` (cron trigger with explicit timezone), `max_instances=1`.
- On startup: if the newest stored price of any active instrument is older than the last expected ASX trading day, run a catch-up fetch immediately.

### 4.4 Attachments (`services/attachments.py`)

- Save uploads to `{ATTACHMENTS_DIR}/{uuid4}{original_ext}`; record in `attachments`.
- Mime allowlist: `application/pdf`, `image/png`, `image/jpeg`, `image/heic`. Max size `MAX_UPLOAD_MB` (default 10).
- Downloads only through the authenticated endpoint (`FileResponse` with original filename). **Never** static-mount the attachments directory.
- Permission = permission on the portfolio owning the linked trade/distribution/holding.

### 4.5 Sharesight CSV importer (`services/importer.py`)

- Accepts Sharesight "All trades" export CSV. Expected columns (tolerate reordering, case differences, and extra columns): `Market, Code, Trade Date, Type, Quantity, Price, Brokerage, Currency, Comments` (Sharesight variants may use `Instrument Code`, `Transaction Type`, `Brokerage Currency` etc. — match headers case-insensitively on substrings).
- Mapping: `Code` → instrument `"{CODE}.AX"` (reject rows where Market ≠ AX/ASX with a row error); `Type` BUY/SELL (case-insensitive); dates parsed as `dd/mm/yyyy` and ISO.
- `preview(csv_bytes)` → parsed rows + per-row validation errors (unknown type, bad date, non-ASX market, qty ≤ 0…), no writes.
- `commit(csv_bytes)` → one transaction: create `import_batch`, create missing instruments/holdings, insert trades tagged with `import_batch_id`, run the oversell validation replay per affected holding (§6.4) — any failure rolls back the whole batch with row-level errors. Then trigger backfills (outside the transaction).
- Undo: `DELETE /api/import-batches/{id}` deletes the batch's trades (validation replay must still pass afterwards; otherwise reject with explanation).

---

## 5. Valuation & Daily Series (`services/valuation.py`)

- Per holding: quantity over time is a **step function** built from trades (quantity changes on `trade_date`).
- Daily market value series: for each date in range, `qty(d) × close(d)` where `close(d)` is **forward-filled** from the most recent stored close ≤ d (weekends/holidays never count as zero).
- Daily cost-base series: sum of open parcels' cost bases as of each date, from the CGT engine replay (buys add, sells remove allocated cost base, AMIT adjusts).
- Portfolio series = sum over holdings. The dashboard chart plots both series (market value area + cost base line).

---

## 6. CGT Engine (`services/cgt.py`) — pure functions, no I/O

### 6.1 Event stream & ordering

Input per holding: all BUY trades, SELL trades, and distributions that carry AMIT adjustments, sorted by date. **Same-day ordering rule (fixed):** AMIT adjustments first, then BUYs, then SELLs; ties broken by `created_at`. This makes replay deterministic.

### 6.2 State & event handling

State: ordered list of open parcels `{parcel_id (source trade id), acquire_date, qty_remaining: Decimal, cost_base_remaining: Decimal}`.

- **BUY** → append parcel; cost base = `quantity × unit_price + brokerage`.
- **AMIT adjustment** (from a distribution on its pay_date): `net = amit_cost_base_increase − amit_cost_base_decrease`, apportioned **pro-rata by units** across parcels open at pay_date. Increases raise cost base; decreases lower it. If a decrease would take a parcel's cost base below zero: clamp at zero and emit an **E4 capital-gain event** `{date: pay_date, parcel acquire_date, amount: excess, discount_eligible: held > 12 months}`. E4 gains appear as distinct "AMIT E4 gain" line items in the CGT report. (This is the correct ATO treatment; implement in v1.)
- **SELL** → allocate `quantity` across open parcels per the sale's `sell_allocation_method`. Proceeds = `quantity × unit_price − brokerage`, apportioned pro-rata across the consumed parcel quantities. Each allocation emits a realised event `{sell_date, acquire_date, qty, proceeds_share, cost_base_share, gain, discount_eligible: (gain > 0 AND held STRICTLY > 12 months)}`. Reduce/remove parcels. Overselling (qty > total open units at that date) is an error.

Output: `(open_parcels, realised_events, e4_events)`. Consumers: holding detail (cost base, cost base/share = Σcost_base / Σqty), CGT report, save-time validation.

### 6.3 Allocation methods

- **fifo** — consume oldest `acquire_date` first. **lifo** — newest first.
- **min_cgt** (default) — greedy: for each open parcel compute per-unit taxable outcome at this sale's price: `raw = unit_price_sale − cost_base_per_unit`; if `raw > 0` and parcel held > 12 months, `taxable = raw × 0.5`, else `taxable = raw`. Sort parcels ascending by `taxable` (biggest losses first, then discounted gains before equivalent raw gains) and consume in order. Greedy is optimal for a single sale since per-unit outcomes are independent.

### 6.4 Edits, deletes & validation (critical)

- There is **no derived state to invalidate** — the next read replays the updated stream.
- Every create/update/delete of a trade or distribution MUST run a **validation replay inside the same transaction**; if any SELL in the resulting stream oversells, reject (HTTP 422) with a message naming the violating sell (date, qty, available units). The event stream is therefore always consistent.
- Editing/creating a trade dated earlier than the instrument's earliest stored price → trigger backfill extension (post-commit).
- Deleting a distribution that has a linked DRP BUY (`trades.source_distribution_id`): reject unless the client passes `?cascade=true`, in which case both are deleted (one transaction + validation replay). Same in reverse for deleting the DRP BUY.

### 6.5 DRP (dividend reinvestment)

`POST /api/holdings/{hid}/distributions` accepts optional `reinvestment: {units, price}`. When present, the same transaction creates a BUY trade: same date as pay_date, given units/price, `brokerage = 0`, `source_distribution_id` set. The holding's `drp_enabled` flag only affects UI (pre-ticks the reinvested checkbox); it triggers nothing automatically.

---

## 7. Performance Metrics — Sharesight "simple method" (exact formulas)

For a period `[t0, t1]` (from the dashboard date-range picker), per holding, then aggregated:

- **Capital gain $** = `MV(t1) − MV(t0) − netInvested`, where `netInvested = Σ buy cost (incl. brokerage) − Σ sell proceeds (net of brokerage)` for trades inside the period. MV from §5 series.
- **Income $** = Σ `gross_amount` of distributions with `pay_date` in the period. Franking credits are displayed alongside but **excluded** from return math (note this in the UI footer).
- **Total return $** = capital gain $ + income $.
- **Average capital invested** = `(Σ over days d in period of costBase(d)) / N_days` (time-weighted daily average of the open-position cost base).
- **Simple return %** = `return $ / average capital invested` (guard: 0 when average invested is 0).
- **% p.a. display rule:** if the period > 12 months, annualise compound: `((1 + r)^(365.25/days)) − 1`; otherwise show the unannualised simple % (still labelled per Sharesight convention). Document this in code and README.
- Portfolio totals row: sum the $ columns; portfolio % uses portfolio-level average invested capital (never the average of per-holding percentages).

Date-range presets: Today, 7D, 12M, YTD (1 Jan), FY (current AU financial year from 1 Jul), All (since first trade), custom from/to.

---

## 8. Frontend

Stack: React 18 + Vite + TypeScript, React Router, **TanStack Query** for all server state (no Redux), **Recharts**, react-hook-form + zod, Tailwind CSS. API layer: thin typed fetch wrapper with `credentials: 'include'`; mutations invalidate portfolio-scoped query keys. 401 responses redirect to `/login`.

| Route | Screen & key components |
|---|---|
| `/login`, `/register` | Auth forms. Register hidden when registration closed |
| `/portfolios/:id` | **Dashboard** — top bar: `PortfolioSwitcher` dropdown (own + shared portfolios), holding search box, `[+ Add Investment]` button. `DateRangePicker` (Today/7D/12M/YTD/FY/All/custom). Four `MetricCards`: Portfolio value; Capital gain ($ + % p.a.); Income ($ + % p.a.); Total return ($ + % p.a.). `PortfolioAreaChart` (Recharts: market-value area + cost-base line, from `/valuation`). `HoldingsTable`: ticker+name, price, qty, value, capital gain, income, total return; sortable columns; totals row; optional group-by-tag with per-group subtotals; rows link to holding detail |
| `/portfolios/:id/trades/new` | **Trade entry** — `TickerAutocomplete` (debounced 300 ms, `/instruments/search`, `.AX` only), type BUY/SELL, date, broker (datalist: Stake, Pearler, CMC Markets, CommSec + free text), quantity, unit price, brokerage, notes, `AttachmentDropzone`. Buttons: **Save** (→ holding page) and **Save & Add Another** (clears qty/price, keeps ticker/date/broker) |
| `/portfolios/:id/holdings/:hid` | **Holding detail**, tabs: **Summary** (capital gain / distributions / total return cards; current value, qty, cost base, cost base per share; horizontal price-comparison bar: average buy price vs current price; price line chart) · **Trades & income** (trades table: date, type, qty, price, fees, value, attachment icon, edit/delete; `[+ Add trade]`; distributions table: pay date, per-share, gross, franking, AMIT adj, net, edit/delete; `[+ Add distribution]` modal with a "Reinvested" section (units + price) pre-ticked when `drp_enabled`) · **Notes & files** (autosaving textarea; attachment list w/ upload/download/delete) · **Edit holding** (DRP toggle, tag assignment multi-select, delete holding with typed confirmation) |
| `/portfolios/:id/reports` | FY selector (list FYs since first trade). **CGT report**: realised events grouped into discounted gains (shown gross and after 50%), non-discounted gains, losses, AMIT E4 gains, net taxable position. **Income report**: per-holding gross distributions, franking credits, AMIT net adjustment, totals. CSV export buttons hit `?format=csv` |
| `/portfolios/:id/import` | Upload CSV → preview table with per-row status/errors → Confirm import → success summary + undo link |
| `/portfolios/:id/settings` | Rename portfolio; sharing manager (add user by username + view/edit, list, revoke); tags CRUD; delete portfolio (owner only, typed confirmation) |

View-permission users see everything read-only (mutating controls hidden).

---

## 9. API Inventory (`/api` prefix, JSON, session cookie)

- **Auth:** `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- **Portfolios:** `GET /portfolios` (own + shared, with permission), `POST /portfolios`, `GET|PATCH|DELETE /portfolios/{id}`, `GET|POST /portfolios/{id}/shares`, `DELETE /portfolios/{id}/shares/{share_id}`
- **Instruments:** `GET /instruments/search?q=`, `GET /instruments/{id}/prices?from&to`
- **Holdings:** `GET /portfolios/{id}/holdings?from&to&group_by=tag` (rows + per-holding metrics + totals), `GET /holdings/{hid}` (summary incl. engine-derived cost base, avg buy price), `PATCH /holdings/{hid}` (drp_enabled, notes, tag_ids), `DELETE /holdings/{hid}`
- **Trades:** `GET /holdings/{hid}/trades`, `POST /portfolios/{id}/trades` (body includes symbol; auto-creates instrument+holding on first trade), `PATCH|DELETE /trades/{tid}` (delete takes `?cascade=true` for DRP-linked)
- **Distributions:** `GET /holdings/{hid}/distributions`, `POST /holdings/{hid}/distributions` (optional `reinvestment`), `PATCH|DELETE /distributions/{did}` (`?cascade=true`)
- **Valuation:** `GET /portfolios/{id}/valuation?from&to` → `{series: [{date, value, cost_base}], metrics: {...card payload...}}`
- **Reports:** `GET /portfolios/{id}/reports/cgt?fy=2026[&format=csv]`, `GET /portfolios/{id}/reports/income?fy=2026[&format=csv]` (fy=2026 means 1 Jul 2025 – 30 Jun 2026)
- **Import:** `POST /portfolios/{id}/import/preview` (multipart), `POST /portfolios/{id}/import/commit`, `DELETE /import-batches/{bid}`
- **Attachments:** `POST /attachments` (multipart: file, owner_type, owner_id), `GET /attachments/{aid}/download`, `DELETE /attachments/{aid}`
- **Tags:** `GET|POST /portfolios/{id}/tags`, `PATCH|DELETE /tags/{tid}`

Errors: consistent `{detail: string}` (or `{detail: [{row, error}]}` for import), correct status codes (401/403/404/422).

---

## 10. Docker & Deployment

**Dockerfile** (multi-stage): stage 1 `node:20-alpine` → `npm ci && npm run build` in `frontend/`; stage 2 `python:3.12-slim` → install backend, copy `frontend/dist`, entrypoint runs `alembic upgrade head` then `uvicorn app.main:app --host 0.0.0.0 --port 8000` (single worker). FastAPI mounts the SPA with fallback: `/api/*` routes first, everything else serves `index.html`/static assets.

```yaml
services:
  etfolio:
    build: .
    ports: ["8080:8000"]
    environment:
      - SECRET_KEY=${SECRET_KEY}
      - TZ=Australia/Sydney
      - REGISTRATION_OPEN=true
      - MAX_UPLOAD_MB=10
      - COOKIE_SECURE=false
    volumes:
      - etfolio-db:/data/db        # DATABASE_PATH=/data/db/etfolio.sqlite3
      - etfolio-files:/data/files  # ATTACHMENTS_DIR
volumes:
  etfolio-db:
  etfolio-files:
```

Dev mode: `uvicorn --reload` + `npm run dev` (Vite proxy `/api` → :8000).

---

## 11. Milestones (each ends runnable via `docker compose up`)

**M1 — Scaffold + auth + portfolios.** Repo layout, Dockerfile/compose, DB + Alembic baseline, register/login/logout/sessions, portfolio CRUD + sharing endpoints, frontend shell (routing, query client, auth pages, portfolio list/switcher).
*Accept:* two users can register; user A creates a portfolio, shares view-only with B; B sees it read-only; B cannot mutate (403).

**M2 — Instruments + prices + trades.** Yahoo symbol search, instrument creation, backfill + EOD scheduler + startup catch-up, trade entry page (autocomplete, Save / Save & Add Another), trades table with edit/delete, oversell validation replay.
*Accept:* adding a first BUY for `VAS` creates the instrument, backfills daily prices to the trade date, and the trade appears in the table; a SELL exceeding held units is rejected with a clear error.

**M3 — Valuation + dashboard.** Valuation service, metric formulas (§7), dashboard cards + area chart + holdings table + date ranges + totals, holding Summary tab (cards, metrics, price chart, price-comparison bar).
*Accept:* with the reference dataset (§12), dashboard totals and holding summary match the golden figures.

**M4 — Distributions + CGT engine.** Distribution CRUD with derivation rule and DRP-linked BUY, holding DRP toggle, full parcel engine (fifo/lifo/min_cgt, discount, AMIT + E4), cascade rules, cost base surfaced on holding detail, engine golden tests green.
*Accept:* all §13 CGT golden tests pass; deleting a DRP distribution without cascade is rejected.

**M5 — Reports + import + attachments + tags + polish.** FY CGT & income reports + CSV export, Sharesight CSV import (preview/commit/undo), attachments end-to-end on trades/distributions/holdings, tags + dashboard group-by, Notes & files tab, settings page, README (setup, env vars, formulas, backup notes).
*Accept:* importing a Sharesight CSV reproduces holdings/trades and can be undone; FY report numbers match golden fixtures; an uploaded PDF downloads intact with auth enforced.

---

## 12. Reference dataset (for manual verification, from the Sharesight screenshots)

Portfolio with three holdings — DHHF (91 units, ~AU$41.42, value ~$3,769.22, cost base $3,720.60, avg buy $40.688), VAS (76 units, ~$111.08, value ~$8,442.08), VGS (238 units, ~$158.99, value ~$37,839.62). Portfolio value ~AU$50,050.92.
DHHF trades: 13 Nov 2025 BUY 41 @ 40.55 + $3 fee; 13 Nov 2025 BUY 1 @ 40.46 + $3; 20 Jan 2026 BUY 4 @ 40.12 + $3; 20 Jan 2026 BUY 1 @ 40.11 + $3; 20 Apr 2026 BUY 4 @ 39.75 + $3; 21 Jul 2026 BUY 40 @ 41.00 + $3.
DHHF distributions: 19 Jan 2026 — $0.304649/share, gross $14.02, franking $1.22, net $12.80; 20 Apr 2026 — $0.142501/share, gross $8.76, franking $2.06, net $6.70; 16 Jul 2026 — $0.21268/share, gross $11.74, franking $0.89, net $10.85. Totals: gross $34.52, franking $4.17, net $30.35.
Use these as an end-to-end smoke test: enter the DHHF data, confirm cost base $3,720.60, cost base/share $40.886, and the distribution totals above.

## 13. Testing Requirements

- **CGT golden tests** (pytest, pure functions, `Decimal`, asserted to the cent):
  1. Single buy → full sell: gain and loss cases; brokerage included in cost base and deducted from proceeds.
  2. Discount boundary: parcel held exactly 365 days (no discount) vs 366+ (discount) — "strictly greater than 12 months".
  3. fifo vs lifo vs min_cgt choosing different parcels on the same stream; min_cgt consumes loss parcels first, then discounted-gain parcels before equivalent raw-gain parcels.
  4. Partial parcel consumption across multiple sells.
  5. AMIT increase and decrease pro-rata across multiple parcels; adjustment applied after a partial sell only touches remaining parcels.
  6. E4: decrease exceeding a parcel's cost base → parcel clamps to 0, E4 gain event emitted with correct amount and discount eligibility.
  7. DRP: reinvested distribution creates a parcel at the reinvestment price with zero brokerage.
  8. Same-day ordering (AMIT → buy → sell); oversell rejection; edit that shrinks an earlier buy invalidating a later sell is rejected.
- **Valuation tests:** step quantities; forward-fill across weekends/holidays; §7 formulas vs hand-computed fixtures; annualisation cutover at 12 months; zero-invested guard.
- **Importer tests:** representative Sharesight CSVs incl. header variants, dd/mm/yyyy dates, non-ASX row rejection, all-or-nothing commit.
- **API tests:** httpx TestClient + temp SQLite; permission matrix (owner / edit / view / none) across every mutating endpoint; Yahoo mocked with `respx`.
- **Frontend:** Vitest for FY/date-range/formatting utils. (Playwright smoke optional.)

## 14. Risks & Required Mitigations

- **Yahoo instability** (429s, UA blocking, schema drift): all price data persisted locally; Yahoo touched only by backfill/EOD/search; retries + backoff; yfinance pinned; all Yahoo code isolated in `pricing.py`.
- **Historical edits:** structurally solved by replay-on-read + in-transaction validation replay (§6.4). Never persist derived parcel state.
- **ASX holidays / price gaps:** forward-fill last close; trailing-7-day idempotent EOD fetch; missing date ≠ zero.
- **Money correctness:** Decimal end-to-end; TEXT storage; rounding only at report/display boundaries.
- **SQLite concurrency:** WAL + busy_timeout + exactly one uvicorn worker.
- **Timezones:** trade/pay dates are naive dates interpreted in Australia/Sydney; single shared FY helper on each side (FY *N* = 1 Jul *N−1* → 30 Jun *N*).
