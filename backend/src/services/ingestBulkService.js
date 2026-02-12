const db = require('../db');
const pino = require('pino');
const Sentry = require('@sentry/node');
const { validateEventSafe } = require('./validators');

const logger = pino();

/**
 * Takes a list of raw events validates them and inserts valid ones in 
 * batches skipping duplicates ssuccessfully inserted events are added to
 * `ingestion_log`
 *
 * Returns a report detailing total received valid invalid inserted
 * and duplicate counts along with specific error messages for invalid rows
 */

async function insertBulkEvents(rawEvents, options = {}) {
  const batchSize = options.batchSize || 200;

  if (!Array.isArray(rawEvents)) {
    const err = new Error('events must be an array');
    err.status = 400;
    throw err;
  }

  const totalReceived = rawEvents.length;
  const validated = [];
  const invalidRows = [];

  rawEvents.forEach((ev, idx) => {
    const v = validateEventSafe(ev);
    if (!v.ok) {
      invalidRows.push({ index: idx, error: v.error, raw: ev });
    } else {
      validated.push(v.normalized);
    }
  });

  const totalInvalid = invalidRows.length;
  const totalValid = validated.length;

  
  try { if (Sentry && Sentry.metrics) Sentry.metrics.count('events_bulk_received', totalReceived); } catch (e) {}
  try { if (Sentry && Sentry.metrics) Sentry.metrics.count('events_bulk_invalid', totalInvalid); } catch (e) {}

  let totalInserted = 0;
  let totalDuplicate = 0;
  const insertErrors = [];

  
  async function processBatch(batch) {
    if (batch.length === 0) return { inserted: 0, duplicates: 0 };

    const values = [];
    const placeholders = batch.map((ev, idx) => {
      const base = idx * 9;
      values.push(
        ev.event_id,
        ev.timestamp,
        ev.worker_id,
        ev.workstation_id,
        ev.event_type,
        ev.confidence,
        ev.count || 0,
        ev.model_version || null,
        JSON.stringify(ev)
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
    });

    const insertSql = `
      INSERT INTO events (event_id, timestamp, worker_id, workstation_id, event_type, confidence, count, model_version, raw_json)
      VALUES ${placeholders.join(',')}
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `;

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      
      const res = await client.query(insertSql, values);
      const insertedIds = res.rows.map(r => r.event_id);
      const insertedCount = insertedIds.length;

      if (insertedCount > 0) {
        const ilPlaceholders = insertedIds.map((_, i) => `($${i + 1})`).join(',');
        const ilSql = `INSERT INTO ingestion_log(event_id) VALUES ${ilPlaceholders} ON CONFLICT DO NOTHING`;
        await client.query(ilSql, insertedIds);
      }

      await client.query('COMMIT');

      const duplicates = batch.length - insertedCount;
      return { inserted: insertedCount, duplicates };
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err }, 'Bulk insert batch failed - rolling back this batch');
      
      insertErrors.push({ error: err.message });
      return { inserted: 0, duplicates: 0 };
    } finally {
      client.release();
    }
  }

  for (let i = 0; i < validated.length; i += batchSize) {
    const batch = validated.slice(i, i + batchSize);
    const { inserted, duplicates } = await processBatch(batch);
    totalInserted += inserted;
    totalDuplicate += duplicates;
  }

  try { if (Sentry && Sentry.metrics) Sentry.metrics.count('events_bulk_inserted', totalInserted); } catch (e) {}
  try { if (Sentry && Sentry.metrics) Sentry.metrics.count('events_bulk_duplicates', totalDuplicate); } catch (e) {}

  return {
    totalReceived,
    totalValid,
    totalInvalid,
    totalInserted,
    totalDuplicates: totalDuplicate,
    invalidRows,
    insertErrors
  };
}

module.exports = {
  insertBulkEvents
};
