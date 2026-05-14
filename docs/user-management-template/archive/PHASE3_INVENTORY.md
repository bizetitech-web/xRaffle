# Phase 3 Inventory: Keep / Remove / Refactor

Date: 2026-05-07
Status: In progress (inventory reconciled with executed cleanup slices)

This inventory maps the current codebase to the target user-management starter.

Columns:
- Layer: backend, frontend, db, scripts, shared
- Current status: exists and whether it is actively mounted/used
- Decision: Keep, Remove, Refactor
- Dependency notes: why the decision is required
- Risk: Low, Medium, High
- Owner: Template cleanup
- Done: No until cleanup is executed

## Backend

| Item | Layer | Current status | Decision | Dependency notes | Risk | Owner | Done |
|---|---|---|---|---|---|---|---|
| server/server.js | backend | Exists, active entrypoint | Refactor | Mounted routes still include dashboard, products, HR, inventory, tasks, plus diagnostic/test endpoints not needed for starter | High | Template cleanup | No |
| server/routes/authRoutes.js | backend | Exists, mounted at /api/auth | Refactor | Keep auth endpoints, but registration flow must be aligned to super-admin-controlled model | Medium | Template cleanup | No |
| server/controllers/authController.js | backend | Exists, used by authRoutes | Refactor | Keep login/profile/update pieces, align register flow with Phase 1 scope and role naming | High | Template cleanup | No |
| server/routes/adminRoutes.js | backend | Exists, mounted at /api/admin | Refactor | Core user/role/org management stays, but file currently mixes admin dashboard/product counts and broad platform behaviors | High | Template cleanup | No |
| server/middleware/auth.js | backend | Exists, used | Keep | Core auth guard for protected routes | Low | Template cleanup | No |
| server/middleware/rbac.js | backend | Exists, used | Refactor | Keep RBAC, but reduce role/permission assumptions to starter role set | Medium | Template cleanup | No |
| server/middleware/errorHandler.js | backend | Exists | Keep | Shared error boundary utility | Low | Template cleanup | No |
| server/middleware/validation.js | backend | Exists, used by auth routes | Keep | Shared validation helper | Low | Template cleanup | No |
| server/routes/dashboardRoutes.js | backend | Exists, mounted at /api/dashboard | Remove | Outside user-management starter scope | Low | Template cleanup | No |
| server/controllers/dashboardController.js | backend | Exists, used by dashboardRoutes | Remove | Dashboard module removed from template | Low | Template cleanup | No |
| server/routes/productRoutes.js | backend | Exists, mounted at /api/products | Remove | Product catalog/inventory domain removed | Low | Template cleanup | No |
| server/controllers/productController.js | backend | Exists, used by productRoutes | Remove | Product domain removed | Low | Template cleanup | No |
| server/routes/hrRoutes.js | backend | Exists, mounted at /api/hr | Remove | HR module out of scope | Low | Template cleanup | No |
| server/controllers/hrController.js | backend | Exists, used by hrRoutes | Remove | HR module out of scope | Low | Template cleanup | No |
| server/routes/inventoryRoutes.js | backend | Exists, mounted at /api/inventory | Remove | Inventory module out of scope | Low | Template cleanup | No |
| server/controllers/inventoryController.js | backend | Exists, used by inventoryRoutes | Remove | Inventory module out of scope | Low | Template cleanup | No |
| server/routes/taskRoutes.js | backend | Exists, mounted at /api/tasks | Remove | Tasks module out of scope | Low | Template cleanup | No |
| server/controllers/taskController.js | backend | Exists, used by taskRoutes | Remove | Tasks module out of scope | Low | Template cleanup | No |
| server/routes/brandRoutes.js | backend | Exists, not mounted in server.js | Remove | Unmounted product-domain route should not survive starter cleanup | Low | Template cleanup | No |
| server/routes/categoryRoutes.js | backend | Exists, not mounted in server.js | Remove | Unmounted product-domain route should not survive starter cleanup | Low | Template cleanup | No |
| server/controllers/brandController.js | backend | Exists | Remove | Product-domain controller | Low | Template cleanup | No |
| server/controllers/categoryController.js | backend | Exists | Remove | Product-domain controller | Low | Template cleanup | No |
| /api/health endpoint in server.js | backend | Exists, mounted | Keep | Useful starter health check | Low | Template cleanup | No |
| /api/db-status endpoint in server.js | backend | Exists, mounted | Refactor | Keep optional DB status, but remove product/org-specific assumptions beyond starter schema | Medium | Template cleanup | No |
| /api/test-messages and /api/db-diagnostic endpoints in server.js | backend | Exists, mounted | Remove | Developer diagnostics not part of starter baseline | Low | Template cleanup | No |

