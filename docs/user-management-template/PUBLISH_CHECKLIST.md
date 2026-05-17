# Publish Checklist

Use this checklist before any template release.

## Changelog and Versioning

- Confirm release version follows SemVer (x.y.z).
- Add release notes under `## [x.y.z]` in CHANGELOG.md.
- Verify breaking changes are clearly called out.

## Validation

- Run: npm run check:links
- Run: npm --prefix client run build
- Run: npm --prefix server run test:integration
- Run: npm --prefix server run verify:db
- Optional: npm --prefix client run e2e
- If running reports E2E in CI, confirm `e2e-reports` gate behavior:
	- With `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` secrets present, reports E2E executes.
	- Without those secrets, workflow logs a clean skip notice and does not fail the pipeline.
- Confirm Playwright artifacts are uploaded on reports E2E failure (`client/test-results/`, `client/playwright-report/`).
- Confirm required CI secrets exist for reports E2E execution:
	- `E2E_ADMIN_EMAIL`
	- `E2E_ADMIN_PASSWORD`

## Template Readiness

- Ensure docs/user-management-template/QUICKSTART.md matches current commands.
- Ensure archived phase docs are in docs/user-management-template/archive/.
- Ensure no placeholder secrets are committed.

## Release Execution

- Trigger .github/workflows/release.yml with the target version.
- Confirm workflow created commit, tag, and GitHub release.
- Verify tags and release notes on the repository release page.

## Post-Release

- Update internal or external announcement channels.
- Create follow-up issue for any deferred non-blocking items.
