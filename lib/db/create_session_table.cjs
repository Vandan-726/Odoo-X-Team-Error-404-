const { Client } = require('pg');
const c = new Client({ connectionString: 'postgres://postgres:12345678@localhost:5432/assetflow' });

async function createTable() {
  await c.connect();
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      ) WITH (OIDS=FALSE);
      ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
      CREATE INDEX "IDX_session_expire" ON "session" ("expire");
    `);
    console.log("TABLE CREATED");
  } catch(e) {
    console.log("ERROR", e.message);
  } finally {
    await c.end();
  }
}

createTable();
