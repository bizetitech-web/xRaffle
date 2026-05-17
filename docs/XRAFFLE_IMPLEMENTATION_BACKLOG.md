# xRaffle Actionable Implementation Backlog

This backlog converts the phase plan into sprint-ready work with endpoint-by-endpoint API specs, RBAC, and test cases.

## Assumptions

- Base API path: `/api`
- Auth: JWT Bearer token
- ID format: `CHAR(36)` UUID string
- Error format:

```json
{
  "error": "Human readable message",
  "code": "OPTIONAL_MACHINE_CODE"
}
```

- Status enums are validated server-side and normalized to uppercase.
- Tenant model:
  - Super Admin: global scope
  - Company Admin: own `company_id`
  - Branch Manager: own `company_id` + own `branch_id` where applicable
  - Seller: own `branch_id` sales/claims only

---

## Sprint 1 (Foundation + Platform Setup)

### Goals

- Implement missing schema safely via migration.
- Complete onboarding path: company -> wallet -> topup -> branch -> users.

### User Stories

- As super admin, I can create a hotel company and get a wallet automatically.
- As super admin/company admin, I can top up wallet and view wallet transactions.
- As super admin/company admin, I can manage branches.
- As admin, I can create users with role + optional branch assignment.

### Endpoints

#### 1) Create Company

- Method/Path: `POST /api/admin/hotel_companies`
- Permission: `MANAGE_HOTELS` (Super Admin only in business policy)
- Request:

```json
{
  "name": "Sunshine Hotels",
  "email": "info@sunshine.et",
  "phone": "+251911000000",
  "status": "ACTIVE"
}
```

- Response `201`:

```json
{
  "id": "uuid",
  "name": "Sunshine Hotels",
  "email": "info@sunshine.et",
  "phone": "+251911000000",
  "status": "ACTIVE",
  "created_at": "2026-05-15T10:00:00.000Z"
}
```

- Notes:
  - On success, service auto-creates `wallet_accounts` row with `balance=0`.

#### 2) List Companies

- Method/Path: `GET /api/admin/hotel_companies`
- Permission: `VIEW_HOTELS`
- Response `200`: array of company objects.

#### 3) Get Wallet by Company

- Method/Path: `GET /api/admin/wallets/company/:companyId`
- Permission: `VIEW_WALLET`
- Response `200`:

```json
{
  "walletId": "uuid",
  "companyId": "uuid",
  "balance": 5000,
  "currency": "ETB",
  "isActive": true,
  "updatedAt": "2026-05-15T10:10:00.000Z"
}
```

#### 4) Top Up Wallet

- Method/Path: `POST /api/admin/wallets/company/:companyId/topups`
- Permission: `TOPUP_WALLET`
- Request:

```json
{
  "amount": 5000,
  "paymentMethod": "CASH",
  "referenceNumber": "RCPT-1001"
}
```

- Response `201`:

```json
{
  "topupId": "uuid",
  "walletTransactionId": "uuid",
  "newBalance": 5000
}
```

- Transaction rules:
  - Insert `wallet_topups`
  - Insert `wallet_transactions` as `TOPUP`
  - Update `wallet_accounts.balance`

#### 5) List Wallet Transactions

- Method/Path: `GET /api/admin/wallets/company/:companyId/transactions?page=1&pageSize=20`
- Permission: `VIEW_WALLET`
- Response `200`:

