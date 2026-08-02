# ETFolio — Code Review: First Pass Fix List

You are fixing defects found in review of your first implementation pass of ETFolio. `PLAN.md` remains the authoritative spec. Work through **Batch 1 in order** (each item is a confirmed defect), then Batch 2, then Batch 3 as time allows. For every fix in Batch 1, add or extend a test that would have caught the bug. Run the full test suite after each batch. **Do not commit anything** — leave all changes uncommitted in the working tree.

---

## Batch 1 — Critical (mandatory, in order)

### 1. App crashes on startup under Python 3.12 (Docker) — missing import
`backend/app/services/importer.py` line 23 uses `Optional[int]` in an annotation, but `Optional` is not imported (line 4 only imports `List, Dict, Any, Tuple`). Python 3.14 (your local env) evaluates annotations lazily so tests pass; Python 3.12 in the Dockerfile evaluates them at import time → `NameError` when `app.main` loads the importer router, and the container never boots.
**Fix:** add `Optional` to the typing import. Then grep the whole backend for other annotations using names that aren't imported.

### 2. Capital gain metric double-counts trades made on the period start date
`backend/app/services/valuation.py` (`compute_holding_metrics`): `capital_gain = MV(t1) − MV(t0) − netInvested`, but `MV(t0)` is the value *after* t0's trades (the daily series uses `trade_date <= curr_date`) while `netInvested` counts trades in `[t0, t1]` inclusive — so trades on t0 are subtracted twice. With the default "All" preset, t0 = the first trade date, so **every portfolio is affected**. Reproduced: buy 10 @ $100 + $5 fee with a flat price → reported capital gain −$1,005 instead of −$5.
**Fix:** treat `MV(t0)` as the *opening* value — quantity and cost base built from trades strictly **before** t0 — while keeping `netInvested` over `[t0, t1]` inclusive. (Equivalent alternative: keep closing MV(t0) and count only trades in `(t0, t1]`; pick one, document it, apply it consistently to the cost-base/average-invested series too.)
**Test:** unit test with a flat price series asserting capital gain equals −brokerage for a single buy on t0; extend `test_reference_dataset.py` to assert the capital-gain metric, not just cost base.

### 3. CSV import is not atomic
`backend/app/services/importer.py` (`commit_import`) calls `ensure_instrument()` per row, and `ensure_instrument` in `backend/app/services/pricing.py` does `db.commit()`. Each commit persists the batch row and all trades flushed so far, so a later `OversellError` "rollback" leaves a half-imported batch in the database — violating PLAN §4.5 (all-or-nothing).
**Fix:** make `ensure_instrument` transaction-neutral (`db.flush()` only, no commit/refresh); commit exactly once at the end of `commit_import` (and adjust `create_trade` in `api/trades.py`, which also relies on it).
**Test:** import a CSV whose last row oversells; assert zero trades, zero holdings, and no import_batch row persist.

### 4. Logout does not revoke the session
`backend/app/api/auth.py` (`logout`) only clears the cookie. The session row stays valid for 30 days and remains usable via the `Authorization: Bearer` header path in `auth/dependencies.py`. `delete_session()` in `auth/sessions.py` is written but never called.
**Fix:** in logout, read the token from the request and call `delete_session(db, token)` before clearing the cookie.
**Test:** login, logout, then replay the old token via Bearer header → expect 401.

### 5. CGT report applies capital losses AFTER the 50% discount
`backend/app/services/reports.py` line ~95 nets `total_losses` against post-discount gains. ATO methodology: offset current-year losses against **gross** gains first (against non-discounted gains first, which benefits the taxpayer), then apply the 50% discount to the remaining discountable gains. The current code also miscalculates `carry_forward_loss`. Example: $100 gross discounted gain + $100 loss must yield $0 taxable and $0 carried forward; current code yields $0 taxable with $50 carried forward.
**Fix:** restructure the summary: losses → non-discounted gains (incl. non-discount-eligible E4) first, remainder → gross discounted gains (incl. discount-eligible E4), then halve what's left of the discounted pool. Keep the per-parcel line items as they are; only the summary math changes.
**Test:** golden test for the $100/$100 example plus a mixed case (loss partially absorbed by non-discounted gains, remainder against discounted).

