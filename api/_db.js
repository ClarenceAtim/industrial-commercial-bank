// Shared Postgres pool for the account-application API.
// Required environment variable: DATABASE_URL (Neon connection string, SSL).
// Never put a connection string or any credential in this file.
const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5
  });
  pool.on('error', () => {
    // Idle-client errors are logged by the platform; never log connection details.
  });
  return pool;
}

module.exports = { getPool };