```json
{
  "items": [
    {
      "id": "uuid",
      "transactionType": "TOPUP",
      "amount": 5000,
      "balanceBefore": 0,
      "balanceAfter": 5000,
      "referenceType": "WALLET_TOPUP",
      "referenceId": "uuid",
      "createdAt": "2026-05-15T10:10:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

#### 6) Create Branch

- Method/Path: `POST /api/admin/hotel_branches`
- Permission: `MANAGE_HOTELS`
- Request:

```json
{
  "companyId": "uuid",
  "name": "Bole Branch",
  "branchCode": "BOLE-01",
  "city": "Addis Ababa",
  "phone": "+251911111111",
  "status": "ACTIVE"
}
```

- Response `201`: created branch.

#### 7) List Branches

- Method/Path: `GET /api/admin/hotel_branches?companyId=uuid`
- Permission: `VIEW_HOTELS`
- Response `200`: array of branches.

#### 8) Create User

- Method/Path: `POST /api/admin/users`
- Permission: `MANAGE_USERS`
- Request:

```json
{
  "firstName": "Abel",
  "lastName": "Kebede",
  "email": "abel@sunshine.et",
  "password": "StrongPassword123!",
  "roleId": "uuid",
  "hotelCompanyId": "uuid",
  "branchId": "uuid",
  "phone": "+251922222222",
  "isActive": true
}
```

- Response `201`:

```json
{
  "message": "User created successfully",
  "userId": "uuid"
}
```

- Validation:
  - `branchId` belongs to `hotelCompanyId`.

### Sprint 1 Test Cases

#### Integration (Backend)

1. Migration creates all missing tables, indexes, and FKs.
2. Company creation auto-creates wallet account exactly once.
3. Wallet topup writes `wallet_topups` + `wallet_transactions` + balance update atomically.
4. Branch create rejects duplicate `branch_code`.
5. User create rejects branch from different company.
6. Tenant boundary: company admin cannot top up another company wallet.

#### E2E (UI)

1. Super admin creates company; wallet section shows zero balance.
2. Super admin topups wallet; updated balance visible.
3. Super admin creates branch; branch appears in list.
4. User create dialog allows branch assignment; saved user shows branch.

---

## Sprint 2 (Game Creation + Cards)

### Goals

- Branch manager can create game, configure prizes, charge fee, and generate cards.

### User Stories

- As branch manager, I can configure a game with prize positions.
- As system, I deduct platform fee from company wallet before activation.
- As system, I generate card inventory for the game.

### Endpoints

#### 1) Create Game

- Method/Path: `POST /api/games`
- Permission: `MANAGE_GAMES`
- Request:

```json
{
  "branchId": "uuid",
  "title": "Friday Beer Game",
  "cardPrice": 50,
  "totalCards": 25,
  "numbersPerCard": 4,
  "totalPrizeBeers": 10,
  "totalNumbersPool": 100
}
```

- Response `201`:

```json
{
  "id": "uuid",
  "status": "PENDING"
}
```

#### 2) Configure Prize Matrix

- Method/Path: `POST /api/games/:gameId/prizes`
- Permission: `MANAGE_GAMES`
- Request:

```json
{
  "prizes": [
    { "drawPosition": 1, "beerQuantity": 3 },
    { "drawPosition": 2, "beerQuantity": 2 },
    { "drawPosition": 3, "beerQuantity": 2 },
    { "drawPosition": 4, "beerQuantity": 3 }
  ]
}
```

- Response `201`:

```json
{
  "gameId": "uuid",
  "totalPositions": 4,
  "totalPrizeBeers": 10
}
```

- Validation:
  - unique `drawPosition`
  - sum of `beerQuantity` equals `games.total_prize_beers`

#### 3) Charge Platform Fee

- Method/Path: `POST /api/games/:gameId/charge`
- Permission: `MANAGE_GAMES`
- Request:

```json
{
  "feeAmount": 50,
  "description": "Platform game fee"
}
```

- Response `200`:

```json
{
  "gameId": "uuid",
  "walletTransactionId": "uuid",
  "gameChargeId": "uuid",
  "balanceBefore": 5000,
  "balanceAfter": 4950
}
```

- Validation:
  - wallet sufficient balance
  - idempotent: reject if game already charged

#### 4) Generate Cards

- Method/Path: `POST /api/games/:gameId/cards/generate`
- Permission: `MANAGE_GAMES`
- Request:

```json
{
  "seed": "optional-for-repeatable-tests"
}
```

- Response `201`:

```json
{
  "gameId": "uuid",
  "cardsGenerated": 25,
  "numbersPerCard": 4,
  "status": "ACTIVE"
}
```

- Behavior:
  - creates `cards` + `card_numbers`
  - game transitions `PENDING -> ACTIVE` if prerequisites met

#### 5) Get Game Detail

- Method/Path: `GET /api/games/:gameId`
- Permission: `VIEW_GAMES`
- Response includes status, prize config summary, sold count, charge state.

### Sprint 2 Test Cases

#### Integration

1. Prize setup fails if sum mismatches total prize beers.
2. Charge fails with `INSUFFICIENT_WALLET_BALANCE` when wallet low.
3. Charge cannot run twice for same game.
4. Card generation creates exact row counts (`cards`, `card_numbers`).
5. Card generation blocked unless prizes configured + charge done.

#### E2E

1. Branch manager creates game + prizes.
2. Manager charges fee successfully; wallet reflects deduction.
3. Manager generates cards; game appears ACTIVE.

---

## Sprint 3 (Sales + Draw Engine + Winners)

### Goals

- Sell cards safely and run draw flow with automatic winner detection.

### User Stories

- As seller, I can sell available cards and collect payment.
- As manager, I can start draws and record winning numbers.
- As system, I auto-detect winners and update card statuses.

### Endpoints

#### 1) List Available Cards

- Method/Path: `GET /api/games/:gameId/cards?status=AVAILABLE&page=1&pageSize=50`
- Permission: `VIEW_GAMES`
- Response: paginated card list.

#### 2) Sell Card

- Method/Path: `POST /api/sales`
- Permission: `SELL_CARDS`
- Request:

```json
{
  "gameId": "uuid",
  "cardId": "uuid",
  "amount": 50,
  "paymentMethod": "CASH"
}
```

- Response `201`:

```json
{
  "saleId": "uuid",
  "cardStatus": "SOLD",
  "soldAt": "2026-05-15T12:00:00.000Z"
}
```

- Concurrency rule:
  - single SQL transaction with optimistic check `status='AVAILABLE'`

#### 3) Start Draw

- Method/Path: `POST /api/games/:gameId/draw/start`
- Permission: `RUN_DRAWS`
- Request: `{}`
- Response `200`:

```json
{
  "gameId": "uuid",
  "status": "DRAWING"
}
```

- Validation:
  - game status ACTIVE
  - min sold cards threshold met (define config)

#### 4) Execute Next Draw

- Method/Path: `POST /api/games/:gameId/draw/next`
- Permission: `RUN_DRAWS`
- Request: optional `{ "forceNumber": 7 }` for admin/testing mode only
- Response `201`:

```json
{
  "drawId": "uuid",
  "drawPosition": 1,
  "winningNumber": 7,
  "beerQuantity": 3,
  "winnerCount": 1,
  "winnerCardIds": ["uuid"]
}
```

- Behavior:
  - insert into `draws`
  - detect matching cards from `card_numbers`
  - insert `winners`
  - update matching `cards.status` to `WINNER` if previously SOLD

#### 5) List Winners for Game

- Method/Path: `GET /api/games/:gameId/winners?claimed=false`
- Permission: `VIEW_WINNERS`
- Response: winners with card serial and claim state.

### Sprint 3 Test Cases

#### Integration

1. Sell card fails for already SOLD/WINNER/CLAIMED card.
2. Two simultaneous sell requests for same card produce 1 success, 1 conflict.
3. Draw start blocked when game not ACTIVE.
4. Draw next rejects duplicate winning number for game.
5. Winner detection inserts correct winner rows.

#### E2E

1. Seller sells multiple cards; sold count updates.
2. Manager starts draw and runs all prize positions.
3. Winners list updates after each draw.

---

## Sprint 4 (Claims + Completion + Reporting API)

### Goals

- Enable prize claiming, game close-out, and reporting endpoints.

### User Stories

- As seller, I can claim winner cards exactly once.
- As manager, I can complete game after draws.
- As managers/admins, I can view daily metrics and financial summaries.

### Endpoints

#### 1) Claim Winner

- Method/Path: `POST /api/winners/:winnerId/claim`
- Permission: `CLAIM_PRIZES`
- Request:

```json
{
  "note": "Beer delivered at counter #2"
}
```

- Response `200`:

```json
{
  "winnerId": "uuid",
  "claimed": true,
  "claimedAt": "2026-05-15T13:00:00.000Z",
  "cardStatus": "CLAIMED"
}
```

- Validation:
  - winner exists
  - not already claimed
  - claimant in correct tenant scope

#### 2) Complete Game

- Method/Path: `POST /api/games/:gameId/complete`
- Permission: `MANAGE_GAMES`
- Request: `{}`
- Response `200`:

```json
{
  "gameId": "uuid",
  "status": "COMPLETED",
  "summary": {
    "totalCards": 25,
    "cardsSold": 18,
    "revenue": 900,
    "winners": 4,
    "claims": 3
  }
}
```

- Validation:
  - all configured draws executed
  - game currently DRAWING

#### 3) Branch Daily Report

- Method/Path: `GET /api/reports/branches/:branchId/daily?date=2026-05-15`
- Permission: `VIEW_REPORTS`
- Response `200`:

```json
{
  "date": "2026-05-15",
  "branchId": "uuid",
  "gamesPlayed": 3,
  "cardsSold": 56,
  "salesRevenue": 2800,
  "beersDistributed": 25,
  "walletDeductions": 150
}
```

#### 4) Company Wallet Report

- Method/Path: `GET /api/reports/companies/:companyId/wallet?from=2026-05-01&to=2026-05-31`
- Permission: `VIEW_REPORTS`
- Response includes topups, fees, adjustments, opening/closing balance.

### Sprint 4 Test Cases

#### Integration

1. Claim fails when already claimed.
2. Claim updates `winners` and `cards` atomically.
3. Game completion blocked unless draw positions exhausted.
4. Report totals reconcile with `sales`, `draws`, `winners`, `wallet_transactions`.

#### E2E

1. Seller claims winner card once; second attempt blocked.
2. Manager completes game; status becomes COMPLETED.
3. Daily report page matches game activity.

---

## Sprint 5 (Realtime + Analytics + Hardening)

### Goals

- Add realtime experiences and production hardening.

### User Stories

- As branch staff, I see live sales and draw updates.
- As admin, I monitor cross-company analytics.
- As platform owner, I can trust auditability and performance.

### Endpoints and Events

#### 1) Realtime Channel Auth

- Method/Path: `POST /api/realtime/token`
- Permission: authenticated user
- Response:

```json
{
  "socketToken": "jwt",
  "expiresIn": 3600
}
```

#### 2) Global Analytics

- Method/Path: `GET /api/reports/global/overview?from=2026-05-01&to=2026-05-31`
- Permission: `VIEW_GLOBAL_REPORTS` (Super Admin)

#### Socket.IO Events

- `game:sale.created`
- `game:draw.created`
- `game:winner.created`
- `game:winner.claimed`
- `game:status.changed`

Event payload includes `companyId`, `branchId`, `gameId`, timestamp and actor metadata.

### Hardening Backlog

1. Rate-limit sensitive routes (auth, sales, draw).
2. Add idempotency key support for topup/charge/sale endpoints.
3. Add DB-level constraints where business invariants are strict.
4. Add outbox pattern for reliable realtime publish (optional if needed for scale).
5. Improve audit logs coverage for all state transitions.

### Sprint 5 Test Cases

#### Integration

1. Socket auth rejects invalid token.
2. Emitted events correspond 1:1 with committed DB transactions.
3. Idempotent endpoints return same result on retry.

#### E2E

1. Two clients see live updates for sales and draws.
2. Super admin global report renders expected aggregates.

---

## RBAC Matrix (Initial)

- `MANAGE_HOTELS`: Super Admin
- `VIEW_HOTELS`: Super Admin, Company Admin
- `MANAGE_USERS`: Super Admin, Company Admin (tenant scoped)
- `VIEW_WALLET`: Super Admin, Company Admin
- `TOPUP_WALLET`: Super Admin, Company Admin (policy decision)
- `MANAGE_GAMES`: Branch Manager
- `RUN_DRAWS`: Branch Manager
- `SELL_CARDS`: Seller
- `CLAIM_PRIZES`: Seller, Branch Manager
- `VIEW_WINNERS`: Branch Manager, Seller (branch scoped)
- `VIEW_REPORTS`: Company Admin, Branch Manager
- `VIEW_GLOBAL_REPORTS`: Super Admin

---

## Definition of Done per Sprint

1. API endpoints implemented with validation and RBAC.
2. Integration tests passing for success + failure + tenant-boundary cases.
3. E2E smoke paths passing for sprint user stories.
4. Migration/readiness scripts updated for any schema additions.
5. API docs updated (README/docs) with request/response examples.

---

## Suggested Ticket Breakdown Template

Use this template for each endpoint ticket:

- Title: `API <METHOD> <PATH> - <Feature>`
- Scope:
  - Controller
  - Service
  - Data access query
  - Validation
  - RBAC middleware
- Acceptance Criteria:
  - Success response contract
  - Error contract(s)
  - Tenant boundary enforced
  - Audit log written
- Tests:
  - Integration success
  - Integration validation failure
  - Integration unauthorized/forbidden
  - Integration cross-tenant failure
