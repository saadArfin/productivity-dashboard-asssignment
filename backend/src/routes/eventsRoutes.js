
const express = require('express');
const router = express.Router();
const { validateAndNormalizeEvent } = require('../services/validators');
const { insertSingleEvent } = require('../services/ingestService');
const { insertBulkEvents } = require('../services/ingestBulkService');
const pino = require('pino');
const Sentry = require('@sentry/node');
const logger = pino();

/**
 * POST /api/events
 * Single event ingestion
 */
router.post('/events', async (req, res) => {
  try {
    const normalized = validateAndNormalizeEvent(req.body);

    const result = await insertSingleEvent(normalized);

    if (!result.inserted) {
      
      try { if (Sentry && Sentry.metrics) Sentry.metrics.count('events_duplicate', 1); } catch (e) {}
      logger.info({ event_id: result.event_id }, 'duplicate event received');
      return res.status(200).json({ ok: true, inserted: false, event_id: result.event_id });
    }

    logger.info({ event_id: result.event_id }, 'event ingested');
    return res.status(201).json({ ok: true, inserted: true, event_id: result.event_id });

  } catch (err) {
    
    logger.error({ err }, 'POST /api/events failed');
    if (err.status && err.status === 400) {
      try { if (Sentry && Sentry.metrics) Sentry.metrics.count('events_bad_request', 1); } catch (e) {}
      return res.status(400).json({ ok: false, error: err.message });
    }

    Sentry.captureException(err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

/**
 * POST /api/events/bulk
 * Bulk ingestion endpoint (partial success mode)
 */
router.post('/events/bulk', async (req, res) => {
  try {
    const rawEvents = req.body.events || req.body; 
    const result = await insertBulkEvents(rawEvents, { batchSize: 200 });

    const resp = {
      ok: true,
      totalReceived: result.totalReceived,
      totalValid: result.totalValid,
      totalInvalid: result.totalInvalid,
      totalInserted: result.totalInserted,
      totalDuplicates: result.totalDuplicates,
      invalidRows: result.invalidRows,
      insertErrors: result.insertErrors
    };

    return res.status(200).json(resp);
  } catch (err) {
    logger.error({ err }, 'POST /api/events/bulk failed');
    Sentry.captureException(err);
    if (err.status && err.status === 400) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});

module.exports = router;
