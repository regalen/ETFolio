# ETFolio — Self-Hosted ASX ETF Portfolio Tracker

> A lightweight, self-hosted, Docker-based ETF portfolio and Australian tax tracker designed for Australian retail investors holding ASX-listed ETFs (e.g. DHHF, VAS, VGS, A200).

---

## Key Features

- **Multi-portfolio & Access Sharing:** Create multiple portfolios, share view or edit permissions with other local users.
- **Pure CGT Replay Engine:** Deterministic, pure-function CGT calculation supporting FIFO, LIFO, and Min-CGT (tax minimisation). Applies the 50% 12-month discount rule and handles AMIT cost-base adjustments including E4 capital gain events.
- **Sharesight Simple Method Return:** Accurately computes capital gains, dividend income, time-weighted average capital invested, simple return percentage, and compound annualised percentage p.a.
- **CSV Trade Importer:** Preview, commit, and undo a CSV of trade history with instant validation — download a ready-to-fill template, or import exports from Sharesight and other brokers/trackers directly.
- **Distributions & DRP:** Track franking credits, AMIT adjustments, and automatically link Dividend Reinvestment Plan (DRP) purchases.
- **Attachments:** Store trade confirmation PDFs and dividend statements locally with role-based access control.
- **Zero Cloud Dependency:** Price data is cached locally via Yahoo Finance integration (`yfinance==0.2.54` pinned for stability).

---

## Quick Start (Docker)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/ETFolio.git
   cd ETFolio
   ```

2. **Copy environment configuration:**
   ```bash
   cp .env.example .env
   ```

3. **Launch with Docker Compose:**
   ```bash
   docker compose up -d
   ```

4. **Access the application:**
   Open [http://localhost:8080](http://localhost:8080) in your browser and register your administrator account.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | `dev_secret_key...` | Cryptographic key for session token hashing. |
| `TZ` | `Australia/Sydney` | Timezone for cron schedules and reporting. |
| `REGISTRATION_OPEN` | `true` | Allows new users to register when set to `true`. |
| `MAX_UPLOAD_MB` | `10` | Maximum file upload size in MB for attachments. |
| `COOKIE_SECURE` | `false` | Set to `true` when running behind HTTPS proxy. |
| `DATABASE_PATH` | `/data/db/etfolio.sqlite3` | Path to SQLite database file. |
| `ATTACHMENTS_DIR` | `/data/files` | Path to file attachments directory. |

---

## Performance & Return Formulas

ETFolio uses the **Sharesight Simple Method** for calculating return performance over a selected period $[t_0, t_1]$:

- **Capital Gain ($):**
  $$\text{Capital Gain} = \text{MV}(t_1) - \text{MV}(t_0) - \text{NetInvested}$$
  where $\text{NetInvested} = \sum \text{Buy Costs} - \sum \text{Sell Proceeds}$ for trades inside $[t_0, t_1]$.

- **Dividend Income ($):**
  $$\text{Income} = \sum \text{Gross Amount of distributions paid in } [t_0, t_1]$$

- **Total Return ($):**
  $$\text{Total Return} = \text{Capital Gain} + \text{Income}$$

- **Average Capital Invested ($):**
  $$\text{Avg Capital} = \frac{\sum_{d \in [t_0, t_1]} \text{CostBase}(d)}{N_{\text{days}}}$$

- **Simple Return (%):**
  $$\text{Simple Return} = \frac{\text{Total Return}}{\text{Average Capital Invested}}$$

- **Annualised Return (% p.a.):**
  If the period exceeds 12 months (365 days):
  $$\text{Return}_{\text{p.a.}} = (1 + \text{Simple Return})^{\frac{365.25}{N_{\text{days}}}} - 1$$

---

## Backup & Restore

All application data resides in two Docker volumes:
1. `etfolio-db`: SQLite database file
2. `etfolio-files`: File attachments (PDFs, images)

### Backup Command:
```bash
docker run --rm -v etfolio-db:/db -v etfolio-files:/files -v $(pwd):/backup alpine tar czf /backup/etfolio_backup.tar.gz -C / db files
```

### Restore Command:
```bash
docker run --rm -v etfolio-db:/db -v etfolio-files:/files -v $(pwd):/backup alpine tar xzf /backup/etfolio_backup.tar.gz -C /
```

---

## Running Tests Locally

Activate python virtual environment and run pytest:
```bash
.venv/bin/pytest backend/tests/
```
