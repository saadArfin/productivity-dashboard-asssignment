
require("dotenv").config();
require("./instrument");

const express = require("express");
const Sentry = require("@sentry/node");
const pino = require("pino");

const requestLogger = require("./middleware/requestLogger");
const errorHandler = require("./middleware/errorHandler");
const setupRoutes = require("./routes/setupRoutes");
const eventsRoutes = require('./routes/eventsRoutes');

const logger = pino();
const app = express();

app.use(express.json());
app.use(requestLogger);

// Routes
app.use("/api", setupRoutes);
app.use('/api', eventsRoutes);

// Health
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Debug route for Sentry
app.get("/debug-sentry", () => {
  throw new Error("My first Sentry error!");
});


// register error handler
Sentry.setupExpressErrorHandler(app);

// Custom error handler
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  logger.info(`Backend running on port ${PORT}`);
});
