# AssetFlow Security & Code Quality Audit Report

This document outlines the findings of a comprehensive code audit of the AssetFlow codebase. It covers critical security vulnerabilities, architectural and business logic flaws, data integrity risks, and DevOps/configuration issues, along with step-by-step code remediations.

---

## Executive Summary

The AssetFlow application is a feature-rich, role-based resource management system. However, the codebase contains several critical authorization bypasses, privilege persistence vulnerabilities, state inconsistencies, and an incomplete implementation of the advertised "tamper-evident hash chain" logging system. 

### Vulnerability Breakdown

| Severity | Category | Issue Description | Location |
|---|---|---|---|
| **CRITICAL** | Authorization (BFLA / BOLA) | Missing role validation on critical state-modifying actions (assets, departments, categories, maintenance, audits, activity logs). | Multiple Routes |
| **HIGH** | Authorization (IDOR) | Booking cancellations and asset returns do not verify user ownership. | `bookings.ts`, `allocations.ts` |
| **HIGH** | Session Management | Demoted/Deactivated users retain access due to stale session caching. | `lib/auth.ts`, `users.ts` |
| **HIGH** | Cryptography / Logic | Unverifiable activity log hashes and empty `prevHash` (broken hash chain). | `activityLogger.ts` |
| **MEDIUM** | Data Integrity | Unused input validation schemas leading to database insertion crashes. | All routes |
| **MEDIUM** | Business Logic | State mismatch in asset transfers; transfer requests allowed for unallocated assets. | `transfers.ts` |
| **LOW** | DevOps / Quality | No rate limiting on external Groq AI diagnostic endpoint. | `maintenance.ts` |
| **LOW** | DevOps / Security | Hardcoded default passwords in seed script. | `seed.ts` |

---

## 1. Critical Security Vulnerabilities

### 1.1. Missing Role-Based Access Control (BFLA & BOLA)
**Location:** Multiple route files
*   `PATCH /api/assets/:id` (`assets.ts:156`)
*   `POST /api/departments` & `PATCH /api/departments/:id` (`departments.ts:45, 62`)
*   `POST /api/categories` & `PATCH /api/categories/:id` (`categories.ts:23, 37`)
*   `PATCH /api/maintenance-requests/:id/approve` & `reject` & `assign-technician` & `resolve` (`maintenance.ts:106, 126, 140, 158`)
*   `POST /api/audit-cycles` & `/api/audit-cycles/:id/items/:itemId/verify` & `/api/audit-cycles/:id/close` (`audits.ts:31, 108, 140`)
*   `GET /api/activity-logs` (`activity.ts:8`)

**Impact:**
Any logged-in user (even with a base `employee` role) can directly send REST requests to register, modify, or delete assets; alter department hierarchies; approve their own maintenance requests; create/close audit cycles; verify audit items; and read the entire company activity log.

**How to Fix:**
Apply the `requireRole` middleware to restrict access to authorized roles.

```diff
// In artifacts/api-server/src/routes/assets.ts
-router.patch("/assets/:id", requireAuth, async (req, res): Promise<void> => {
+router.patch("/assets/:id", requireAuth, requireRole("admin", "asset_manager"), async (req, res): Promise<void> => {

// In artifacts/api-server/src/routes/departments.ts
-router.post("/departments", requireAuth, async (req, res): Promise<void> => {
+router.post("/departments", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {

-router.patch("/departments/:id", requireAuth, async (req, res): Promise<void> => {
+router.patch("/departments/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {

// In artifacts/api-server/src/routes/categories.ts
-router.post("/categories", requireAuth, async (req, res): Promise<void> => {
+router.post("/categories", requireAuth, requireRole("admin", "asset_manager"), async (req, res): Promise<void> => {

-router.patch("/categories/:id", requireAuth, async (req, res): Promise<void> => {
+router.patch("/categories/:id", requireAuth, requireRole("admin", "asset_manager"), async (req, res): Promise<void> => {

// In artifacts/api-server/src/routes/maintenance.ts
-router.patch("/maintenance-requests/:id/approve", requireAuth, async (req, res): Promise<void> => {
+router.patch("/maintenance-requests/:id/approve", requireAuth, requireRole("admin", "asset_manager"), async (req, res): Promise<void> => {

// In artifacts/api-server/src/routes/audits.ts
-router.post("/audit-cycles", requireAuth, async (req, res): Promise<void> => {
+router.post("/audit-cycles", requireAuth, requireRole("admin", "asset_manager"), async (req, res): Promise<void> => {

-router.post("/audit-cycles/:id/close", requireAuth, async (req, res): Promise<void> => {
+router.post("/audit-cycles/:id/close", requireAuth, requireRole("admin", "asset_manager"), async (req, res): Promise<void> => {

// In artifacts/api-server/src/routes/activity.ts
-router.get("/activity-logs", requireAuth, async (req, res): Promise<void> => {
+router.get("/activity-logs", requireAuth, requireRole("admin", "asset_manager"), async (req, res): Promise<void> => {
```

