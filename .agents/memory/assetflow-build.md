---
name: AssetFlow build
description: Key decisions and quirks from the AssetFlow hackathon build
---

## Codegen
- OpenAPI spec lives at `lib/api-spec/openapi.yaml`. Do NOT use `format: email` on string fields — Orval generates `zod.email()` which doesn't exist in zod v3/v4.
- Run codegen: `pnpm --filter @workspace/api-spec run codegen`
- Generated hooks import from `@workspace/api-client-react` (not relative paths)

## Auth
- `express-session` + `bcrypt` — plain email/password, no Clerk/OAuth
- Session stored in PostgreSQL via `connect-pg-simple` (table auto-created)
- Session type declared in `artifacts/api-server/src/types/session.d.ts`
- `SESSION_SECRET` env var must be set (available as Replit secret)

## Seed
- Run: `pnpm --filter @workspace/api-server run seed`
- Requires `tsx` devDep on api-server (already installed)
- Do NOT import `dotenv/config` in seed — DATABASE_URL is already in env via Replit

**Why:** dotenv package not installed on api-server; env vars are injected by Replit automatically.

## Business logic
- Double-allocation guard: check `assets.status !== 'available'` before allocating; return 409 with holder info
- Booking overlap: `start_time < newEnd AND end_time > newStart`; exact adjacency allowed
- Maintenance state machine: pending→approved→technician_assigned→resolved; approve sets asset `under_maintenance`, resolve sets `available` (both in transactions)
- Transfer approve: transaction closes old allocation, opens new one for `toEmployeeId`
- Audit close: bulk-sets missing items' assets to `lost` in transaction
