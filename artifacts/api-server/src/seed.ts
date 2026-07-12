import path from "path";
import fs from "fs";

// Fallback to load ../../.env if dotenv/config didn't find it in api-server
const envPath = path.join(process.cwd(), "../../.env");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf-8");
  envConfig.split("\n").forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/(^"|"$)/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

import bcrypt from "bcrypt";
import {
  db,
  usersTable,
  departmentsTable,
  assetCategoriesTable,
  assetsTable,
  assetAllocationsTable,
  resourceBookingsTable,
  maintenanceRequestsTable,
  auditCyclesTable,
  auditItemsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Seeding database...");

  // Clear tables in dependency order
  await db.execute(sql`TRUNCATE audit_items, audit_cycle_auditors, audit_cycles, maintenance_requests, resource_bookings, transfer_requests, asset_allocations, assets, asset_categories, users, departments, notifications, activity_logs RESTART IDENTITY CASCADE`);

  // --- Departments ---
  const [engineering, operations, hr, finance] = await db
    .insert(departmentsTable)
    .values([
      { name: "Engineering", status: "active" },
      { name: "Operations", status: "active" },
      { name: "Human Resources", status: "active" },
      { name: "Finance", status: "active" },
    ])
    .returning();

  // --- Users ---
  const hash = (pw: string) => bcrypt.hash(pw, 12);
  const [admin, manager, alice, bob, carol, dave] = await db
    .insert(usersTable)
    .values([
      {
        name: "Admin User",
        email: "admin@assetflow.io",
        passwordHash: await hash("admin123"),
        role: "admin",
        status: "active",
        departmentId: operations.id,
      },
      {
        name: "Morgan Lee",
        email: "morgan@assetflow.io",
        passwordHash: await hash("password"),
        role: "asset_manager",
        status: "active",
        departmentId: operations.id,
      },
      {
        name: "Alice Chen",
        email: "alice@assetflow.io",
        passwordHash: await hash("password"),
        role: "employee",
        status: "active",
        departmentId: engineering.id,
      },
      {
        name: "Bob Torres",
        email: "bob@assetflow.io",
        passwordHash: await hash("password"),
        role: "employee",
        status: "active",
        departmentId: engineering.id,
      },
      {
        name: "Carol Kim",
        email: "carol@assetflow.io",
        passwordHash: await hash("password"),
        role: "department_head",
        status: "active",
        departmentId: hr.id,
      },
      {
        name: "Dave Patel",
        email: "dave@assetflow.io",
        passwordHash: await hash("password"),
        role: "employee",
        status: "active",
        departmentId: finance.id,
      },
    ])
    .returning();

  // Update department heads
  await db
    .update(departmentsTable)
    .set({ headUserId: admin.id })
    .where(sql`id = ${operations.id}`);
  await db
    .update(departmentsTable)
    .set({ headUserId: carol.id })
    .where(sql`id = ${hr.id}`);

  // --- Asset Categories ---
  const [laptops, monitors, phones, furniture, vehicles, av] = await db
    .insert(assetCategoriesTable)
    .values([
      { name: "Laptops", extraFields: { brand: true, model: true, ram_gb: true, storage_gb: true } },
      { name: "Monitors", extraFields: { brand: true, size_in: true, resolution: true } },
      { name: "Mobile Devices", extraFields: { brand: true, imei: true } },
      { name: "Furniture", extraFields: {} },
      { name: "Vehicles", extraFields: { license_plate: true, vin: true } },
      { name: "AV Equipment", extraFields: { brand: true, model: true } },
    ])
    .returning();

  // --- Assets ---
  const now = new Date();
  const past = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d.toISOString().split("T")[0]!;
  };

  const assetRows = await db
    .insert(assetsTable)
    .values([
      // Laptops
      { assetTag: "LAP-001", name: "MacBook Pro 16\" (Alice)", categoryId: laptops.id, serialNumber: "C02XL0PYJG5H", acquisitionDate: past(400), acquisitionCost: "2499.00", condition: "good", location: "Engineering Floor A", isBookable: false, status: "allocated", departmentId: engineering.id },
      { assetTag: "LAP-002", name: "MacBook Pro 14\" (Bob)", categoryId: laptops.id, serialNumber: "C02YZ1RYJG8H", acquisitionDate: past(300), acquisitionCost: "1999.00", condition: "good", location: "Engineering Floor A", isBookable: false, status: "allocated", departmentId: engineering.id },
      { assetTag: "LAP-003", name: "Dell XPS 15 (Available)", categoryId: laptops.id, serialNumber: "DL9XPS15A03", acquisitionDate: past(200), acquisitionCost: "1799.00", condition: "good", location: "IT Storage", isBookable: false, status: "available", departmentId: operations.id },
      { assetTag: "LAP-004", name: "ThinkPad X1 Carbon (Maintenance)", categoryId: laptops.id, serialNumber: "TP-X1C-2023-04", acquisitionDate: past(600), acquisitionCost: "1599.00", condition: "fair", location: "IT Lab", isBookable: false, status: "under_maintenance", departmentId: hr.id },
      { assetTag: "LAP-005", name: "Surface Pro 9 (Carol)", categoryId: laptops.id, serialNumber: "MSSRFP9HR05", acquisitionDate: past(180), acquisitionCost: "1399.00", condition: "good", location: "HR Office", isBookable: false, status: "allocated", departmentId: hr.id },
      // Monitors
      { assetTag: "MON-001", name: "LG 27\" 4K Monitor A", categoryId: monitors.id, serialNumber: "LG4K27A001", acquisitionDate: past(500), acquisitionCost: "699.00", condition: "good", location: "Conference Room Alpha", isBookable: true, status: "available", departmentId: operations.id },
      { assetTag: "MON-002", name: "Dell 32\" UltraSharp", categoryId: monitors.id, serialNumber: "DU32US002", acquisitionDate: past(450), acquisitionCost: "849.00", condition: "good", location: "Engineering Floor B", isBookable: true, status: "available", departmentId: engineering.id },
      { assetTag: "MON-003", name: "Samsung 34\" Ultrawide", categoryId: monitors.id, serialNumber: "SS34UW003", acquisitionDate: past(200), acquisitionCost: "999.00", condition: "good", location: "Finance Office", isBookable: true, status: "available", departmentId: finance.id },
      // Phones
      { assetTag: "PHN-001", name: "iPhone 14 Pro (Dave)", categoryId: phones.id, serialNumber: "APIP14P001", acquisitionDate: past(250), acquisitionCost: "1099.00", condition: "good", location: "Finance Office", isBookable: false, status: "allocated", departmentId: finance.id },
      { assetTag: "PHN-002", name: "Samsung Galaxy S23 (Available)", categoryId: phones.id, serialNumber: "SGS23002", acquisitionDate: past(350), acquisitionCost: "799.00", condition: "good", location: "IT Storage", isBookable: false, status: "available", departmentId: operations.id },
      // AV Equipment
      { assetTag: "AV-001", name: "Projector Epson 4K", categoryId: av.id, serialNumber: "EPPRJ4K001", acquisitionDate: past(700), acquisitionCost: "1299.00", condition: "fair", location: "Conference Room Alpha", isBookable: true, status: "available", departmentId: operations.id },
      { assetTag: "AV-002", name: "Logitech MeetUp Camera", categoryId: av.id, serialNumber: "LGMU002", acquisitionDate: past(180), acquisitionCost: "549.00", condition: "good", location: "Conference Room Beta", isBookable: true, status: "available", departmentId: operations.id },
      // Vehicles
      { assetTag: "VEH-001", name: "Toyota Camry (Fleet)", categoryId: vehicles.id, serialNumber: "1HGCM82633A004", acquisitionDate: past(900), acquisitionCost: "28000.00", condition: "fair", location: "Parking Level B1", isBookable: true, status: "available", departmentId: operations.id },
      // Furniture
      { assetTag: "FRN-001", name: "Ergonomic Standing Desk", categoryId: furniture.id, serialNumber: null, acquisitionDate: past(365), acquisitionCost: "899.00", condition: "good", location: "Engineering Floor A", isBookable: false, status: "available", departmentId: engineering.id },
    ])
    .returning();

  const assetMap = new Map(assetRows.map((a) => [a.assetTag, a]));

  // --- Active Allocations ---
  const overdueDate = past(45); // 45 days ago — definitely overdue if expected return was 30 days ago
  const allocationRows = await db
    .insert(assetAllocationsTable)
    .values([
      // Alice has LAP-001
      { assetId: assetMap.get("LAP-001")!.id, employeeId: alice.id, departmentId: engineering.id, expectedReturnDate: past(15), status: "active", createdBy: manager.id },
      // Bob has LAP-002
      { assetId: assetMap.get("LAP-002")!.id, employeeId: bob.id, departmentId: engineering.id, expectedReturnDate: past(8), status: "active", createdBy: manager.id },
      // Carol has LAP-005
      { assetId: assetMap.get("LAP-005")!.id, employeeId: carol.id, departmentId: hr.id, expectedReturnDate: null, status: "active", createdBy: manager.id },
      // Dave has PHN-001
      { assetId: assetMap.get("PHN-001")!.id, employeeId: dave.id, departmentId: finance.id, expectedReturnDate: null, status: "active", createdBy: manager.id },
    ])
    .returning();

  // Historical (returned) allocation
  await db.insert(assetAllocationsTable).values([
    {
      assetId: assetMap.get("LAP-003")!.id,
      employeeId: alice.id,
      departmentId: engineering.id,
      expectedReturnDate: past(60),
      returnedAt: new Date(Date.now() - 62 * 24 * 3600 * 1000),
      returnConditionNotes: "Returned in good condition",
      status: "returned",
      createdBy: manager.id,
    },
  ]);

  // --- Maintenance Requests ---
  await db.insert(maintenanceRequestsTable).values([
    {
      assetId: assetMap.get("LAP-004")!.id,
      raisedBy: alice.id,
      issueDescription: "Screen flickers when brightness > 50%. Likely backlight issue.",
      priority: "high",
      status: "approved",
      approvedBy: manager.id,
    },
    {
      assetId: assetMap.get("AV-001")!.id,
      raisedBy: carol.id,
      issueDescription: "Projector lamp warning — less than 100 hours remaining. Needs lamp replacement before next all-hands.",
      priority: "medium",
      status: "pending",
    },
    {
      assetId: assetMap.get("LAP-002")!.id,
      raisedBy: bob.id,
      issueDescription: "Battery drains to 0% in under 2 hours on normal workload. Battery replacement needed.",
      priority: "medium",
      status: "technician_assigned",
      approvedBy: manager.id,
      assignedTechnician: "Tony Nakamura",
    },
  ]);

  // --- Resource Bookings ---
  const futureDate = (hoursFromNow: number) => {
    const d = new Date(now.getTime() + hoursFromNow * 3600 * 1000);
    return d;
  };

  await db.insert(resourceBookingsTable).values([
    {
      assetId: assetMap.get("MON-001")!.id,
      bookedBy: alice.id,
      departmentId: engineering.id,
      purpose: "Sprint planning session",
      startTime: futureDate(2),
      endTime: futureDate(4),
      status: "upcoming",
    },
    {
      assetId: assetMap.get("VEH-001")!.id,
      bookedBy: carol.id,
      departmentId: hr.id,
      purpose: "Candidate airport pickup",
      startTime: futureDate(24),
      endTime: futureDate(26),
      status: "upcoming",
    },
    {
      assetId: assetMap.get("AV-002")!.id,
      bookedBy: dave.id,
      departmentId: finance.id,
      purpose: "Q4 budget review with board",
      startTime: futureDate(48),
      endTime: futureDate(51),
      status: "upcoming",
    },
    // Past completed booking
    {
      assetId: assetMap.get("MON-001")!.id,
      bookedBy: manager.id,
      departmentId: operations.id,
      purpose: "Operations all-hands",
      startTime: futureDate(-120),
      endTime: futureDate(-118),
      status: "completed",
    },
  ]);

  // --- Audit Cycle ---
  const [auditCycle] = await db
    .insert(auditCyclesTable)
    .values({
      name: "Q3 2026 Full Asset Audit",
      scopeDepartmentId: null,
      scopeLocation: null,
      startDate: past(7),
      endDate: past(-7), // ends in a week
      status: "in_progress",
      createdBy: admin.id,
    })
    .returning();

  // Add audit items for a sample of assets
  const auditAssets = [
    assetMap.get("LAP-001"),
    assetMap.get("LAP-002"),
    assetMap.get("LAP-003"),
    assetMap.get("LAP-004"),
    assetMap.get("MON-001"),
    assetMap.get("MON-002"),
    assetMap.get("AV-001"),
    assetMap.get("VEH-001"),
  ].filter(Boolean) as typeof assetsTable.$inferSelect[];

  await db.insert(auditItemsTable).values(
    auditAssets.map((a, i) => ({
      auditCycleId: auditCycle.id,
      assetId: a.id,
      expectedLocation: a.location,
      verificationStatus:
        i < 3 ? "verified" : i === 3 ? "missing" : "pending",
      verifiedBy: i < 3 ? alice.id : null,
      verifiedAt: i < 3 ? new Date() : null,
      notes: i === 3 ? "Asset not found at expected location. Possible theft." : null,
    }))
  );

  console.log("Seed complete!");
  console.log("  Admin:    admin@assetflow.io / admin123");
  console.log("  Manager:  morgan@assetflow.io / password");
  console.log("  Employee: alice@assetflow.io / password");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
