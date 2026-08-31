const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL no está definida. Configura .env antes de usar la base de datos.');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('supabase')
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});

module.exports = { pool };
