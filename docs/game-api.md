# Games Module API (Draft)

Auth: All endpoints require `Authorization: Bearer <token>` (JWT). Admin/operator endpoints require role + permissions (see `requirePermissions(...)`). Common permission keys used in this spec:
- `MANAGE_GAMES`, `VIEW_GAMES`, `RUN_DRAWS`, `SELL_CARDS`, `VIEW_WINNERS`, `CLAIM_PRIZES`.

Base path: `/api` (server mounts routes under `/admin` or `/operator` as appropriate).

1) Templates (Admin)
- POST /admin/game-templates
  - Create a template (wizard payload)
  - Body: { templateCode, title, companyId, branchId?, cardPrice, totalCards, totalNumbersPool, numbersPerCard, generationMode: 'SEQUENTIAL'|'RANDOM', totalPrizeBeers, prizes: [{drawPosition,beerQuantity}], defaults: {startAt,endAt,platformFee,feeType} }
  - Permissions: `MANAGE_GAMES`
  - Response: 201 { id, templateCode }

- GET /admin/game-templates
  - List templates (filter by company/branch/active)
  - Permissions: `VIEW_GAMES`

- GET /admin/game-templates/:templateId
  - Permissions: `VIEW_GAMES`

- PUT /admin/game-templates/:templateId
  - Update template, bump `version`
  - Permissions: `MANAGE_GAMES`

- POST /admin/game-templates/:templateId/generate-preview
  - Request body: override fields for generation preview (totalCards, generationMode)
  - Returns: { cards: [{cardNumber, numbers:[...]}], duplicatesFound: bool }
  - Permission: `MANAGE_GAMES`

2) Instantiate Game / Operator
- POST /operator/games
  - Create a Game from template (operator selects branch/defaults)
  - Body: { templateId, overrides: { cardPrice?, startAt?, endAt?, totalCards?, prizes? } }
  - Action: copies template -> creates `games`, `game_prizes`, generates `cards` + `card_numbers` (respecting `generationMode`), sets status `draft` or `scheduled` depending on startAt.
  - Permissions: `MANAGE_GAMES` (operator role)
  - Response: 201 { gameId }

- GET /operator/games/:gameId
  - Returns game details, counts (sold, available), prize config, sample first N cards
  - Permission: `VIEW_GAMES`

- PATCH /operator/games/:gameId/publish
  - Transition game to `sales_open` (if within window) or `scheduled` if future
  - Permissions: `MANAGE_GAMES`

- PATCH /operator/games/:gameId/close-sales
  - Close sales -> transition to `sales_closed`
  - Permissions: `MANAGE_GAMES`

- PATCH /operator/games/:gameId/cancel
  - Cancel game, trigger refunds where applicable
  - Permissions: `MANAGE_GAMES`

3) Card listing & sales
- GET /operator/games/:gameId/cards?status=AVAILABLE|SOLD&limit=&offset=
  - Returns paginated list of cards: { cardId, cardNumber, status, numbers: [..], soldAt?, holder? }
  - Permission: `VIEW_GAMES` or `SELL_CARDS` for sales context

- POST /operator/games/:gameId/cards/:cardId/reserve
  - Reserve a card: server creates `ticket_reservations` and a `wallet_transactions` hold (type `GAME_FEE`) via wallet service
  - Body: { customerName?, customerPhone? }
  - Response: 200 { reservationId, expiresAt }
  - Permission: `SELL_CARDS`

- POST /operator/games/:gameId/cards/:cardId/purchase
  - Capture reservation or do immediate purchase: will create `digital_tickets`, finalize `wallet_transactions` (capture), mark `cards.status` = `SOLD`, create `game_sales` record
  - Body: { reservationId? , paymentMethod, customerName, customerPhone }
  - Response: 201 { ticketId, ticketCode }
  - Permission: `SELL_CARDS`

- POST /operator/games/:gameId/cards/:cardId/unsell
  - Reverse sale (refund flow) if allowed; creates `wallet_transactions` REFUND and sets card status AVAILABLE/VOID
  - Permission: `MANAGE_GAMES`

