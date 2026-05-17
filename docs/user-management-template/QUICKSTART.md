# xRaffle Quickstart

Date: 2026-05-07

This quickstart is for a clean machine and a fresh clone.

## 1) Prerequisites

- Node.js 18+ and npm
- MySQL 8+
- A MySQL user with permissions to create tables and insert records

## 2) Install dependencies

From the repository root:

```bash
npm install
```

## 3) Configure server environment

Copy the example file:

```bash
copy server\.env.example server\.env
```

Then edit `server/.env` and set at least:

- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`
- `CORS_ORIGINS`

## 4) Create the database

Create the database configured in `DB_NAME`.

Example:

```sql
CREATE DATABASE IF NOT EXISTS xraffle CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 5) Run migrations and seed role/permission data

From repo root:

```bash
npm run migrate
```

This applies:

- `server/database/user_management_schema.sql`
- `server/database/user_management_seed.sql`

Then verify database readiness from server folder:

```bash
npm run verify:db
```

## 6) Bootstrap one organization

The super-admin seed helper requires at least one organization record.

From `server` folder:

```bash
npm run seed:org -- --name "Starter Organization" --code starter-org --email admin@example.com
```

Input rules:

- `--name` is required (minimum 3 characters)
- `--code` is required and must be lowercase letters, numbers, and hyphens
- `--email` is optional, but must be valid if provided

## 7) Create or update super admin user

From `server` folder:

```bash
npm run seed:super-admin -- --email admin@example.com --password ChangeMe123! --name "Super Admin"
```

Notes:

- If `--organizationId` is omitted, the script uses the first organization in the database.
- Running this command again updates the same user password/profile for that organization email.

## 8) Start the app

From repo root:

```bash
npm run dev
```

Default local URLs:

- Client: `http://localhost:5173`
- Server API: `http://localhost:5000`
- Health check: `http://localhost:5000/api/health`
- DB status: `http://localhost:5000/api/db-status`

## 9) Login

Use the super admin email/password from Step 7 on the login page.

## 10) Run Reports E2E Spec

This validates the three reports pages end-to-end:

- Global Overview
- Branch Daily
- Company Wallet Range

### Required environment variables

In the same terminal where you run Playwright, set:

- `E2E_BASE_URL` (recommended: `http://localhost:5173`)
- `E2E_API_BASE_URL` (recommended: `http://localhost:5000/api`)
- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`

PowerShell example:

```powershell
$env:E2E_BASE_URL='http://localhost:5173'
$env:E2E_API_BASE_URL='http://localhost:5000/api'
$env:E2E_ADMIN_EMAIL='admin@example.com'
$env:E2E_ADMIN_PASSWORD='ChangeMe123!'
```

If needed, sync the admin account before running tests:

```bash
cd server
npm run seed:super-admin -- --email admin@example.com --password ChangeMe123! --name "Super Admin"
```

### Run the dedicated reports E2E command

From repo root:

```bash
npm --prefix client run e2e:reports
```

Expected result:

- `3 passed` for `tests/e2e/06-reports-pages-flow.spec.js`

## Troubleshooting

- If CORS fails, verify `CORS_ORIGINS` includes your client URL (for example `http://localhost:5173`).
- If login fails, confirm organization exists and re-run `npm run seed:super-admin`.
- If migration fails, validate MySQL credentials in `server/.env` and database existence.

## Deterministic Setup Flow (Recommended)

From a clean clone, run in this order:

1. `npm install`
2. `npm run migrate`
3. `cd server && npm run verify:db`
4. `cd server && npm run seed:org -- --name "Starter Organization" --code starter-org --email admin@example.com`
5. `cd server && npm run seed:super-admin -- --email admin@example.com --password ChangeMe123! --name "Super Admin"`
6. `npm run dev`

## Historical Phase Docs

Phase execution artifacts are archived for reference only:

- docs/user-management-template/archive/