## Frontend

| Item | Layer | Current status | Decision | Dependency notes | Risk | Owner | Done |
|---|---|---|---|---|---|---|---|
| client/src/App.jsx | frontend | Exists, active app router | Refactor | Contains auth/admin routes plus products, inventory, HR, sales, reports, tasks, services, db-test | High | Template cleanup | No |
| client/src/router.jsx | frontend | Exists, appears unused/alternate router | Remove | Duplicate/inactive router surface adds confusion to starter | Low | Template cleanup | No |
| client/src/context/AuthContext.jsx | frontend | Exists, active | Refactor | Keep auth state, but role helper functions still encode removed business roles/modules and super_admin naming | High | Template cleanup | No |
| client/src/components/auth/PrivateRoute.jsx | frontend | Exists, used | Keep | Needed for protected views | Low | Template cleanup | No |
| client/src/components/auth/RoleGuard.jsx | frontend | Exists, used | Refactor | Keep guard but align allowed roles/permissions to starter scope | Medium | Template cleanup | No |
| client/src/components/layout/Layout.jsx | frontend | Exists, used | Keep | Core shell layout | Low | Template cleanup | No |
| client/src/components/layout/Navbar.jsx | frontend | Exists, used | Refactor | Keep if it only serves starter pages; verify removed-module links/badges are absent | Medium | Template cleanup | No |
| client/src/components/layout/Sidebar.jsx | frontend | Exists, used | Refactor | Currently exposes products, inventory, sales, purchasing, reports, HR, tasks, services, db test | High | Template cleanup | No |
| client/src/pages/auth/Login.jsx | frontend | Exists | Keep | Core starter auth page | Low | Template cleanup | No |
| client/src/pages/auth/Register.jsx | frontend | Exists | Refactor | Phase 1 registration model changed to admin-only, so either remove public route or convert to admin flow | High | Template cleanup | No |
| client/src/pages/admin/UserManagement.jsx | frontend | Exists | Keep | Core starter feature | Medium | Template cleanup | No |
| client/src/pages/admin/RoleManagement.jsx | frontend | Exists | Keep | Core starter RBAC feature | Medium | Template cleanup | No |
| client/src/pages/admin/Permissions.jsx | frontend | Refactor | Refactor | Keep only if permission management remains exposed in starter UI; reduce removed-module permissions | Medium | Template cleanup | No |
| client/src/pages/admin/OrganizationSettings.jsx | frontend | Keep candidate | Keep | Needed because multi-tenant org support remains in scope | Medium | Template cleanup | No |
| client/src/pages/dashboard/Dashboard.jsx | frontend | Exists, active route | Remove | General business dashboard removed from template scope | Medium | Template cleanup | No |
| client/src/pages/DbTest.jsx | frontend | Exists, active route | Remove | Diagnostic/dev utility not part of starter | Low | Template cleanup | No |
| client/src/pages/Services.jsx | frontend | Exists, active route | Remove | Out of starter scope | Low | Template cleanup | No |
| client/src/pages/Settings.jsx | frontend | Exists, active route | Refactor | Keep only if it serves user/org settings; otherwise remove | Medium | Template cleanup | No |
| client/src/pages/Help.jsx | frontend | Exists, active route | Refactor | Optional for starter; keep only if generic | Low | Template cleanup | No |
| client/src/pages/products/* | frontend | Exists | Remove | Product module removed | Low | Template cleanup | No |
| client/src/pages/inventory/* | frontend | Exists | Remove | Inventory module removed | Low | Template cleanup | No |
| client/src/pages/sales/* | frontend | Exists | Remove | Sales module removed | Low | Template cleanup | No |
| client/src/pages/purchasing/* | frontend | Exists | Remove | Purchasing module removed | Low | Template cleanup | No |
| client/src/pages/reports/* | frontend | Exists | Remove | Reports module removed | Low | Template cleanup | No |
| client/src/pages/hr/* | frontend | Exists | Remove | HR module removed | Low | Template cleanup | No |
| client/src/pages/tasks/* | frontend | Exists | Remove | Tasks module removed | Low | Template cleanup | No |
| client/src/pages/temps/* | frontend | Exists | Remove | Temporary artifacts not part of starter | Low | Template cleanup | No |
| client/src/services/auth.js | frontend | Exists | Keep | Core auth API wrapper | Low | Template cleanup | No |
| client/src/services/api.js | frontend | Exists | Keep | Shared API client | Low | Template cleanup | No |
| client/src/services/products.js | frontend | Exists | Remove | Product module removed | Low | Template cleanup | No |
| client/src/services/tasks.js | frontend | Exists | Remove | Tasks module removed | Low | Template cleanup | No |
| client/src/components/common/DataTable.jsx | shared | Exists | Keep | Reusable starter component for users/roles | Low | Template cleanup | No |
| client/src/components/common/ErrorAlert.jsx | shared | Exists | Keep | Shared feedback component | Low | Template cleanup | No |
| client/src/components/common/LoadingSpinner.jsx | shared | Exists | Keep | Shared loading component | Low | Template cleanup | No |

## Database and Migrations

| Item | Layer | Current status | Decision | Dependency notes | Risk | Owner | Done |
|---|---|---|---|---|---|---|---|
| server/config/database.js | db | Exists, active | Keep | Core DB connection | Low | Template cleanup | No |
| server/scripts/migrate.js | scripts | Exists, active | Refactor | Current migration order includes HR/tasks artifacts; starter migration should be limited to auth/user-management schema | High | Template cleanup | No |
| server/database/hr_schema.sql | db | Exists, used by migrate.js | Remove | HR schema out of scope | Low | Template cleanup | No |
| server/database/migrations/20260410_add_my_attendances_permission.sql | db | Exists, used by migrate.js | Remove | HR permission migration out of scope | Low | Template cleanup | No |
| server/database/migrations/20260410_harden_payroll_periods.sql | db | Exists, used by migrate.js | Remove | Payroll/HR out of scope | Low | Template cleanup | No |
| server/database/migrations/20260410_add_tasks_module.sql | db | Exists, used by migrate.js | Remove | Tasks out of scope | Low | Template cleanup | No |
| server/database/migrations/20260410_tasks_started_at_in_progress.sql | db | Exists, used by migrate.js | Remove | Tasks out of scope | Low | Template cleanup | No |
| server/database/add_missing_fields.sql | db | Removed (2026-05-07) | Remove | Legacy mixed-scope SQL removed from starter baseline | High | Template cleanup | Yes |
| server/database/sample_data.sql | db | Removed (2026-05-07) | Remove | Legacy non-starter sample data removed from starter baseline | High | Template cleanup | Yes |
| Target starter tables: organizations, users, roles, permissions, user_roles, role_permissions, audit_logs | db | Partially present | Keep | These form the minimal template schema | High | Template cleanup | No |

## Scripts and Operations

| Item | Layer | Current status | Decision | Dependency notes | Risk | Owner | Done |
|---|---|---|---|---|---|---|---|
| server/scripts/createSuperAdmin.js | scripts | Exists | Refactor | Keep as starter seed/reset helper, but align naming and avoid editing unrelated user fields if split responsibilities remain | Medium | Template cleanup | No |
| server/scripts/updateUserPassword.js | scripts | Exists | Keep | Matches starter password-reset scope | Low | Template cleanup | No |
| server/package.json scripts | scripts | Exists | Refactor | Keep dev/start/migrate/seed/reset paths only; remove obsolete module setup over time | Medium | Template cleanup | No |
| root package.json scripts | scripts | Exists | Refactor | Keep fullstack dev/build/start only if they match starter app shape | Low | Template cleanup | No |

## Immediate Execution Order Recommendation

1. Refactor server/server.js to unmount removed backend modules and delete test endpoints.
2. Refactor client/src/App.jsx and client/src/components/layout/Sidebar.jsx to expose only starter routes.
3. Remove orphaned backend routes/controllers for products, HR, inventory, tasks, dashboard, categories, brands.
4. Remove client pages and service files for removed modules.
5. Completed: removed add_missing_fields.sql and sample_data.sql; starter now uses user_management_schema.sql and user_management_seed.sql.
6. Refactor auth/admin/RBAC logic to match locked role model and admin-only registration.
7. Validate against Phase 2 checklist.

## Phase 3 Exit Criteria

- Every active module is classified.
- Removal candidates have dependency notes.
- Refactor-first files are identified before deletion starts.
- Execution can proceed in controlled slices without reopening scope.
