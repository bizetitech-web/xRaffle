Phase 2 — Game Creation & Charging API Spec

Goal
- Provide endpoints and DB migration to create game templates and instantiate games from templates, record charges to company wallets, and expose read/list operations for admin UIs.

High-level models
- `game_templates` (see migration `server/scripts/migrations/004_create_game_templates.sql`)
- `game_template_prizes`
- `games` (already in `002_create_game_tables.sql`)
- `game_charges` (already exists)

API Endpoints (admin, require `MANAGE_GAMES` or similar permission)

1) Create game template
- POST /api/admin/game_templates
- Body (JSON):
  {
    "companyId": "<uuid>",
    "branchId": "<uuid>|null",
    "templateCode": "SUMMER-2026-V1",
    "title": "Summer Raffle V1",
    "cardPrice": 5.00,
    "totalCards": 1000,
    "numbersPerCard": 4,
    "totalNumbersPool": 100,
    "totalPrizeBeers": 10,
    "generationMode": "RANDOM",
    "isActive": true,
    "prizes": [ { "drawPosition": 1, "beerQuantity": 5 }, { "drawPosition": 2, "beerQuantity": 3 } ]
  }
- Returns: 201 with created template (id, template_code, metadata)

2) List / Get templates
- GET /api/admin/game_templates?companyId=<uuid>&branchId=<uuid>&active=1
- GET /api/admin/game_templates/:id

3) Update template
- PUT /api/admin/game_templates/:id
- Accepts same fields as create (partial allowed). If `prizes` provided, upsert prize rows.

4) Create game from template
- POST /api/admin/games
- Body (JSON):
  {
    "templateId": "<uuid>",
    "branchId": "<uuid>",
    "title": "Optional override",
    "createdBy": "<userId>"
  }
- Behavior: instantiate `games` row, generate `cards` and `card_numbers` according to template (defer heavy generation to background job if large). Return `game.id` and initial status.

5) Charge game (take money from company wallet when game is activated or sold)
- POST /api/admin/games/:id/charge
- Body:
  { "amount": 100.00, "description": "Initial funding for prizes", "reference": "game-init-<id>" }
- Behavior: use `topupWalletService` style transaction but in reverse (debit). Create `wallet_transactions` record and `game_charges` linking to transaction. Ensure atomic DB transaction.

Notes and constraints
- All write operations must run in DB transactions where multiple tables are affected (users/roles, wallet transactions & topups, game creation & card generation).
- Use UUIDv4 for all IDs, consistent with existing migrations.
- For large card generation, introduce a background worker job; initial MVP may generate up to 5k cards synchronously.
- Add integration tests: create template -> create game -> simulate a sale -> assert wallet transaction + game_charge created.

Next steps (implementation plan)
1. Add migration for `game_templates` (done: `server/scripts/migrations/004_create_game_templates.sql`).
2. Add service functions: `createGameTemplateService`, `listGameTemplatesService`, `createGameFromTemplateService`, `chargeGameService`.
3. Add routes `server/src/routes/admin/gameTemplates.js` and `server/src/routes/admin/games.js` with RBAC middleware.
4. Add Playwright E2E smoke tests covering create-template -> create-game -> charge flow.

References
- Migration file: [server/scripts/migrations/004_create_game_templates.sql](server/scripts/migrations/004_create_game_templates.sql)
- Existing game tables: [server/scripts/migrations/002_create_game_tables.sql](server/scripts/migrations/002_create_game_tables.sql)
