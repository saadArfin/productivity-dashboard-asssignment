const db = require('../db');
const pino = require('pino');
const Sentry = require('@sentry/node');
const logger = pino();
const { checkIfLateSingle } = require('./lateEventService');

/**
 * insertSingleEvent(ev)
 * ev is normalized (has event_id, timestamp, worker_id, workstation_id, event_type, confidence, count, model_version)
 */
async function insertSingleEvent(ev) {
  const client = await db.pool.connect();
  try {
    // ccheck late arrival (single-event check)
    let isLate = false;
    try {
      const lateRes = await checkIfLateSingle(ev);
      isLate = !!lateRes.isLate;
    } catch (e) {
      logger.warn({ err: e }, 'late check failed (non-blocking)');
    }

    await client.query('BEGIN');

    const sql = `
      INSERT INTO events (
        event_id, timestamp, worker_id, workstation_id, event_type,
        confidence, count, model_version, is_late, raw_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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
      ev.model_version || null,
      isLate,
      JSON.stringify(ev)
    ];

    const res = await client.query(sql, params);

    if (res.rowCount === 0) {
      await client.query('ROLLBACK');
      // duplicate
      try { if (Sentry && Sentry.metrics) Sentry.metrics.count('events_duplicate', 1); } catch (e) {}
      return { inserted: false, event_id: ev.event_id };
    }

    // insert ingestion log
    await client.query('INSERT INTO ingestion_log(event_id) VALUES ($1) ON CONFLICT DO NOTHING', [ev.event_id]);

    // If event is late, enqueue recompute_requests for worker and workstation
    if (isLate) {
      // create two potential requests (worker-level and workstation-level)
      const requests = [];
      if (ev.worker_id) requests.push({ entity_type: 'worker', entity_id: ev.worker_id });
      if (ev.workstation_id) requests.push({ entity_type: 'workstation', entity_id: ev.workstation_id });

      for (const r of requests) {
        try {
          // usee window_start as the event timestamp to roughly indicate affected window.
          const rqSql = `
            INSERT INTO recompute_requests (entity_type, entity_id, window_start, window_end)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (entity_type, entity_id, window_start) DO NOTHING
          `;
          await client.query(rqSql, [r.entity_type, r.entity_id, ev.timestamp, ev.timestamp]);
        } catch (rqErr) {
          logger.warn({ rqErr }, 'failed to enqueue recompute request (non-blocking)');
        }
      }
    }

    await client.query('COMMIT');

    // observability
    try { if (Sentry && Sentry.metrics) Sentry.metrics.count('events_ingested', 1); } catch (e) {}

    return { inserted: true, event_id: ev.event_id };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'insertSingleEvent failed');
    try { if (Sentry && Sentry.metrics) Sentry.metrics.count('events_failed', 1); } catch (e) {}
    Sentry.captureException(err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { insertSingleEvent };