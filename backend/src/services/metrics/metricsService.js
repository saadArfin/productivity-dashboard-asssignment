const db = require('../../db');
const pino = require('pino');
const logger = pino();

const DEFAULT_WINDOW = {
  start: '2026-01-15T09:00:00Z',
  end: '2026-01-15T17:00:00Z'
};

/**
 * normalize start/end (use defaults if not provided)
 */
function normalizeWindow(start, end) {
  const s = start ? new Date(start).toISOString() : DEFAULT_WINDOW.start;
  const e = end ? new Date(end).toISOString() : DEFAULT_WINDOW.end;
  return { start: s, end: e };
}

/**
 * Worker-level metrics
 * Returns-->
 * {
 *   worker_id,
 *   window_start, window_end,
 *   total_window_seconds,
 *   total_active_seconds,   // working
 *   total_idle_seconds,     // idle
 *   total_absent_seconds,   // absent
 *   utilization_percent,    // working / window * 100
 *   total_units,            // sum of product_count.count
 *   units_per_hour
 * }
 */
async function computeWorkerMetrics(worker_id, start, end) {
  const { start: wstart, end: wend } = normalizeWindow(start, end);

  // 1) compute durations of state observations using LAG/LEAD
  // 2) clamp durations to window
  // 3) aggregate by event_type
  const stateDurSql = `
    WITH ordered AS (
      SELECT
        worker_id,
        event_type,
        timestamp AT TIME ZONE 'UTC' AS ts,
        LEAD(timestamp) OVER (PARTITION BY worker_id ORDER BY timestamp) AT TIME ZONE 'UTC' AS next_ts
      FROM events
      WHERE worker_id = $1
        AND event_type IN ('working','idle','absent')
    ),
    clipped AS (
      SELECT
        worker_id,
        event_type,
        GREATEST(ts, $2::timestamptz) AS start_ts,
        LEAST(COALESCE(next_ts, $3::timestamptz), $3::timestamptz) AS end_ts
      FROM ordered
      WHERE COALESCE(next_ts, $3::timestamptz) > $2::timestamptz
        AND ts < $3::timestamptz
    ),
    durations AS (
      SELECT
        worker_id,
        event_type,
        EXTRACT(EPOCH FROM (end_ts - start_ts)) AS seconds
      FROM clipped
      WHERE end_ts > start_ts
    )
    SELECT
      $1 AS worker_id,
      $2::timestamptz AS window_start,
      $3::timestamptz AS window_end,
      EXTRACT(EPOCH FROM ($3::timestamptz - $2::timestamptz)) AS total_window_seconds,
      COALESCE(SUM(CASE WHEN event_type = 'working' THEN seconds END), 0) AS total_active_seconds,
      COALESCE(SUM(CASE WHEN event_type = 'idle' THEN seconds END), 0) AS total_idle_seconds,
      COALESCE(SUM(CASE WHEN event_type = 'absent' THEN seconds END), 0) AS total_absent_seconds
    FROM durations;
  `;

  // 2) units produced in window
  const productSql = `
    SELECT COALESCE(SUM(count),0) AS total_units
    FROM events
    WHERE worker_id = $1
      AND event_type = 'product_count'
      AND timestamp >= $2::timestamptz
      AND timestamp < $3::timestamptz;
  `;

  const stateRes = await db.query(stateDurSql, [worker_id, wstart, wend]);
  const productRes = await db.query(productSql, [worker_id, wstart, wend]);

  const stateRow = stateRes.rows[0] || {
    total_window_seconds: (new Date(wend) - new Date(wstart)) / 1000,
    total_active_seconds: 0,
    total_idle_seconds: 0,
    total_absent_seconds: 0
  };

  const total_units = Number(productRes.rows[0].total_units || 0);

  const windowHours = Number(stateRow.total_window_seconds || ((new Date(wend) - new Date(wstart)) / 1000)) / 3600;
  const unitsPerHour = windowHours > 0 ? total_units / windowHours : 0;
  const utilizationPercent = stateRow.total_window_seconds > 0
    ? (stateRow.total_active_seconds / stateRow.total_window_seconds) * 100
    : 0;

  return {
    worker_id,
    window_start: wstart,
    window_end: wend,
    total_window_seconds: Number(stateRow.total_window_seconds),
    total_active_seconds: Number(stateRow.total_active_seconds),
    total_idle_seconds: Number(stateRow.total_idle_seconds),
    total_absent_seconds: Number(stateRow.total_absent_seconds),
    utilization_percent: Number(utilizationPercent.toFixed(2)),
    total_units,
    units_per_hour: Number(unitsPerHour.toFixed(3))
  };
}

