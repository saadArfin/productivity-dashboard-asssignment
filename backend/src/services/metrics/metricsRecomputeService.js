
const db = require('../../db');
const pino = require('pino');
const Sentry = require('@sentry/node');
const metricsSvc = require('./metricsService');

const logger = pino();

/**
 * Process pending recompute_requests
 *  limit: number of requests to process in this run
 *  returns summary { processed: N, done: M, failed: K }
 */
async function processPendingRecomputes(limit = 50) {
  const client = await db.pool.connect();
  const summary = { fetched: 0, processed: 0, done: 0, failed: 0 };
  try {
    // fetch pending requests with row-level lock to avoid races
    // wwe select ids first to minimize lock duration, then process one-by-one
    await client.query('BEGIN');

    // select pending requests for update skip locked
    const selSql = `
      SELECT id, entity_type, entity_id, window_start, window_end
      FROM recompute_requests
      WHERE status = 'pending'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $1
    `;
    const res = await client.query(selSql, [limit]);
    const rows = res.rows;
    summary.fetched = rows.length;

    // mark each selected as processing (so other workers know)
    const ids = rows.map(r => r.id);
    if (ids.length) {
      const updSql = `
        UPDATE recompute_requests
        SET status = 'processing', updated_at = NOW()
        WHERE id = ANY($1::uuid[])
      `;
      await client.query(updSql, [ids]);
    }

    await client.query('COMMIT');

    // process each request individually (outside big tx) to avoid long locks
    for (const reqRow of rows) {
      summary.processed++;
      try {
        await processSingleRequest(reqRow);
        summary.done++;
      } catch (err) {
        summary.failed++;
        logger.error({ err, reqRow }, 'Failed to process recompute request');
        try {
          // mark failed with error message
          await db.query(
            `UPDATE recompute_requests SET status = 'failed', updated_at = NOW() WHERE id = $1`,
            [reqRow.id]
          );
        } catch (e2) {
          logger.error({ e2 }, 'Failed to mark recompute_request as failed');
        }
        Sentry.captureException(err);
      }
    }

    return summary;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error({ err }, 'processPendingRecomputes failed');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Process a single recompute request object { id, entity_type, entity_id, window_start, window_end }
 *  Computes metrics for the requested window/entity using metricsService
 *  Upserts into metrics_cache
 *  Marks recompute_requests.status = 'done'
 */
async function processSingleRequest(reqRow) {
  const { id, entity_type, entity_id, window_start, window_end } = reqRow;

  // determine window: if null, use defaults from metricsService (it handles normalization)
  const start = window_start ? window_start.toISOString ? window_start.toISOString() : window_start : null;
  const end = window_end ? window_end.toISOString ? window_end.toISOString() : window_end : null;

  //compute metrics depending on entity_type
  let metrics;
  if (entity_type === 'worker') {
    metrics = await metricsSvc.computeWorkerMetrics(entity_id, start, end);
  } else if (entity_type === 'workstation') {
    metrics = await metricsSvc.computeWorkstationMetrics(entity_id, start, end);
  } else if (entity_type === 'factory') {
    metrics = await metricsSvc.computeFactoryMetrics(start, end);
  } else {
    throw new Error(`Unsupported entity_type: ${entity_type}`);
  }

  // Upsert into metrics_cache
  const cacheEntityId = entity_type === 'factory' ? 'FACTORY' : entity_id || '';
  const upsertSql = `
    INSERT INTO metrics_cache (entity_type, entity_id, window_start, window_end, metrics, updated_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
    ON CONFLICT (entity_type, entity_id, window_start, window_end)
    DO UPDATE SET metrics = $5::jsonb, updated_at = NOW()
  `;
  await db.query(upsertSql, [entity_type, cacheEntityId, start, end, JSON.stringify(metrics)]);

  // Mark recompute_requests as done
  await db.query(
    `UPDATE recompute_requests SET status = 'done', updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

module.exports = {
  processPendingRecomputes,
  processSingleRequest
};