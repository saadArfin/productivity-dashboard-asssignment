
const db = require('../db');
const pino = require('pino');
const Sentry = require('@sentry/node');
const logger = pino();
const { checkIfLateEvent } = require('./lateEventService');
/**
 * Insert a single normalized event assumes validation done
 * Returns { inserted: boolean, event_id }
 */
async function insertSingleEvent(ev) {

  try {
  await checkIfLateEvent(ev);
  } catch (lateErr) {
    logger.warn({ lateErr }, 'late check failed (non-blocking)');
  }
  
  const sql = `
    INSERT INTO events (
      event_id, timestamp, worker_id, workstation_id, event_type,
      confidence, count, model_version, raw_json
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  `;

  const params = [
    ev.event_id,
    ev.timestamp,
    ev.worker_id,
    ev.workstation_id,
    ev.event_type,
    ev.confidence,
    ev.count || 0,
    ev.model_version,
    JSON.stringify(ev) 
  ];

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query(sql, params);

    if (res.rowCount === 0) {
     
      await client.query('ROLLBACK');
      return { inserted: false, event_id: ev.event_id };
    }

    await client.query('INSERT INTO ingestion_log(event_id) VALUES ($1) ON CONFLICT DO NOTHING', [ev.event_id]);

    await client.query('COMMIT');

    try {
      if (Sentry && Sentry.metrics) Sentry.metrics.count('events_ingested', 1);
    } catch (err) {
      logger.warn({ err }, 'Sentry metrics ingestion failed (non-blocking)');
    }

    return { inserted: true, event_id: ev.event_id };
  } catch (err) {
    await client.query('ROLLBACK');

    try {
      if (Sentry && Sentry.metrics) Sentry.metrics.count('events_failed', 1);
    } catch (e) { /* swallow */ }

    logger.error({ err }, 'insertSingleEvent failed');
    Sentry.captureException(err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  insertSingleEvent
};