/**
 * Workstation-level metrics
 * For occupancy we sum working durations of workers at that station (note-> may double-count if multiple workers overlap)
 * Throughput rate = total_units / window_hours
 */
async function computeWorkstationMetrics(workstation_id, start, end) {
  const { start: wstart, end: wend } = normalizeWindow(start, end);

  // durations of working events for workers at this workstation
  const wsDurationSql = `
    WITH ordered AS (
      SELECT
        workstation_id,
        worker_id,
        event_type,
        timestamp AT TIME ZONE 'UTC' AS ts,
        LEAD(timestamp) OVER (PARTITION BY worker_id ORDER BY timestamp) AT TIME ZONE 'UTC' AS next_ts
      FROM events
      WHERE workstation_id = $1
        AND event_type IN ('working','idle','absent')
    ),
    clipped AS (
      SELECT
        workstation_id,
        worker_id,
        event_type,
        GREATEST(ts, $2::timestamptz) AS start_ts,
        LEAST(COALESCE(next_ts, $3::timestamptz), $3::timestamptz) AS end_ts
      FROM ordered
      WHERE COALESCE(next_ts, $3::timestamptz) > $2::timestamptz
        AND ts < $3::timestamptz
    ),
    durations AS (
      SELECT
        workstation_id,
        worker_id,
        event_type,
        EXTRACT(EPOCH FROM (end_ts - start_ts)) AS seconds
      FROM clipped
      WHERE end_ts > start_ts
    )
    SELECT
      $1::text AS workstation_id,
      $2::timestamptz AS window_start,
      $3::timestamptz AS window_end,
      EXTRACT(EPOCH FROM ($3::timestamptz - $2::timestamptz)) AS total_window_seconds,
      COALESCE(SUM(CASE WHEN event_type = 'working' THEN seconds END), 0) AS total_working_seconds,
      COALESCE(SUM(CASE WHEN event_type = 'idle' THEN seconds END), 0) AS total_idle_seconds
    FROM durations;
  `;

  const productSql = `
    SELECT COALESCE(SUM(count),0) AS total_units
    FROM events
    WHERE workstation_id = $1
      AND event_type = 'product_count'
      AND timestamp >= $2::timestamptz
      AND timestamp < $3::timestamptz;
  `;

  const durRes = await db.query(wsDurationSql, [workstation_id, wstart, wend]);
  const prodRes = await db.query(productSql, [workstation_id, wstart, wend]);

  const durRow = durRes.rows[0] || {
    total_window_seconds: (new Date(wend) - new Date(wstart)) / 1000,
    total_working_seconds: 0,
    total_idle_seconds: 0
  };

  const total_units = Number(prodRes.rows[0].total_units || 0);
  const windowHours = Number(durRow.total_window_seconds) / 3600;
  const throughput = windowHours > 0 ? total_units / windowHours : 0;
  const utilizationPercent = durRow.total_window_seconds > 0
    ? (durRow.total_working_seconds / durRow.total_window_seconds) * 100
    : 0;

  return {
    workstation_id,
    window_start: wstart,
    window_end: wend,
    total_window_seconds: Number(durRow.total_window_seconds),
    occupancy_seconds: Number(durRow.total_working_seconds), // note: may double-count if multiple workers overlap
    utilization_percent: Number(utilizationPercent.toFixed(2)),
    total_units,
    throughput_per_hour: Number(throughput.toFixed(3))
  };
}

/**
 * Factory-level metrics: aggregated across workers / workstations
 *  total productive time = sum of worker working times
 *  total production count = sum of product_count events (across factory)
 *  average production rate across workers = (total_units / window_hours) / num_workers
 *  average utilization across workers = avg(worker utilization)
 */