4) Playground / Draw Control
- GET /playground/games/:gameId/state
  - Read-only view for live display: { numbersPool: totalNumbersPool, drawnNumbers: [...], currentRound, winners: [...], status }
  - No special permission for public display; operator view requires `VIEW_GAMES`.

- POST /operator/games/:gameId/draw/start
  - Start draw (manual) or trigger scheduled auto-draw; sets state `draw_pending` -> `DRAWING`
  - Permissions: `RUN_DRAWS`

- POST /operator/games/:gameId/draw/next
  - Draw the next number (server selects random available number from pool), persists `draws` row, returns the drawn number and affected winners
  - Body: { method: 'AUTO'|'MANUAL' }
  - Response: { drawPosition, winningNumber, winners: [{cardId, ticketId, beerQuantity}] }
  - Permission: `RUN_DRAWS`

- POST /operator/games/:gameId/draw/end
  - Completes draw sequence; transitions to `draw_completed`
  - Permissions: `RUN_DRAWS`

5) Winners & Payouts
- GET /operator/games/:gameId/winners
  - Lists winners and statuses (claimed/paid)
  - Permission: `VIEW_WINNERS`

- POST /operator/games/:gameId/payouts
  - Create a payout batch for the game; server calculates amounts, locks prize funds (create `prize_locks`), creates `payout_batches` and `payout_transactions`, returns batchId
  - Permission: `MANAGE_GAMES`

- POST /operator/payouts/:batchId/process
  - Worker/process attempts to credit winner wallets via the wallet API. Idempotency: workers must record `wallet_transactions` and update `payout_transactions` atomically.
  - Response: { batchId, processed: n, failed: m }
  - Permission: `MANAGE_GAMES`

- GET /operator/payouts/:batchId
  - Inspect payouts and statuses

6) Reports & Reconciliation
- GET /operator/games/:gameId/reconciliation
  - Returns fees, sales summary, payouts totals, net revenue
  - Permission: `MANAGE_GAMES`

7) Audit & State
- GET /operator/games/:gameId/audit
  - Returns `game_audit_logs` and `game_state_transitions`
  - Permission: `MANAGE_GAMES`

8) WebSocket / Real-time events
- Namespace: `/ws/games` or Socket.IO room `game:{gameId}`. Events published by server:
  - `game:update` — payload: full game state (counts, status)
  - `card:reserved` — payload: { cardId, reservationId, expiresAt }
  - `card:sold` — payload: { cardId, ticketId }
  - `draw:next` — payload: { drawPosition, winningNumber }
  - `draw:complete` — payload: { draws:[...], winners:[...] }
  - `payout:batch` — payload: { batchId, status }

9) Error handling
- Standard JSON error: { error: { code: 'ERR_CODE', message: 'Human message', details?: {...} } }
- Common codes: `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `INVALID_INPUT`, `INSUFFICIENT_FUNDS`, `RESERVATION_EXPIRED`, `ALREADY_SOLD`.

10) Idempotency & concurrency
- Ensure `purchase`/`payout` endpoints accept an `Idempotency-Key` header to avoid duplicate processing.
- Use DB constraints (unique keys) and optimistic locking where appropriate.

11) Notes on wallet integration
- All money movement flows should be proxied to the platform wallet service (existing `wallet_transactions` table). For reservations create a `GAME_FEE` hold record; on capture set as settled.

12) Example: reserve -> purchase flow
- POST /operator/games/:gameId/cards/42/reserve
  -> 200 { reservationId, expiresAt }
- POST /operator/games/:gameId/cards/42/purchase { reservationId }
  -> 201 { ticketId, ticketCode }

13) Security
- Ensure operator actions are scoped to their company/branch.
- Audit every state transition.

This is a draft; I can expand each endpoint with full request/response schemas (JSON Schema / OpenAPI) next. Save as `docs/game-api.md`.
