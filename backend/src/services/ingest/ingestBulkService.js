const db = require('../../db');
const pino = require('pino');
const Sentry = require('@sentry/node');
const { validateEventSafe } = require('../utils/validators');
const { getLatestMapForPairs } = require('../utils/lateEventService');

const logger = pino();

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

  //validate each event safely & collect pairs
  const pairSet = new Map();
  rawEvents.forEach((ev, idx) => {
    const v = validateEventSafe(ev);
    if (!v.ok) {
      invalidRows.push({ index: idx, error: v.error, raw: ev });
    } else {
      const norm = v.normalized;
      validated.push(norm);
      const key = `${norm.worker_id || ''}|${norm.workstation_id || ''}`;
      pairSet.set(key, { worker_id: norm.worker_id, workstation_id: norm.workstation_id });
    }
  });

  const totalInvalid = invalidRows.length;
  const totalValid = validated.length;

  // observability
  try { if (Sentry && Sentry.metrics) Sentry.metrics.count('events_bulk_received', totalReceived); } catch (e) {}
  try { if (Sentry && Sentry.metrics) Sentry.metrics.count('events_bulk_invalid', totalInvalid); } catch (e) {}

  // Batch late-check ->get latest timestamps for unique pairs
  const pairs = Array.from(pairSet.values());
  let latestMap = new Map();
  try {
    latestMap = await getLatestMapForPairs(pairs);
  } catch (lateErr) {
    logger.warn({ lateErr }, 'batched late-check failed; continuing without late tagging');
    latestMap = new Map();
  }

  // mark each validated event with is_late based on latestMap
  validated.forEach(ev => {
    const key = `${ev.worker_id || ''}|${ev.workstation_id || ''}`;
    const latest = latestMap.get(key);
    ev.is_late = latest ? (new Date(ev.timestamp) < new Date(latest)) : false;
    if (ev.is_late) {
      try { if (Sentry && Sentry.metrics) Sentry.metrics.count('events_late', 1); } catch (e) {}
    }
  });

  let totalInserted = 0;
  let totalDuplicate = 0;
  const insertErrors = [];

  // helper to process a single batch of validated events (with is_late)
  async function processBatch(batch) {
    if (batch.length === 0) return { inserted: 0, duplicates: 0, insertedIds: [] };

    const values = [];
    const placeholders = batch.map((ev, idx) => {
      const base = idx * 10;
      values.push(
        ev.event_id,
        ev.timestamp,
        ev.worker_id,
        ev.workstation_id,
        ev.event_type,
        ev.confidence,
        ev.count || 0,
        ev.model_version || null,
        ev.is_late === true,
        JSON.stringify(ev)
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`;
    });

    const insertSql = `
      INSERT INTO events (event_id, timestamp, worker_id, workstation_id, event_type, confidence, count, model_version, is_late, raw_json)
      VALUES ${placeholders.join(',')}
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id, is_late
    `;

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query(insertSql, values);
      const insertedIds = res.rows.map(r => r.event_id);
      const insertedCount = insertedIds.length;

      // Insert ingestion_log for inserted ids
      if (insertedCount > 0) {
        const ilPlaceholders = insertedIds.map((_, i) => `($${i + 1})`).join(',');
        const ilSql = `INSERT INTO ingestion_log(event_id) VALUES ${ilPlaceholders} ON CONFLICT DO NOTHING`;
        await client.query(ilSql, insertedIds);
      }

      //for inserted late events, enqueue recompute_requests
      if (insertedCount > 0) {
        // Determine which inserted events were late (we rely on batch objects)
        const insertedLateEntities = new Map(); // key -> { entity_type, entity_id, window_start }
        // match insertedIds to batch elements by event_id
        const idSet = new Set(insertedIds);
        for (const ev of batch) {
          if (idSet.has(ev.event_id) && ev.is_late) {
            if (ev.worker_id) {
              const key = `worker|${ev.worker_id}|${ev.timestamp}`;
              insertedLateEntities.set(key, { entity_type: 'worker', entity_id: ev.worker_id, window_start: ev.timestamp });
            }
            if (ev.workstation_id) {
              const key = `workstation|${ev.workstation_id}|${ev.timestamp}`;
              insertedLateEntities.set(key, { entity_type: 'workstation', entity_id: ev.workstation_id, window_start: ev.timestamp });
            }
          }
        }

        const rqItems = Array.from(insertedLateEntities.values());
        if (rqItems.length > 0) {
          // batch insert recompute_requests
          const rqValues = [];
          const rqPlaceholders = rqItems.map((r, idx) => {
            const base = idx * 4;
            rqValues.push(r.entity_type, r.entity_id, r.window_start, r.window_start);
            // using same value for window_end for now,  can be expanded
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
          });
          const rqSql = `
            INSERT INTO recompute_requests (entity_type, entity_id, window_start, window_end)
            VALUES ${rqPlaceholders.join(',')}
            ON CONFLICT (entity_type, entity_id, window_start) DO NOTHING
          `;
          await client.query(rqSql, rqValues);
        }
      }

      await client.query('COMMIT');

      const duplicates = batch.length - insertedCount;
      return { inserted: insertedCount, duplicates, insertedIds };
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err }, 'Bulk insert batch failed - rolling back this batch');
      insertErrors.push({ error: err.message });
      return { inserted: 0, duplicates: 0, insertedIds: [] };
    } finally {
      client.release();
    }
  }

  // Process validated events in batches
  for (let i = 0; i < validated.length; i += batchSize) {
    const batch = validated.slice(i, i + batchSize);
    const { inserted, duplicates } = await processBatch(batch);
    totalInserted += inserted;
    totalDuplicate += duplicates;
  }

  // Sentry metrics
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