// computeFactoryMetrics
async function computeFactoryMetrics(start, end) {
  const { start: wstart, end: wend } = normalizeWindow(start, end);

  // 1) compute total working seconds per worker clamped to window
  const totalWorkingSql = `
    WITH ordered AS (
      SELECT
        worker_id,
        event_type,
        timestamp AT TIME ZONE 'UTC' AS ts,
        LEAD(timestamp) OVER (PARTITION BY worker_id ORDER BY timestamp) AT TIME ZONE 'UTC' AS next_ts
      FROM events
      WHERE event_type IN ('working','idle','absent')
    ),
    clipped AS (
      SELECT
        worker_id,
        event_type,
        GREATEST(ts, $1::timestamptz) AS start_ts,
        LEAST(COALESCE(next_ts, $2::timestamptz), $2::timestamptz) AS end_ts
      FROM ordered
      WHERE COALESCE(next_ts, $2::timestamptz) > $1::timestamptz
        AND ts < $2::timestamptz
    ),
    durations AS (
      SELECT
        worker_id,
        event_type,
        EXTRACT(EPOCH FROM (end_ts - start_ts)) AS seconds
      FROM clipped
      WHERE end_ts > start_ts
    ),
    per_worker AS (
      SELECT
        worker_id,
        COALESCE(SUM(CASE WHEN event_type = 'working' THEN seconds END),0) AS working_seconds
      FROM durations
      GROUP BY worker_id
    )
    SELECT
      COALESCE(SUM(working_seconds),0) AS total_working_seconds,
      COUNT(*) AS workers_with_activity
    FROM per_worker;
  `;

  // 2) total units in window
  const totalUnitsSql = `
    SELECT COALESCE(SUM(count),0) AS total_units
    FROM events
    WHERE event_type = 'product_count'
      AND timestamp >= $1::timestamptz
      AND timestamp < $2::timestamptz;
  `;

  // 3) number of workers (real)
  const workersCountSql = `SELECT COUNT(*)::int AS cnt FROM workers;`;

  // run queries 
  const totRes = await db.query(totalWorkingSql, [wstart, wend]);
  const unitsRes = await db.query(totalUnitsSql, [wstart, wend]);
  const workersCountRes = await db.query(workersCountSql);

  const total_working_seconds = Number(totRes.rows[0].total_working_seconds || 0);
  // workers_with_activity isn't total workforce — use full workers count for averages:
  const workers_count = Number(workersCountRes.rows[0].cnt || 0) || 6; // fallback to 6 just in case
  const total_units = Number(unitsRes.rows[0].total_units || 0);

  const windowHours = (new Date(wend) - new Date(wstart)) / (1000 * 3600);
  const average_production_rate_per_worker = windowHours > 0 && workers_count > 0
    ? (total_units / windowHours) / workers_count
    : 0;

  const avg_utilization_percent = windowHours > 0 && workers_count > 0
    ? ((total_working_seconds / (windowHours * 3600)) / workers_count) * 100
    : 0;

  return {
    window_start: wstart,
    window_end: wend,
    total_window_seconds: (new Date(wend) - new Date(wstart)) / 1000,
    total_productive_seconds: total_working_seconds,
    total_units,
    average_production_rate_per_worker_per_hour: Number(average_production_rate_per_worker.toFixed(3)),
    average_utilization_percent: Number(avg_utilization_percent.toFixed(2)),
    workers_count
  };
}

async function getWorkerHourlySeries(workerId, startIso, endIso) {
  const start = startIso || '2026-01-15T09:00:00Z';
  const end = endIso || '2026-01-15T17:00:00Z';

  const sql = `
    SELECT
      gs AS hour,
      COALESCE(t.units, 0) AS units
    FROM generate_series(
      date_trunc('hour', $2::timestamptz),
      date_trunc('hour', $3::timestamptz),
      '1 hour'
    ) AS gs
    LEFT JOIN (
      SELECT date_trunc('hour', timestamp) AS hour, SUM(count) AS units
      FROM events
      WHERE worker_id = $1
        AND timestamp >= $2::timestamptz
        AND timestamp <= $3::timestamptz
        AND event_type = 'product_count'
      GROUP BY hour
    ) t ON t.hour = gs
    ORDER BY gs;
  `;

  const res = await db.query(sql, [workerId, start, end]);
  // return array of { hour: ISO, units: number }
  return res.rows.map(r => ({ hour: r.hour.toISOString?.() ?? r.hour, units: Number(r.units) }));
}

module.exports = {
  computeWorkerMetrics,
  computeWorkstationMetrics,
  computeFactoryMetrics,
  getWorkerHourlySeries
};