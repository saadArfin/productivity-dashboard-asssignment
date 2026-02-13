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

module.exports = router;