# Clean-Machine Rehearsal

Goal: verify that a fresh environment can install, build, and execute core validation commands.

## Preconditions

- Node.js 18+ installed
- npm installed
- MySQL 8.0+ reachable
- server/.env configured from server/.env.example

## Rehearsal Script

Script:

- scripts/clean-machine-rehearsal.mjs

Dry run:

```bash
node scripts/clean-machine-rehearsal.mjs
```

Execute full rehearsal:

```bash
node scripts/clean-machine-rehearsal.mjs --execute
```

## Manual Rehearsal Steps

Run from repository root:

```bash
npm install
npm run check:links
npm --prefix client run build
npm --prefix server run test:integration
npm --prefix server run verify:db
```

Optional e2e smoke:

```bash
npm --prefix client run e2e:install
npm --prefix client run e2e
```

## Contracts Lane Rehearsal Checklist

Purpose:

- Validate DB-backed integration contract lane prerequisites and expected skip/run behavior.

Prerequisites:

- server/.env is configured with DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET, CORS_ORIGINS.
- API is reachable at TEST_BASE_URL (default: http://localhost:5000/api).
- TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD are configured for run mode.

Run from repository root:

```bash
npm run test:integration:contracts
```

Expected outcomes:

- If TEST_ADMIN_EMAIL or TEST_ADMIN_PASSWORD is missing:
	- Contract tests are discovered and skipped.
	- Command exits successfully (skip-by-design).
- If credentials are present and DB is ready:
	- Contract tests execute against live DB and API.
	- Command exits with non-zero only on real failures.

Quick checks when run mode is expected:

- Verify DB migration has been applied: npm run migrate.
- Verify seeded admin exists for TEST_ADMIN_EMAIL.
- Verify API health endpoint responds: GET /api/health.

## Pass Criteria

- Install finishes without dependency conflicts.
- Frontend build succeeds.
- Integration tests run successfully (or skip intentionally when credentials are not configured).
- Database readiness reports status ok.
- Optional e2e smoke passes or skips with explicit credential notice.

## Phase 1 Closure Criteria

- `npm --prefix server run test:integration:contracts` passes in a DB-backed environment.
- Full server integration suite passes (`npm --prefix server run test:integration`).
- CI integration-contracts job is required and blocking on push/pull_request.