*Note: For `/audit-cycles/:id/items/:itemId/verify`, verification should be restricted to the auditors assigned to that specific audit cycle, rather than any authenticated user:*
```typescript
// In artifacts/api-server/src/routes/audits.ts
router.post("/audit-cycles/:id/items/:itemId/verify", requireAuth, async (req, res): Promise<void> => {
  const cycleId = parseInt(req.params.id, 10);
  const userId = req.session.user!.id;
  
  // Verify that the user is an assigned auditor for this cycle or an admin
  const isAuditor = await db.select()
    .from(auditCycleAuditorsTable)
    .where(and(
      eq(auditCycleAuditorsTable.auditCycleId, cycleId),
      eq(auditCycleAuditorsTable.auditorId, userId)
    ));
  
  if (isAuditor.length === 0 && req.session.user!.role !== "admin") {
    res.status(403).json({ error: "You are not assigned as an auditor for this audit cycle" });
    return;
  }
  // Proceed with verification...
});
```

---

### 1.2. Insecure Direct Object Reference (IDOR) on Cancellations & Returns
**Location:** 
*   `PATCH /api/bookings/:id/cancel` (`bookings.ts:102`)
*   `POST /api/allocations/:id/return` (`allocations.ts:183`)

**Impact:**
*   **Booking Cancellation:** Any employee can cancel any booking in the system, even if they did not create it.
*   **Asset Returns:** Any user can mark any asset allocation as returned, which updates the asset status back to `available`, bypassing verification by managers or the actual employee holding the asset.

**How to Fix:**
*   Verify that the user cancelling the booking is either the user who created it (`bookedBy === sessionUser.id`) or is an administrator/manager.
*   Verify that the user returning the allocation is the assigned employee, their department head, or an asset manager/admin.

```typescript
// In artifacts/api-server/src/routes/bookings.ts
router.patch("/bookings/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const sessionUser = req.session.user!;

  const [booking] = await db.select().from(resourceBookingsTable).where(eq(resourceBookingsTable.id, id));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  // Enforce ownership check
  if (booking.bookedBy !== sessionUser.id && !["admin", "asset_manager"].includes(sessionUser.role)) {
    res.status(403).json({ error: "You are not authorized to cancel this booking" });
    return;
  }

  const [updated] = await db.update(resourceBookingsTable)
    .set({ status: "cancelled" })
    .where(and(eq(resourceBookingsTable.id, id), sql`status IN ('upcoming', 'ongoing')`))
    .returning();

  // ... rest of the code
});
```

---

### 1.3. Privilege Persistence & Session Hijacking via Stale Session Data
**Location:** 
*   `requireAuth` & `requireRole` middleware (`lib/auth.ts:3, 11`)
*   `PATCH /users/:id/role` (`users.ts:39`)
*   `PATCH /users/:id/status` (`users.ts:62`)

**Impact:**
When an administrator deactivates a user (`status: "inactive"`) or updates their role (e.g., demoting an `admin` to `employee`), the user's active session is **not** invalidated or updated. Since `requireAuth` and `requireRole` only verify the cached `req.session.user` object and never hit the database, the deactivated or demoted user retains their original permissions for the entire lifetime of their session cookie (up to 7 days).

**How to Fix:**
We must check the user's current status and role from the database during authentication, or implement session invalidation. Below is the database-verified middleware fix:

```typescript
// In artifacts/api-server/src/lib/auth.ts
import { type Request, type Response, type NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Verify user status in the database
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.user.id));
  if (!user || user.status === "inactive") {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Account is inactive or has been deleted" });
    return;
  }

  // Update session role cache in case the admin changed it
  if (req.session.user.role !== user.role) {
    req.session.user.role = user.role;
  }

  next();
}

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.session.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    // Run requireAuth logic first to ensure DB verification
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.user.id));
    if (!user || user.status === "inactive") {
      req.session.destroy(() => {});
      res.status(401).json({ error: "Account is inactive or has been deleted" });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    // Keep session synchronized
    req.session.user.role = user.role;
    next();
  };
}
```

---

## 2. Architectural & Logic Flaws

