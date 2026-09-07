**Game Module ER — Overview**

This document describes the main entities for the Games/Raffle module and how they relate.

Entities:

- `game_templates` — Reusable template (wizard) with generation rules, prize tiers and defaults.
- `games` — Instantiated game (an actual raffle) created from a template. Contains runtime status and timing.
- `game_prizes` / `game_template_prizes` — Prize tiers for a template or an instantiated game (draw position -> quantity).
- `cards` — Logical ticket slots for a game; each card has N numbers.
- `card_numbers` — Individual numbers associated with a card (position + value).
- `ticket_reservations` — Temporary holds (wallet reservation) for a buyer selecting a card.
- `digital_tickets` — Issued ticket record after successful purchase (ties card -> buyer -> wallet tx).
- `game_sales` — Historical sales records (existing table used for sales audit).
- `draws` — Each drawn number per position (draw_position + winning_number).
- `winners` — Winners tied to draw and card, with claim status.
- `payout_batches` / `payout_transactions` — Batch processor for paying winners; idempotent and retryable.
- `prize_locks` — Locks funds (or prize allocations) during payout preparation.
- `game_state_transitions` — Track lifecycle transitions for audit and recovery.
- `game_audit_logs` — JSON-structured audit logs for operator actions.

Notes & behaviors:

- Card generation modes: `SEQUENTIAL` (sereal/serial) or `RANDOM` (random numbers per card).
- Reservation flow: create `ticket_reservations` referencing `wallet_transactions` (a hold). On capture, create `digital_tickets` and finalize wallet tx.
- Payout flow: create a `payout_batch`, insert `payout_transactions`, attempt transfers via wallet service, update `wallet_transactions`, mark payouts as `CONFIRMED` or `FAILED`. Use `prize_locks` to prevent double-spend.
- All lifecycle transitions should be recorded in `game_state_transitions` and `game_audit_logs`.

Example queries:

- Find available cards for a game: SELECT * FROM cards WHERE game_id = ? AND status = 'AVAILABLE';
- Reserve a card (pseudo): insert into ticket_reservations ... and create a wallet_transactions entry with type 'GAME_FEE' and status as hold.

Store this document alongside migrations. Update when schema changes.
