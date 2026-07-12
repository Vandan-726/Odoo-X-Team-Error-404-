const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/(^"|"$)/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

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
