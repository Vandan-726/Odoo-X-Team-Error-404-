const { Client } = require('pg');

async function createDb() {
  const client = new Client({
    connectionString: 'postgres://postgres:postgres@localhost:5432/postgres'
  });
  
  try {
    await client.connect();
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'assetflow'");
    if (res.rowCount === 0) {
      await client.query('CREATE DATABASE assetflow');
      console.log('Database assetflow created successfully.');
    } else {
      console.log('Database assetflow already exists.');
    }
  } catch (err) {
    console.error('Error creating database:', err);
  } finally {
    await client.end();
  }
}

createDb();
