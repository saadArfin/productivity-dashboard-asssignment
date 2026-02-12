
require("./instrument");

require("dotenv").config();

const express = require("express");
const Sentry = require("@sentry/node");
const pino = require("pino");

const logger = pino();
const app = express();

app.use(express.json());


// Health check

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});


// debug route to test Sentry

app.get("/debug-sentry", (req, res) => {
  throw new Error("My first Sentry error!");
});


Sentry.setupExpressErrorHandler(app);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  logger.info(`Backend running on port ${PORT}`);
});
