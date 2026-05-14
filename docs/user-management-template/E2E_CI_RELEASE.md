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
2. e2e-smoke (runs only when E2E secrets are configured)

build-and-test includes:

- npm install
- npm run check:links
- npm --prefix client run build
- npm --prefix server run test:integration

e2e-smoke includes:

- npm --prefix client run e2e:install
- npm --prefix client run e2e

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
