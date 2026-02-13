
const db = require('../db');
const pino = require('pino');
const Sentry = require('@sentry/node');
const logger = pino();

/**
 * getLatestMapForPairs(pairs)
 * pairs: array of { worker_id, workstation_id } (values can be null)
 * Returns Map keyed by `${worker_id||''}|${workstation_id||''}` => latestTimestamp (ISO string) or null
 */
async function getLatestMapForPairs(pairs = []) {
  if (!pairs || pairs.length === 0) return new Map();

  // build unique key set
  const uniq = new Map();
  for (const p of pairs) {
    const key = `${p.worker_id || ''}|${p.workstation_id || ''}`;
    uniq.set(key, p);
  }

  const keys = Array.from(uniq.values());
  if (keys.length === 0) return new Map();

  //build WHERE clause (worker_id = $1 AND workstation_id = $2) OR ...
  const whereClauses = [];
  const params = [];
  let idx = 1;
  for (const k of keys) {
    whereClauses.push(`( ($${idx}::text IS NULL AND worker_id IS NULL OR worker_id = $${idx}) AND ($${idx+1}::text IS NULL AND workstation_id IS NULL OR workstation_id = $${idx+1}) )`);
    params.push(k.worker_id, k.workstation_id);
    idx += 2;
  }

  const sql = `
    SELECT worker_id, workstation_id, MAX(timestamp) AS latest
    FROM events
    WHERE ${whereClauses.join(' OR ')}
    GROUP BY worker_id, workstation_id
  `;

  const res = await db.query(sql, params);
  const map = new Map();
  // populate map of keys
  for (const row of res.rows) {
    const key = `${row.worker_id || ''}|${row.workstation_id || ''}`;
    map.set(key, row.latest);
  }

  // For any key not present, map value will remain undefined
  return map;
}

/**
 * checkIfLateSingle(ev)
 * check latest timestamp for same worker/workstation and return { isLate, latestTimestamp }
 */
async function checkIfLateSingle(ev) {
  if (!ev) return { isLate: false, latestTimestamp: null };

  // If no identifying fields, skip check
  if (!ev.worker_id && !ev.workstation_id) return { isLate: false, latestTimestamp: null };

  const sql = `
    SELECT MAX(timestamp) AS latest
    FROM events
    WHERE ($1::text IS NULL OR worker_id = $1)
      AND ($2::text IS NULL OR workstation_id = $2)
  `;
  const res = await db.query(sql, [ev.worker_id, ev.workstation_id]);
  const latest = res.rows[0].latest;
  if (!latest) return { isLate: false, latestTimestamp: null };

  const latestTs = new Date(latest);
  const incomingTs = new Date(ev.timestamp);
  if (incomingTs < latestTs) {
    logger.warn({ event_id: ev.event_id, incoming: ev.timestamp, latest }, 'late event detected');
    try { if (Sentry && Sentry.metrics) Sentry.metrics.count('events_late', 1); } catch (e) {}
    return { isLate: true, latestTimestamp: latest };
  }
  return { isLate: false, latestTimestamp: latest };
}

module.exports = {
  getLatestMapForPairs,
  checkIfLateSingle
};