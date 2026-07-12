import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '../../.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    await client.connect();
    console.log("SUCCESSFULLY CONNECTED TO:", process.env.DATABASE_URL);
    const res = await client.query('SELECT current_database()');
    console.log("Current Database:", res.rows[0].current_database);
  } catch (e) {
    console.error("CONNECTION ERROR:", e.message);
  } finally {
    await client.end();
  }
}
run();