### 2.1. Unverifiable and Unchained Activity Logs
**Location:**
*   `logActivity` (`activityLogger.ts:4`)
*   `activityLogsTable` Schema (`activityLogs.ts:3`)

**Impact:**
1.  **Unverifiable Hashes:** The hash is generated using `{ userId, action, entityType, entityId, metadata, ts: Date.now() }`. The millisecond timestamp `ts` is **never stored** in the database. Thus, it is mathematically impossible to recompute or verify the hash of any activity log entry after insertion.
2.  **Unchained Log Entries:** The `prevHash` field exists in the database schema but is never populated. Logs are not chained together.
3.  **Missing Verification Interface:** The README claims there is a "Verify Integrity" action in the UI, but it is completely missing in both frontend and backend.

**How to Fix:**
1.  Add a `ts` (Unix Epoch timestamp) column to the database, or use the database's `createdAt` converted to a standardized epoch time during hash calculation.
2.  In `logActivity`, query the previous row's hash, store it as the `prevHash` for the current row, and include `prevHash` in the hash computation of the new row.

```typescript
// In artifacts/api-server/src/lib/activityLogger.ts
import { createHash } from "crypto";
import { db, activityLogsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

export async function logActivity(params: {
  userId: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { userId, action, entityType, entityId, metadata = {} } = params;

  // Retrieve the latest log entry to chain the hashes
  const [lastLog] = await db.select()
    .from(activityLogsTable)
    .orderBy(desc(activityLogsTable.id))
    .limit(1);
  
  const prevHash = lastLog?.entryHash ?? "0000000000000000000000000000000000000000000000000000000000000000";
  const now = new Date();

  // Create standard content string using properties that are actually saved in the DB
  const content = JSON.stringify({
    userId,
    action,
    entityType,
    entityId: entityId ?? null,
    metadata,
    prevHash,
    createdAt: now.toISOString()
  });

  const entryHash = createHash("sha256").update(content).digest("hex");

  await db.insert(activityLogsTable).values({
    userId,
    action,
    entityType,
    entityId: entityId ?? null,
    metadata,
    prevHash,
    entryHash,
    createdAt: now,
  });
}
```

Implement the missing verification endpoint:
```typescript
// In artifacts/api-server/src/routes/activity.ts
router.get("/activity-logs/verify", requireAuth, requireRole("admin"), async (req, res) => {
  const logs = await db.select().from(activityLogsTable).orderBy(activityLogsTable.id);
  
  let expectedPrevHash = "0000000000000000000000000000000000000000000000000000000000000000";
  
  for (const log of logs) {
    if (log.prevHash !== expectedPrevHash) {
      res.json({ verified: false, tamperedLogId: log.id, reason: "Hash chain broken: prev_hash mismatch" });
      return;
    }
    
    const content = JSON.stringify({
      userId: log.userId,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      metadata: log.metadata,
      prevHash: log.prevHash,
      createdAt: log.createdAt.toISOString()
    });
    
    const calculatedHash = createHash("sha256").update(content).digest("hex");
    if (log.entryHash !== calculatedHash) {
      res.json({ verified: false, tamperedLogId: log.id, reason: "Entry hash tampered" });
      return;
    }
    
    expectedPrevHash = log.entryHash;
  }
  
  res.json({ verified: true });
});
```

---

### 2.2. State Inconsistency in Transfer Requests
**Location:** `transfers.ts`

**Impact:**
1.  When a transfer request is approved, the system closes the old allocation and creates a new one in the database, but it **never updates the asset's status** in `assetsTable`. If the asset was marked as `'under_maintenance'` or `'lost'`, it remains in that status while having an active allocation.
2.  A transfer request can be raised for an asset that has **no active allocation**, resulting in `fromEmployeeId = null`. This bypasses standard allocation checks (such as verifying if the asset is currently `'available'`).

**How to Fix:**
*   Modify `POST /transfer-requests` to verify that the asset is currently allocated and retrieve its active holder. If the asset is not allocated, reject the request and prompt the user to use the direct allocation endpoint.
*   Update the transaction in `PATCH /transfer-requests/:id/approve` to update the asset's status in `assetsTable` to `'allocated'`.

