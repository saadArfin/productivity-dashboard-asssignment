const pino = require('pino');
const logger = pino();

module.exports = function requestLogger(req, res, next) {
  logger.info({ method: req.method, url: req.url }, 'incoming request');
  next();
};