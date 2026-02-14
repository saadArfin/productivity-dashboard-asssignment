const express = require('express');
const router = express.Router();
const metrics = require('../services/metrics/metricsService');
const pino = require('pino');
const logger = pino();

// GET /api/metrics/worker/:id?start=&end=
router.get('/metrics/worker/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { start, end } = req.query;
    const result = await metrics.computeWorkerMetrics(id, start, end);
    res.json({ ok: true, metrics: result });
  } catch (err) {
    logger.error({ err }, 'GET /metrics/worker/:id failed');
    res.status(500).json({ ok: false, error: 'Failed to compute worker metrics' });
  }
});

// GET /api/metrics/workstation/:id?start=&end=
router.get('/metrics/workstation/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { start, end } = req.query;
    const result = await metrics.computeWorkstationMetrics(id, start, end);
    res.json({ ok: true, metrics: result });
  } catch (err) {
    logger.error({ err }, 'GET /metrics/workstation/:id failed');
    res.status(500).json({ ok: false, error: 'Failed to compute workstation metrics' });
  }
});

// GET /api/metrics/factory?start=&end=
router.get('/metrics/factory', async (req, res) => {
  try {
    const { start, end } = req.query;
    const result = await metrics.computeFactoryMetrics(start, end);
    res.json({ ok: true, metrics: result });
  } catch (err) {
    logger.error({ err }, 'GET /metrics/factory failed');
    res.status(500).json({ ok: false, error: 'Failed to compute factory metrics' });
  }
});

// GET /api/metrics/worker/:id/series?start=&end=
router.get('/metrics/worker/:id/series', async (req, res) => {
  const { id } = req.params;
  const { start, end } = req.query;
  try {
    const series = await metrics.getWorkerHourlySeries(id, start, end);
    return res.json({ ok: true, series });
  } catch (err) {
    console.error('worker series failed', err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch worker series' });
  }
});

module.exports = router;