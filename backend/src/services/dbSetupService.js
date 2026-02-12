
const db = require("../db");

async function createTables() {
  // Workers
  await db.query(`
    CREATE TABLE IF NOT EXISTS workers (
      worker_id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);

  // Workstations
  await db.query(`
    CREATE TABLE IF NOT EXISTS workstations (
      workstation_id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);

  // Events
  await db.query(`
    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      timestamp TIMESTAMPTZ NOT NULL,
      worker_id TEXT,
      workstation_id TEXT,
      event_type TEXT NOT NULL,
      confidence REAL,
      count INTEGER DEFAULT 0,
      model_version TEXT,
      raw_json JSONB,
      ingested_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Ingestion log (for dedupe)
  await db.query(`
    CREATE TABLE IF NOT EXISTS ingestion_log (
      event_id TEXT PRIMARY KEY,
      first_seen_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log("Tables created successfully");
}

module.exports = { createTables };
