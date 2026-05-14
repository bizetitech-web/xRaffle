# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- Root changelog scaffold to support step-by-step hardening and release tracking.

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
