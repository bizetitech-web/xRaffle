# E2E, CI, and Release Operations

This document covers the execution model for steps 31 to 40:

- Frontend e2e smoke tests (Playwright)
- CI pipeline (build, integration tests, docs link checks)
- Release workflow (version, changelog, tag, GitHub release)
- Clean-machine rehearsal and publish readiness checks

## Frontend E2E (Playwright)

Location:

- client/playwright.config.js
- client/tests/e2e/

Commands:

```bash
npm --prefix client run e2e:install
npm --prefix client run e2e
npm --prefix client run e2e:reports
```

Optional environment variables:

- E2E_BASE_URL (default: http://localhost:5173)
- E2E_API_BASE_URL (default: http://localhost:5000/api)
- E2E_ADMIN_EMAIL
- E2E_ADMIN_PASSWORD

Credential behavior:

- If E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD is not set, tests skip gracefully.

## CI Workflow

File:

- .github/workflows/ci.yml

Jobs:

1. build-and-test
2. e2e-reports (runs only when E2E secrets are configured)
3. integration-contracts (required DB contract/context lane)

build-and-test includes:

- npm install
- npm run check:links
- npm --prefix client run build
- npm --prefix client run test:reports-date

e2e-reports includes:

- MySQL service bootstrap
- server migration and seed setup (organization + super-admin)
- startup of API (5000) and client app (5173)
- npm --prefix client run e2e:install
- npm --prefix client run e2e:reports

### Integration Contracts Lane Runbook

Purpose:

- Run the DB-backed integration contract slice for context endpoints and runtime schema guards.

Tests included (server):

- tests/integration/24-context-playground-db-flow.test.js
- tests/integration/25-context-board-db-flow.test.js
- tests/integration/26-schema-contract-runtime.test.js
- tests/integration/27-context-session-lifecycle-db-flow.test.js
- tests/integration/28-context-session-lifecycle-negative-db-flow.test.js
- tests/integration/29-schema-contract-constraints.test.js

Command:

```bash
npm --prefix server run test:integration:contracts
```

Triggering in CI:

- Automatic on push and pull_request.
- Manual workflow_dispatch supported with input run_contracts=true.

Blocking mode:

- integration-contracts is required and blocking.
- Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD causes the job to fail fast.

Required secrets:

- E2E_ADMIN_EMAIL
- E2E_ADMIN_PASSWORD

Required environment/bootstrap (handled by ci.yml job):

- MySQL service (8.x)
- DB migration
- seed organization + seed super-admin
- API server startup and readiness probe

Expected skip behavior:

- If E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD is missing, the integration-contracts job logs a skip message and exits cleanly.
- On local runs without TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD, tests are discovered and skipped by design.

Phase 1 closure note:

1. Contracts lane is now enforced by default as part of the required CI signal.
2. Keep E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD configured in repository secrets for all protected branches.

## Release Workflow

File:

- .github/workflows/release.yml

Trigger:

- Manual dispatch with input version (x.y.z)

Release workflow behavior:

1. Validates semver format.
2. Verifies CHANGELOG.md contains a heading for the requested version.
3. Runs quick checks (`npm run ci:quick`).
4. Bumps versions in root, client, and server package manifests.
5. Commits and tags v<version>.
6. Pushes commit and tag.
7. Publishes GitHub release.

## Link Check Utility

File:

- scripts/check-doc-links.mjs

Command:

```bash
npm run check:links
```

The checker scans markdown in docs/ plus root README and CHANGELOG, and fails on broken local file links.

## Clean-Machine Rehearsal

See:

- docs/user-management-template/CLEAN_MACHINE_REHEARSAL.md
