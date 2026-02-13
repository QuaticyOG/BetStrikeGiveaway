const { Pool } = require("pg");
const cfg = require("./config");

const pool = new Pool({
  connectionString: cfg.DATABASE_URL,
  // Railway Postgres typically requires SSL. pg can handle it like this:
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

async function query(text, params) {
  return pool.query(text, params);
}

async function close() {
  await pool.end();
}

module.exports = { query, close };
