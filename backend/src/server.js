
require("dotenv").config();
require("./instrument"); 

const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cors = require("cors");
const Sentry = require("@sentry/node");
const pino = require("pino");

const requestLogger = require("./middleware/requestLogger");
const errorHandler = require("./middleware/errorHandler");
const setupRoutes = require("./routes/setupRoutes");
const eventsRoutes = require("./routes/eventsRoutes");
const recomputeRoutes = require("./routes/recomputeRoutes"); 
const db = require("./db");

const logger = pino();
const app = express();


app.use(helmet());
app.use(cors());


app.use(express.json({ limit: "1mb" }));


app.use(requestLogger);

// rate limiting for ingestion endpoints 
const ingestLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, 
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/events", ingestLimiter);

// Routes 
app.use("/api", setupRoutes);
app.use("/api", eventsRoutes);
app.use("/api", recomputeRoutes);

// health / readiness probe 
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({
      status: "ok",
      db: "connected",
      time: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Health check - DB not reachable");
    res.status(500).json({
      status: "error",
      db: "disconnected",
      time: new Date().toISOString(),
    });
  }
});


app.get("/debug-sentry", () => {
  throw new Error("My first Sentry error!");
});


Sentry.setupExpressErrorHandler(app);

// custom error handler
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  logger.info(`Backend running on port ${PORT}`);
});

// shutdown
async function shutdown() {
  logger.info("Shutdown initiated");
  try {
    
    server.close(() => {
      logger.info("HTTP server closed");
    });

    if (db && db.pool) {
      await db.pool.end();
      logger.info("DB pool closed");
    }

    
    setTimeout(() => {
      logger.info("Exiting process");
      process.exit(0);
    }, 500);
  } catch (err) {
    logger.error({ err }, "Error during shutdown");
    process.exit(1);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

module.exports = app;