### 6. SPA catch-all: path traversal + broken API 404s
`backend/app/main.py` (`serve_spa`): (a) `os.path.join(frontend_dist, full_path)` is never checked to stay inside `frontend_dist` — encoded `..` segments can serve arbitrary files readable by the process (including `/data/db/etfolio.sqlite3`); (b) unmatched `api/` paths return `FileResponse(status_code=404, path="")`, which raises and turns into a 500.
**Fix:** resolve with `os.path.realpath` and reject unless `os.path.commonpath([resolved, frontend_dist]) == frontend_dist`; return `JSONResponse({"detail": "Not found"}, status_code=404)` for `api/` paths.
**Test:** request `/..%2f..%2fetc%2fpasswd`-style paths → 404; unknown `/api/nope` → JSON 404, not 500.

### 7. Every trade create/edit re-downloads full price history from Yahoo, synchronously
`backend/app/api/trades.py` calls `backfill_prices(inst, trade_date)` unconditionally on every create and update — a full history fetch inside the request. Entering 20 historical trades via "Save & Add Another" = 20 full-history Yahoo hits; this will get rate-limited/banned, and each save blocks for seconds. PLAN §6.4 says to backfill only when the trade date precedes the earliest stored price.
**Fix:** before calling, query the earliest `price_history.date` for the instrument; skip the fetch unless the trade date is earlier (or there are no prices at all). Prefer running the fetch as a FastAPI `BackgroundTask`. Also give the sync `backfill_prices` path the same politeness the async search has: serialised access, delay between calls, retry with exponential backoff on 429/999 (PLAN §4.2).

### 8. Startup blocks on Yahoo for every boot
`backend/app/scheduler.py` (`start_scheduler`) calls `run_eod_job()` synchronously inside the FastAPI lifespan — the app can't serve requests until a 7-day fetch completes for every instrument, and it runs regardless of freshness. PLAN §4.3: catch-up only when the newest stored price is older than the last expected trading day, and never blocking startup.
**Fix:** schedule the catch-up as a one-shot job (`scheduler.add_job(run_eod_job)` with an immediate/`next_run_time=now` trigger) and add the staleness check inside `append_eod` (skip instruments whose latest price is already current).

---

## Batch 2 — Important (after Batch 1)

9. **Metric cards don't match PLAN §7 / dashboard spec.** The backend returns a single combined return %; the frontend (`Dashboard.tsx`) shows the *total* return % on the Capital Gain card and no income % at all, and the Portfolio Value card subtitle labels *average capital invested* as "Cost base". Return separate `capital_gain_pct`, `income_pct`, and `total_return_pct` (each following the §7 annualisation rule: capital-gain-$/avg-invested, income-$/avg-invested, sum) and wire each card to its own figure; subtitle should show the actual closing cost base.
10. **Distribution PATCH doesn't re-derive.** In `api/distributions.py`, editing `amount_per_share` leaves `gross_amount` stale and vice versa; there is no way to remove a reinvestment or clear `ex_date`. Re-run the create-time derivation when either amount field changes; support `reinvestment: null` (delete the linked BUY, with validation replay) and explicit ex_date clearing.
11. **`yfinance==0.2.40` pin is ~2 years stale** and likely broken against current Yahoo endpoints. Bump to a current release, run one real fetch inside the Docker image as a smoke test, and keep the pin exact.
12. **Valuation performance.** `compute_holding_daily_series` re-replays the full CGT event stream for every day in the range and rebuilds quantity with an O(trades) loop per day. Convert to a single chronological pass: walk dates once, applying trades/AMIT events incrementally as their date is reached (quantity, cost base, and forward-filled price all maintained in the same sweep).
13. **Per-request session write.** `get_current_user` commits `last_seen_at` on every request. Only write when it is more than ~5 minutes stale.
14. **Sliding expiry.** PLAN §4.1 specifies a 30-day sliding session; `expires_at` is currently fixed at creation. Extend `expires_at` when refreshing `last_seen_at` (same throttled write).
15. **`SECRET_KEY` is dead config.** It is loaded in `config.py` and set in compose but used nowhere. Either use it (e.g. HMAC session tokens instead of bare sha256) or delete it from config, compose, and `.env.example`.

---

## Batch 3 — Minor / polish

