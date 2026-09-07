# xRaffle

xRaffle template.

A template-ready fullstack starter focused on authentication, organizations, users, roles, and permissions.

## Status

- Phase 3 cleanup and template hardening are complete.
- Phase 1 context contracts are complete and enforced in CI.
- Phase 6 realtime reliability hardening is complete (transactional realtime outbox with retry/backoff, dead-letter, and metrics).
- The codebase is prepared for public/internal template use.
- Historical phase execution documents are available under docs/user-management-template and have an archive plan.

## Scope

Included in starter scope:

- Authentication (login, profile, token-based session)
- Organization management
- User lifecycle management (create, update, activate/deactivate)
- Role and permission management
- Audit log foundation

Out of scope and removed from active runtime surface:

- HR
- Inventory
- Sales
- Purchasing
- Reports
- Tasks

## Quickstart

Use the clean-machine quickstart guide:

- docs/user-management-template/QUICKSTART.md

## Environment

Use the server environment template:

- server/.env.example

Minimum required values:

- DB_HOST
- DB_USER
- DB_PASSWORD
- DB_NAME
- JWT_SECRET
- CORS_ORIGINS

## Support Matrix

| Component | Supported | Notes |
|---|---|---|
| Node.js | 18.x, 20.x, 22.x | Use active LTS where possible; npm is required. |
| MySQL | 8.0+ | UTF8MB4 collation is expected by starter schema. |
| Operating Systems | Windows 10/11, macOS 13+, Ubuntu 22.04+ | Primary validation done on Windows; macOS/Linux are expected to work with equivalent Node/MySQL versions. |

## Common Commands

From repository root:

```bash
npm install
npm run check:links
npm run migrate
npm run dev
npm run build
```

From server folder:

```bash
npm run seed:super-admin -- --email admin@example.com --password ChangeMe123! --name "Super Admin"
npm run verify:db
npm run test:integration
npm run test:integration:contracts
npm run realtime:outbox:drain
```

Realtime outbox controls (server env)

- REALTIME_OUTBOX_DRAIN_INTERVAL_SECONDS (default 5)
- REALTIME_OUTBOX_BATCH_SIZE (default 100)
- REALTIME_OUTBOX_RETRY_BASE_SECONDS (default 10)
- REALTIME_OUTBOX_RETRY_MAX_SECONDS (default 300)
- REALTIME_OUTBOX_DEAD_LETTER_ATTEMPTS (default 10)

Operational metrics exposed via /metrics

- xraffle_realtime_outbox_pending_count
- xraffle_realtime_outbox_failed_count
- xraffle_realtime_outbox_dead_letter_count
- xraffle_realtime_outbox_avg_publish_latency_seconds
- xraffle_realtime_outbox_failure_rate

DB-backed integration contracts lane requires:

- TEST_ADMIN_EMAIL
- TEST_ADMIN_PASSWORD
- TEST_BASE_URL (defaults to http://localhost:5000/api)

In GitHub Actions, the integration contracts lane now runs on push/pull_request and is required to pass.

From client folder:

```bash
npm run e2e:install
npm run e2e
```

E2E testing notes

- Set `E2E_BASE_URL` to your running dev client URL (defaults to `http://localhost:3001` if unset).
- Set `E2E_API_BASE_URL` to your running API base (defaults to `http://localhost:5000/api`).
- Provide `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` to run Playwright smoke tests that require auth.
- The tests use `apiLogin()` to persist a JWT to `localStorage` before navigation for deterministic UI flows.

CI: Ensure the runner can reach both the client and server URLs and secrets are set as `E2E_*` env vars.

## Project Layout

- client: React + Vite frontend
- server: Express API and database scripts
- docs/user-management-template: template migration, cleanup, and quickstart documents

## Documentation

- Quickstart: docs/user-management-template/QUICKSTART.md
- Phase 3 checklist: docs/user-management-template/PHASE3_CLEANUP_CHECKLIST.md
- Phase docs archive plan: docs/user-management-template/PHASE_DOCS_ARCHIVE_PLAN.md
- Historical phase docs archive: docs/user-management-template/archive/
- E2E/CI/release operations: docs/user-management-template/E2E_CI_RELEASE.md
- Clean-machine rehearsal: docs/user-management-template/CLEAN_MACHINE_REHEARSAL.md
- Publish checklist: docs/user-management-template/PUBLISH_CHECKLIST.md
- Changelog: CHANGELOG.md

## Versioning Policy

This project follows Semantic Versioning:

- MAJOR: breaking changes to starter contracts, setup flow, or API behavior
- MINOR: backward-compatible feature additions or new starter capabilities
- PATCH: backward-compatible fixes, documentation improvements, and non-breaking maintenance

Release updates should always be recorded in CHANGELOG.md before tagging.

## Notes

- Keep phase checklists as historical records unless your process requires a cleaner public docs surface.
- If publishing externally, follow the archive plan to move phase artifacts into an internal or historical folder.
