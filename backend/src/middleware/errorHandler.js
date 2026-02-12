const pino = require('pino');
const logger = pino();
const Sentry = require('@sentry/node');

module.exports = function errorHandler(err, req, res, next) {
  logger.error({ err }, 'Unhandled error');
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  res.status(500).json({ ok: false, error: 'Internal Server Error' });
};