
const crypto = require('crypto');

const ALLOWED_EVENT_TYPES = new Set(['working', 'idle', 'absent', 'product_count']);

/**
 * Validate incoming event payload throws Error with message on invalid
 * Returns normalized event object
 */
function validateAndNormalizeEvent(body) {
  if (!body || typeof body !== 'object') {
    const e = new Error('Invalid payload: expected JSON object');
    e.status = 400;
    throw e;
  }

  const { timestamp, worker_id, workstation_id, event_type, confidence, count, event_id, model_version } = body;

  if (!timestamp) {
    const e = new Error('timestamp is required');
    e.status = 400;
    throw e;
  }
  const ts = new Date(timestamp);
  if (Number.isNaN(ts.getTime())) {
    const e = new Error('timestamp must be a valid ISO8601 string');
    e.status = 400;
    throw e;
  }

  if (!event_type || typeof event_type !== 'string' || !ALLOWED_EVENT_TYPES.has(event_type)) {
    const e = new Error(`event_type is required and must be one of: ${Array.from(ALLOWED_EVENT_TYPES).join(', ')}`);
    e.status = 400;
    throw e;
  }

  if (event_type === 'product_count') {
    if (typeof count !== 'number' && typeof count !== 'string') {
      const e = new Error('product_count events require numeric count');
      e.status = 400;
      throw e;
    }
    const cnum = Number(count);
    if (!Number.isFinite(cnum) || cnum < 0) {
      const e = new Error('count must be a non-negative number');
      e.status = 400;
      throw e;
    }
  }

  if (confidence !== undefined) {
    const confNum = Number(confidence);
    if (Number.isNaN(confNum) || confNum < 0 || confNum > 1) {
      const e = new Error('confidence must be a number between 0 and 1');
      e.status = 400;
      throw e;
    }
  }

  const normalized = {
    timestamp: ts.toISOString(),
    worker_id: worker_id || null,
    workstation_id: workstation_id || null,
    event_type,
    confidence: confidence === undefined ? null : Number(confidence),
    count: event_type === 'product_count' ? Number(count) : 0,
    model_version: model_version || null,
    event_id: event_id || null
  };

  // compute deterministic event_id if not provided
  if (!normalized.event_id) {
    const base = `${normalized.timestamp}|${normalized.worker_id || ''}|${normalized.workstation_id || ''}|${normalized.event_type}|${normalized.count || 0}`;
    normalized.event_id = crypto.createHash('sha256').update(base).digest('hex');
  }

  return normalized;
}


/**
 * Non-throwing validator used for bulk ingestion
 * Returns { ok: true, normalized } or { ok: false, error: '.....' }
 */
function validateEventSafe(body) {
  try {
    const normalized = validateAndNormalizeEvent(body);
    return { ok: true, normalized };
  } catch (err) {
    return { ok: false, error: err.message || 'Invalid event' };
  }
}

module.exports = {
  validateAndNormalizeEvent,
  validateEventSafe
};
