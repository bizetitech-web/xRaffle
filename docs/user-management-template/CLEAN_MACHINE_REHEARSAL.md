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

## Pass Criteria

- Install finishes without dependency conflicts.
- Frontend build succeeds.
- Integration tests run successfully (or skip intentionally when credentials are not configured).
- Database readiness reports status ok.
- Optional e2e smoke passes or skips with explicit credential notice.
