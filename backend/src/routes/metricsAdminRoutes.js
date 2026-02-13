const express = require('express');
const router = express.Router();
const metricsRecompute = require('../services/metrics/metricsRecomputeService');
const db = require('../db');
const pino = require('pino');
const logger = pino();

const ENTITY_FACTORY = 'FACTORY';

/**
 * POST /api/metrics/recompute
 * Body: { limit?: number }
 */
router.post('/metrics/recompute', async (req, res) => {
  const limit = req.body && Number.isFinite(Number(req.body.limit)) ? Number(req.body.limit) : 50;
  try {
    const summary = await metricsRecompute.processPendingRecomputes(limit);
    res.json({ ok: true, summary });
  } catch (err) {
    logger.error({ err }, 'POST /api/metrics/recompute failed');
    res.status(500).json({ ok: false, error: 'Failed to process recompute requests' });
  }
});

/**
 * GET /api/metrics/cache/worker/:id?start=&end=&populate=1
 */
router.get('/metrics/cache/worker/:id', async (req, res) => {
  const { id } = req.params;
  const { start, end, populate } = req.query;

  try {
    const q = `
      SELECT metrics, updated_at
      FROM metrics_cache
      WHERE entity_type = 'worker'
        AND entity_id = $1
        AND window_start = $2
        AND window_end = $3
      LIMIT 1
    `;

    const r = await db.query(q, [id, start || null, end || null]);

    if (r.rows.length) {
      return res.json({
        ok: true,
        cached: true,
        metrics: r.rows[0].metrics,
        updated_at: r.rows[0].updated_at
      });
    }

    const metricsSvc = require('../services/metrics/metricsService');
    const m = await metricsSvc.computeWorkerMetrics(id, start, end);

    if (populate === '1' || populate === 'true') {
      await db.query(`
        INSERT INTO metrics_cache (entity_type, entity_id, window_start, window_end, metrics, updated_at)
        VALUES ('worker', $1, $2, $3, $4::jsonb, NOW())
        ON CONFLICT (entity_type, entity_id, window_start, window_end)
        DO UPDATE SET metrics = $4::jsonb, updated_at = NOW()
      `, [id, start || null, end || null, JSON.stringify(m)]);
    }

    res.json({ ok: true, cached: false, metrics: m });
  } catch (err) {
    logger.error({ err }, 'GET /metrics/cache/worker/:id failed');
    res.status(500).json({ ok: false, error: 'Failed to fetch cached worker metrics' });
  }
});

/**
 * GET /api/metrics/cache/workstation/:id?start=&end=&populate=1
 */
router.get('/metrics/cache/workstation/:id', async (req, res) => {
  const { id } = req.params;
  const { start, end, populate } = req.query;

  try {
    const q = `
      SELECT metrics, updated_at
      FROM metrics_cache
      WHERE entity_type = 'workstation'
        AND entity_id = $1
        AND window_start = $2
        AND window_end = $3
      LIMIT 1
    `;

    const r = await db.query(q, [id, start || null, end || null]);

    if (r.rows.length) {
      return res.json({
        ok: true,
        cached: true,
        metrics: r.rows[0].metrics,
        updated_at: r.rows[0].updated_at
      });
    }

    const metricsSvc = require('../services/metrics/metricsService');
    const m = await metricsSvc.computeWorkstationMetrics(id, start, end);

    if (populate === '1' || populate === 'true') {
      await db.query(`
        INSERT INTO metrics_cache (entity_type, entity_id, window_start, window_end, metrics, updated_at)
        VALUES ('workstation', $1, $2, $3, $4::jsonb, NOW())
        ON CONFLICT (entity_type, entity_id, window_start, window_end)
        DO UPDATE SET metrics = $4::jsonb, updated_at = NOW()
      `, [id, start || null, end || null, JSON.stringify(m)]);
    }

    res.json({ ok: true, cached: false, metrics: m });
  } catch (err) {
    logger.error({ err }, 'GET /metrics/cache/workstation/:id failed');
    res.status(500).json({ ok: false, error: 'Failed to fetch cached workstation metrics' });
  }
});

/**
 * GET /api/metrics/cache/factory?start=&end=&populate=1
 */
router.get('/metrics/cache/factory', async (req, res) => {
  const { start, end, populate } = req.query;

  try {
    const q = `
      SELECT metrics, updated_at
      FROM metrics_cache
      WHERE entity_type = 'factory'
        AND entity_id = $1
        AND window_start = $2
        AND window_end = $3
      LIMIT 1
    `;

    const r = await db.query(q, [ENTITY_FACTORY, start || null, end || null]);

    if (r.rows.length) {
      return res.json({
        ok: true,
        cached: true,
        metrics: r.rows[0].metrics,
        updated_at: r.rows[0].updated_at
      });
    }

    const metricsSvc = require('../services/metrics/metricsService');
    const m = await metricsSvc.computeFactoryMetrics(start, end);

    if (populate === '1' || populate === 'true') {
      await db.query(`
        INSERT INTO metrics_cache (entity_type, entity_id, window_start, window_end, metrics, updated_at)
        VALUES ('factory', $1, $2, $3, $4::jsonb, NOW())
        ON CONFLICT (entity_type, entity_id, window_start, window_end)
        DO UPDATE SET metrics = $4::jsonb, updated_at = NOW()
      `, [ENTITY_FACTORY, start || null, end || null, JSON.stringify(m)]);
    }

    res.json({ ok: true, cached: false, metrics: m });
  } catch (err) {
    logger.error({ err }, 'GET /metrics/cache/factory failed');
    res.status(500).json({ ok: false, error: 'Failed to fetch cached factory metrics' });
  }
});

module.exports = router;