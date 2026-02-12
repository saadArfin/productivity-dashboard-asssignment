
require('dotenv').config();
module.exports = {
  port: process.env.PORT || 4000,
  databaseUrl: process.env.DATABASE_URL,
  sentryDsn: process.env.SENTRY_DSN,
  nodeEnv: process.env.NODE_ENV || 'development'
};
