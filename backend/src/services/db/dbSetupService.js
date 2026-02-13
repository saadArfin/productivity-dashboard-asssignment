const db = require('../../db');

async function createTables() {


  // ensure uuid generator is available (pgcrypto)
  try {
    await db.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  } catch (err) {
    console.warn('Could not create pgcrypto extension (may already exist or insufficient privileges)', err.message || err);
  }

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
      raw_json JSONB
    );
  `);

  // migrations — add new columns if table already existed
  await db.query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT false
  `);

  await db.query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ DEFAULT NOW()
  `);

  // Indexes
  await db.query(`CREATE INDEX IF NOT EXISTS idx_events_time ON events (timestamp);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_events_worker ON events (worker_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_events_workstation ON events (workstation_id);`);

  // Ingestion log(for dedupe)
  await db.query(`
    CREATE TABLE IF NOT EXISTS ingestion_log (
      event_id TEXT PRIMARY KEY,
      first_seen_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // recompute requests table
  await db.query(`
    CREATE TABLE IF NOT EXISTS recompute_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      window_start TIMESTAMPTZ,
      window_end TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(entity_type, entity_id, window_start)
    );
  `);

   // add migration-safe updated_at column for recompute_requests
    await db.query(`
      ALTER TABLE recompute_requests
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);

  // Metrics cache table for precomputed metrics
  await db.query(`
    CREATE TABLE IF NOT EXISTS metrics_cache (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type TEXT NOT NULL,         -- 'worker' | 'workstation' | 'factory'
      entity_id TEXT NOT NULL,           -- use 'FACTORY' for factory-level metrics
      window_start TIMESTAMPTZ NOT NULL,
      window_end TIMESTAMPTZ NOT NULL,
      metrics JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(entity_type, entity_id, window_start, window_end)
    );
  `);
   
}

module.exports = { createTables };