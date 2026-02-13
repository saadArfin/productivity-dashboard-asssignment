
const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/recompute/pending', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, entity_type, entity_id, window_start, window_end, status, created_at
      FROM recompute_requests
      ORDER BY created_at DESC
      LIMIT 50
    `);
    res.json({ ok: true, pending: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to fetch recompute queue' });
  }
});

module.exports = router;