16. **Test gaps vs PLAN §13:** engine-level edit-invalidation golden test (shrink an earlier BUY, assert the replay raises), valuation formula unit tests (forward-fill across gaps, annualisation cutover at >365 days, zero-invested guard), permission matrix (owner/edit/view/none) over trades, distributions, reports, and attachments endpoints.
17. **Alembic cwd dependence:** `script_location = backend/alembic` only resolves from the repo root. Use `%(here)s/alembic` so it works from `backend/` too.
18. **Repo hygiene:** delete stray `test_features.db`, `test_m1.db`, `test_ref.db` from the repo root (point tests at tmp_path fixtures); add `*.egg-info/` and `*.db` to `.gitignore`; remove `backend/etfolio_backend.egg-info/` from the tree.
19. **Holdings endpoint:** drop the ignored `group_by` query param (grouping is client-side), and add a true `average_buy_price` field (purchase-price average from BUY trades only — distinct from cost-base-per-share once AMIT adjustments apply) for the Summary tab's price-comparison bar.
20. **Deprecation debt:** replace `datetime.utcnow()` with `datetime.now(datetime.UTC)` throughout (80 warnings in the test run); package `backend/app` properly in `pyproject.toml` instead of relying on `PYTHONPATH` in the Dockerfile.

---

## Definition of done
- All batches' fixes applied (Batch 3 items may be deferred with a note in `QUESTIONS.md` if genuinely out of time).
- `pytest backend/tests -q` fully green, including the new regression tests for items 1–8.
- `docker compose up --build` boots cleanly on Python 3.12 and serves the frontend.
- Nothing committed to git.

---

# Round 2 — remaining items after second-pass review (2026-08-02)

Second pass verified: items 1–10 and 13–15 are correctly fixed (capital-gain reproduction now returns the right figure; loss-offset ordering, SPA traversal guard, conditional background backfill, non-blocking startup, session revocation/HMAC/sliding expiry all confirmed). The items below are what's left. **Do not commit anything.**

### R1. Test suite is RED — `test_trade_oversell_rejection_and_drp_cascade` fails (mandatory)
`bg_backfill` in `backend/app/api/trades.py` opens `app.db.SessionLocal()` — the *global* engine — while tests override only the `get_db` dependency. `TestClient` executes background tasks synchronously after the response, so the task hits an unmigrated `data/db/etfolio.sqlite3` under the backend cwd → `sqlite3.OperationalError: no such table: instruments`, and the exception propagates into the test. The scheduler's startup catch-up job has the same problem (it logs `no such table: holdings` during every API test run).
**Fix:** make the session factory injectable/patchable — e.g. module-level `get_session_factory()` used by both `bg_backfill` and `app/scheduler.py`, monkeypatched to `TestingSessionLocal` in `tests/conftest.py` — and add a `TESTING`/`SCHEDULER_ENABLED` setting so `start_scheduler()` is a no-op under tests. Do not fix this by swallowing exceptions in `bg_backfill`.
**Done when:** `pytest backend/tests -q` is fully green with no `OperationalError` noise in captured logs.

### R2. Tests still write stray DB files into the repo (Batch 3 item 18, still open)
`tests/conftest.py` uses `sqlite:///./test_db.sqlite3` and several unit tests created `test_backfill.db`, `test_cgt_report.db`, `test_ref.db`, `test_sched.db`, `test_val_metrics.db` at the repo root. They're gitignored now, but the review asked for tests to use pytest `tmp_path` fixtures (or in-memory `sqlite://`). Convert them and delete the stray files.

### R3. `yfinance>=0.2.50` is a floor, not a pin (Batch 2 item 11)
The review asked for an **exact** pin (`yfinance==<current release>`) so behaviour is reproducible; `>=` re-introduces surprise-upgrade breakage. Pin exactly and note the version in README.

### R4. Permission matrix tests still missing (Batch 3 item 16, partial)
New regression tests for items 1–8 exist and are good, but the owner/edit/view/none matrix still only covers portfolio endpoints. Add it for trades, distributions, reports, and attachments (view-permission user must get 403 on mutations, 200 on reads; unrelated user 403/404 on everything).

### R6. (Found in round-3 review) Missing `Session` import breaks Python 3.12 boot — mandatory
The R1 refactor removed `from sqlalchemy.orm import Session` from `backend/app/api/trades.py`, but five signatures still annotate `db: Session` (lines ~15, 54, 108, 127, 176). Python 3.14 hides this via lazy annotations (tests stay green); Python 3.12 in the Docker image raises `NameError` at import time and the container never boots — the same failure class as Batch 1 item 1.
**Fix:** restore the import. Then add a CI-style guard test that force-evaluates annotations across the app so this class of bug can never pass the suite again, e.g. a unit test that walks `sys.modules['app*']` and calls `typing.get_type_hints()` on every module-level callable, asserting no `NameError`.

### R5. Trivia
- One `datetime.utcnow()` remains in a test file (deprecation warning in the run output).
- `QUESTIONS.md` was not created — if R2–R4 are deferred again, record them there as instructed.
