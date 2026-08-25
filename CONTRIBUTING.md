# Contributing to ETFolio

## Branch strategy

`main` is the only long-lived branch. It is always deployable. Direct commits and pushes to `main` are prohibited.

All work happens on short-lived branches named `<type>/<short-slug>` using kebab-case:

| Prefix | Purpose |
|---|---|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `docs/` | Documentation only |
| `chore/` | Maintenance, deps, config |
| `refactor/` | Code restructure, no behaviour change |
| `test/` | Test additions or fixes |
| `perf/` | Performance improvement |

### Workflow

```bash
# Start from an up-to-date main
git checkout main && git pull
git checkout -b feat/my-feature

# ... make changes, commit ...

# Push and open a PR targeting main
git push -u origin feat/my-feature
```

Open a pull request, wait for CI validation to pass, then **squash merge**. Delete the branch after merge.

If `main` has moved since your PR validated, rebase onto main and get a fresh green CI run before merging:

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease
```

### PR titles

PR titles become the squash-merge commit message on `main` and feed release notes. Write them as clean Conventional Commit-style lines:

- `feat: add distribution DRP auto-linking`
- `fix: correct CGT discount for sub-12-month parcels`
- `chore: bump yfinance to 0.2.54`

### Feature-branch pushes

Pushing a branch without an open PR runs no CI — this is intentional. CI validates only the PR merge candidate.

## Releases

Releases are cut only from an updated `main`:

```bash
git checkout main && git pull
git tag v1.0.0
git push origin v1.0.0
```

A version tag triggers the CI pipeline to publish a versioned Docker image to GHCR and create a GitHub Release with auto-generated notes.

## CI / GitHub Actions

The workflow lives at `.github/workflows/build.yml`. All jobs run on GitHub-hosted `ubuntu-latest` runners.

### Jobs

| Job | Trigger | What it does |
|---|---|---|
| **validate** | Pull request → `main` | Checkout, install deps, TypeScript type-check, frontend build, backend pytest |
| **build-and-push** | Push to `main` or `v*` tag | Build `linux/amd64` Docker image, push to GHCR |
| **release** | `v*` tag (after build-and-push) | Create GitHub Release with generated notes |

### Image tags

| Event | Tags published |
|---|---|
| Push to `main` | `latest`, `sha-<short>` |
| Tag `vX.Y.Z` | `latest`, `X.Y.Z` |

Feature-branch images are never published.

## Local Docker validation

Always build before running to avoid validating a stale pulled image:

```bash
docker compose build
docker compose up -d
```

Never use `docker compose up -d` alone after pulling — it may use a cached remote image instead of your local changes.

**Volume safety:** `docker compose down` preserves volumes by default. Never run `docker compose down -v`, `docker volume prune`, or `docker system prune` without explicit confirmation — these destroy application data.

## Development setup

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install './backend[dev]'
pytest backend/tests/
```

### Frontend

```bash
cd frontend
npm ci
npx tsc --noEmit    # type-check
npm run build       # production build
npm run dev         # dev server (proxies /api → localhost:8000)
```

If using Podman, set `DOCKER_HOST=unix:///run/user/1000/podman/podman.sock` before `docker compose` commands.
