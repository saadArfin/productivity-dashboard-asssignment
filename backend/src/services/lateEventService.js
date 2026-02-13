const db = require('../db');
const pino = require('pino');
const Sentry = require('@sentry/node');

const logger = pino();

/**
 * checks whether an event is late compared to latest known event
 * for the same worker/workstation
 * returns ->> { isLate: boolean, latestTimestamp: string|null }
 */
async function checkIfLateEvent(ev) {
  
  if (!ev.worker_id && !ev.workstation_id) {
    return { isLate: false, latestTimestamp: null };
  }

  const sql = `
    SELECT MAX(timestamp) AS latest
    FROM events
    WHERE ($1::text IS NULL OR worker_id = $1)
      AND ($2::text IS NULL OR workstation_id = $2)
  `;

  const params = [ev.worker_id, ev.workstation_id];

  const res = await db.query(sql, params);
  const latest = res.rows[0].latest;

  if (!latest) {
    return { isLate: false, latestTimestamp: null };
  }

  const latestTs = new Date(latest);
  const incomingTs = new Date(ev.timestamp);

  if (incomingTs < latestTs) {
    
    logger.warn(
      { event_id: ev.event_id, incoming: ev.timestamp, latest: latest },
      'late event detected'
    );

    try {
      if (Sentry && Sentry.metrics) Sentry.metrics.count('events_late', 1);
    } catch (e) {}

    return { isLate: true, latestTimestamp: latest };
  }

  return { isLate: false, latestTimestamp: latest };
}

module.exports = {
  checkIfLateEvent
};