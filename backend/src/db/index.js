
const { Pool } = require("pg");
const pino = require("pino");

const logger = pino();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  logger.error("DATABASE_URL is not set. Please set it in your .env (use Supabase pooler connection string).");
}

const pool = new Pool({
  connectionString,
  ssl: connectionString ? { rejectUnauthorized: false } : false, 
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

(async () => {
  try {
    const client = await pool.connect();
    logger.info("Connected to PostgreSQL (pool connected)");
    client.release();
  } catch (err) {
    logger.error({ err, connectionString: !!connectionString }, "PostgreSQL connection error");
    
  }
})();

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
