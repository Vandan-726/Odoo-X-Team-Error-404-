# AssetFlow

Enterprise Asset & Resource Management System — hackathon build.

## Quick Start

### Dev credentials (after seeding)

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@assetflow.io` | `admin123` |
| Asset Manager | `morgan@assetflow.io` | `password` |
| Employee | `alice@assetflow.io` | `password` |

### Seed the database

```bash
pnpm --filter @workspace/api-server run seed
```

This truncates all tables and inserts ~14 assets across 6 categories, 6 users across 4 departments, active allocations (2 overdue), 3 maintenance requests, 4 bookings, and 1 open audit cycle with mixed verification statuses.

### Run dev

Both workflows start automatically in Replit. If restarting manually:

```bash
# API server (port from $PORT env, defaults to 8080)
pnpm --filter @workspace/api-server run dev

# Frontend (port from $PORT)
pnpm --filter @workspace/assetflow run dev
```

---

## Architecture

```
artifacts/
  api-server/     Express 5 + TypeScript — REST API
  assetflow/      React + Vite + Tailwind — frontend SPA

lib/
  db/             Drizzle ORM schema + pg pool
  api-spec/       OpenAPI 3.1 spec + Orval codegen config
  api-client-react/  Generated react-query hooks
  api-zod/           Generated Zod validators
```

### Auth
Plain `express-session` + `bcrypt`. Sessions stored in PostgreSQL via `connect-pg-simple`. No OAuth, no Clerk. Role is server-enforced on signup (`employee`); admins promote via the Org > Employees tab.

### Double-allocation guard
`POST /api/allocations` checks `assets.status !== 'available'` before inserting. If blocked, returns HTTP 409 with `{ error, currentHolderName, currentHolderDepartment, allocationId }`. The frontend Allocations page surfaces this as an ultraviolet BLOCKED banner with a "Request Transfer" CTA.

### Booking overlap check
`POST /api/bookings` queries for any existing booking where `start_time < newEnd AND end_time > newStart` with status `in ('upcoming', 'ongoing')`. Exact adjacency (new start == existing end) is allowed. Returns HTTP 409 with `conflictingBookings[]` on collision.

### Maintenance state machine
```
pending → approved → technician_assigned → in_progress → resolved
pending → rejected
```
Approving a request sets `assets.status = 'under_maintenance'`. Resolving it sets `assets.status = 'available'` in a transaction.

### Transfer workflow
`POST /api/transfer-requests` captures `fromEmployeeId` from the current active allocation. `PATCH .../approve` runs a transaction: closes the existing allocation, opens a new one for `toEmployeeId`, marks the transfer approved.

### Audit cycle close
`POST /api/audit-cycles/:id/close` transaction: sets cycle status to `closed`, then bulk-updates all assets with `verificationStatus = 'missing'` to `assets.status = 'lost'`.

### Activity log integrity
Each entry hashes `{ userId, action, entityType, entityId, metadata, ts }` with SHA-256 and stores in `entry_hash`. Chain hash (`prev_hash`) is reserved for future tamper-evidence chaining.

---

## Deferred / out of scope (spec §7)

- **WebSocket real-time push** — currently polled (dashboard 30s, notifications 15s)
- **File upload for asset photos and maintenance photos** — fields exist in the schema and API; no S3/object-storage integration wired
- **Barcode / QR code scanning** — `asset_tag` field present; scanner UI not built
- **Email / SMS notifications** — notification records are created in DB; no SMTP/Twilio wired
- **Prev-hash tamper-evidence chain** — column exists, not populated
- **Drizzle migrations** — using `drizzle-kit push` for dev; production would need proper migration files
- **RBAC on all individual routes** — auth middleware protects all routes; some management actions (e.g. asset creation) check role inline; a middleware-level role check per route group is a cleanup TODO
- **Offline / PWA support**
