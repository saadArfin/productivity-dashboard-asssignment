// backend/src/instrument.js

const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Capture IP, request info, etc.
  sendDefaultPii: true,

  // 🔥 Performance tracing (important)
  tracesSampleRate: 0.2,

  // 🔥 Enable Sentry Logs
  enableLogs: true,

  // 🔥 Capture console logs
  integrations: [
    Sentry.consoleLoggingIntegration({
      levels: ["log", "warn", "error"]
    })
  ]
});

module.exports = Sentry;
