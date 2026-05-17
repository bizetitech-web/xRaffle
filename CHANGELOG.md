# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- Root changelog scaffold to support step-by-step hardening and release tracking.
- Sprint 1 wallet module completion with wallet schema tables (`wallet_accounts`, `wallet_transactions`, `wallet_topups`) and readiness checks.
- Admin wallet APIs for balance fetch, topup, and paged transaction history.
- Integration coverage for wallet topup flow, tenant boundary denial, org-admin own-company topup, and TOPUP_WALLET audit assertions.
- Admin Hotels wallet panel in UI for balance, topup, and transaction list.
- Sprint 2 kickoff with game schema tables (`games`, `game_prizes`).
- Game API foundations under `/api/games` for create game, configure prizes, and game detail.
- Seed permissions for `MANAGE_GAMES` and `VIEW_GAMES`.
- Game fee charge endpoint `POST /api/games/:gameId/charge` with transaction-safe wallet deduction, `game_charges` ledger linkage, duplicate-charge protection, and insufficient-balance guard.
- Game inventory tables `cards` and `card_numbers` for per-game card stock and number assignments.
- Game card generation endpoint `POST /api/games/:gameId/cards/generate` with prerequisite checks (prizes + charge), deterministic optional seed, and duplicate-generation guard.
- Explicit game activation endpoint `POST /api/games/:gameId/activate` enforcing prizes + charge + full card inventory before transitioning to `ACTIVE`.
- Game sales table `game_sales` and sales endpoint `POST /api/games/:gameId/sales` with transactional single-sale enforcement per card and ACTIVE-game guard.
- Draw workflow tables `draws` and `winners` plus draw endpoints `POST /api/games/:gameId/draw/start` and `POST /api/games/:gameId/draw/next` with unique-number enforcement and winner detection from sold cards via `card_numbers`.
- Operational winner endpoints: `GET /api/games/:gameId/winners` (with optional claimed filter) and `POST /api/winners/:winnerId/claim` with one-time claim enforcement and card status transition to `CLAIMED`.
- Game completion endpoint `POST /api/games/:gameId/complete` with draw-exhaustion checks and summary payload (`totalCards`, `cardsSold`, `revenue`, `winners`, `claims`).
- Reporting endpoints: `GET /api/reports/branches/:branchId/daily?date=YYYY-MM-DD` and `GET /api/reports/companies/:companyId/wallet?from=YYYY-MM-DD&to=YYYY-MM-DD` with tenant-scoped metrics across game lifecycle and wallet ledger activity.
- Super-admin global overview endpoint `GET /api/reports/global/overview?from=YYYY-MM-DD&to=YYYY-MM-DD` with cross-company KPIs and daily trend windows, protected by `VIEW_GLOBAL_REPORTS`.
- Shared reports header/filter component for Global Overview, Branch Daily, and Company Wallet pages.
- Reports E2E coverage via `client/tests/e2e/06-reports-pages-flow.spec.js` and dedicated `e2e:reports` script.
- Shared reports date utility (`client/src/utils/reportsDate.js`) with unit tests (`client/tests/unit/reportsDate.test.js`).
- CI hardening for reports E2E gating on secrets and Playwright artifact upload on failure.
- Frontend bundle hardening with route-level lazy loading and Vite manual chunk splitting for React/router/MUI/charts.

## [2.1.0] - 2026-05-08

### Added
- Frontend Playwright e2e scaffolding with smoke and admin flow tests under `client/tests/e2e`.
- CI workflow for link checks, frontend build, server integration tests, and conditional e2e smoke.
- Release workflow with semver input validation, changelog gate, version bump, tag, and GitHub release publish.
- Operational scripts: markdown link checker and clean-machine rehearsal helper.
- Runbooks for e2e/ci/release operations, clean-machine rehearsal, and publish checklist.

### Changed
- Admin user and role management UIs now expose stable `data-testid` and `aria-label` selectors for e2e tests.
- Root scripts include `check:links`, `test:integration`, `test:e2e`, `verify:db`, and `ci:quick`.

## [v1.0.0-template-ready] - 2026-05-08

### Summary
- Marked template as ready for public/internal use after cleanup, hardening, and smoke validation.
- Archived historical phase planning documents under docs/user-management-template/archive.
- Added operator-facing onboarding docs:
  - README.md
  - docs/user-management-template/QUICKSTART.md
  - server/.env.example