```typescript
// In artifacts/api-server/src/routes/transfers.ts (Approve Endpoint)
  await db.transaction(async (tx) => {
    // 1. Close current allocation
    await tx.update(assetAllocationsTable).set({ status: "returned", returnedAt: new Date() })
      .where(and(eq(assetAllocationsTable.assetId, tr.assetId), eq(assetAllocationsTable.status, "active")));
    
    // 2. Open new allocation
    await tx.insert(assetAllocationsTable).values({
      assetId: tr.assetId,
      employeeId: tr.toEmployeeId,
      createdBy: user.id,
      status: "active",
    });

    // 3. Update the asset status to "allocated" in assets table
    await tx.update(assetsTable)
      .set({ status: "allocated", updatedAt: new Date() })
      .where(eq(assetsTable.id, tr.assetId));

    // 4. Resolve the transfer request
    await tx.update(transferRequestsTable).set({
      status: "approved",
      approvedBy: user.id,
      resolvedAt: new Date(),
    }).where(eq(transferRequestsTable.id, id));
  });
```

---

## 3. Data Integrity & Code Quality Issues

### 3.1. Complete Lack of Input Validation (Zod Schemas Unused)
**Location:** All route files

**Impact:**
The `@workspace/api-zod` contains Zod schemas, but they are not used in backend routes. As a result, the server parses inputs directly from `req.body`. For example, `new Date(startTime)` is performed on unvalidated user input. If a user passes an invalid date format, or fields containing SQL characters/payloads:
*   `new Date()` will evaluate to `Invalid Date`.
*   Inserting an invalid date into a PostgreSQL timestamp field throws a database error, causing Express to respond with an unhandled `500 Internal Server Error`, exposing database schemas and connection parameters.
*   Invalid schemas allow malformed fields (e.g. invalid emails, overly short passwords, incorrect role strings) to be accepted.

**How to Fix:**
Implement a Zod request validation middleware to parse request bodies, query parameters, and route parameters against their respective generated schemas before they reach the route handlers.

```typescript
// In artifacts/api-server/src/middlewares/validation.ts
import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.errors });
        return;
      }
      next(error);
    }
  };
}
```

Usage:
```typescript
import { validateBody } from "../middlewares/validation";
import { CreateAssetBody } from "@workspace/api-zod";

router.post("/assets", requireAuth, requireRole("admin", "asset_manager"), validateBody(CreateAssetBody), async (req, res) => {
  // Safe to insert req.body directly
});
```

---

### 3.2. Unhandled Express Promises & Missing Global Error Handler
**Location:** `app.ts`

**Impact:**
Although Express 5 handles basic promise rejections, the lack of a custom global error handler means any database error (such as a unique constraint violation on `assetTag` or a database pool timeout) is returned using the default Express HTML or raw text error page. This results in Information Disclosure (stack traces, database query structures, column names, etc.) being exposed to the client.

**How to Fix:**
Add a global error-handling middleware at the very end of `app.ts` (after all routes) to capture all errors, log them using `pino`, and send a clean JSON error response.

```typescript
// In artifacts/api-server/src/app.ts
app.use("/api", router);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(err, "Unhandled error occurred");

  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === "production" 
    ? "An internal server error occurred" 
    : err.message || "An error occurred";

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});
```

---

## 4. DevOps, AI, and Configuration Risks

### 4.1. Groq AI Predictive Diagnostics Denial of Service (DoS)
**Location:** `/api/maintenance-requests/diagnose` (`maintenance.ts:72`)

**Impact:**
The predictive maintenance diagnose route makes a call to the Groq API key on every request. Since this route lacks rate-limiting, an attacker or a loop bug in a client component can make thousands of requests to this endpoint, exhausting the organization's Groq quota, crashing the diagnostic service, and generating high API usage costs.

**How to Fix:**
Apply `express-rate-limit` to restrict request frequency on this endpoint (e.g., 5 requests per minute per user).

```typescript
import rateLimit from "express-rate-limit";

const diagnoseLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per window
  message: { error: "Too many diagnostics requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/maintenance-requests/diagnose", requireAuth, diagnoseLimiter, async (req, res): Promise<void> => {
  // ... rest of AI logic
});
```

---

### 4.2. Default Credentials & Hardcoded Secrets in Seed Scripts
**Location:** `seed.ts`

**Impact:**
The `seed.ts` script contains hardcoded login credentials (`admin@assetflow.io` with password `admin123` and regular users with password `password`). If the seed script is run during deployment to set up the initial configuration, the application will remain vulnerable to default credential attacks until these default accounts are manually updated.

**How to Fix:**
Replace default credentials with values sourced from environment variables. If environment variables are missing, generate secure random passwords and print them to the secure console during deployment.

```typescript
// In artifacts/api-server/src/seed.ts
const adminPassword = process.env.SEED_ADMIN_PASSWORD || "admin123";
const employeePassword = process.env.SEED_EMPLOYEE_PASSWORD || "password";

const hash = (pw: string) => bcrypt.hash(pw, 12);
// ...
```
