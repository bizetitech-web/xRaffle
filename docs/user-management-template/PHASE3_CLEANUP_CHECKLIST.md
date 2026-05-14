# Phase 3 Checklist: Destructive Cleanup & Template Hardening

Date: 2026-05-03
Status: In Progress

## A) Destructive Cleanup
- [x] Remove all leftover files from removed modules (HR, Inventory, Sales, Purchasing, Reports, Tasks)
- [x] Delete unused assets, scripts, and configs
- [x] Remove obsolete documentation and references
- [x] Clean up database migrations and seed files for removed modules

## B) Template Hardening
- [x] Ensure all code and UI is generic and template-appropriate
- [x] Finalize and review starter documentation/quickstart
- [x] Validate that no product-specific branding or logic remains
- [x] Confirm all references to removed modules are gone (runtime code + starter docs; historical phase-planning docs excluded)

## C) Final Validation
- [x] Build and lint pass after cleanup
- [x] Manual smoke test passes (login, create org, create user, assign role, deactivate user, reset password)
- [x] Ready for public or internal template use

## Progress Notes
- 2026-05-03: Phase 3 checklist created, ready to begin destructive cleanup.
- 2026-05-07: Deleted leftover HR app pages under client/src/app/hr/* and removed server/docs/tasks-api-reference.md.
- 2026-05-07: Post-cleanup client production build passed.
- 2026-05-07: Removed obsolete server models (Category/Inventory/Product) and legacy SQL files (add_missing_fields.sql, sample_data.sql).
- 2026-05-07: Updated admin permission module helper text to starter scope (users/roles/organizations).
- 2026-05-07: Reconciled PHASE3_INVENTORY with completed deletions and removed stale references to deleted SQL artifacts.
- 2026-05-07: Removed remaining product-specific admin UI text/stats and replaced branded CORS host with env-driven starter defaults.
- 2026-05-07: Verified no removed-module keywords in client/src or server runtime code; remaining mentions are in phase-planning documentation.
- 2026-05-07: Added clean-machine quickstart guide and server .env example for starter setup and bootstrap flow.
- 2026-05-07: Closure validation pass completed (runtime code, starter docs, build, and diagnostics clean); only manual smoke flow remains before final readiness sign-off.
- 2026-05-07: Manual smoke flow passed and template marked ready for public/internal use.
