
const pino = require("pino");
const logger = pino();

const db = require("../../db"); 
const { createTables } = require("../dbSetupService"); 
const { generateEvents, sizeToCount } = require("./eventGenerator");


//seed the DB with workers, stations and generated events.
 
async function seedData(options = {}) {
  const totalEvents = options.totalEvents
    ? Number(options.totalEvents)
    : sizeToCount(options.size);
  logger.info({ totalEvents }, "Starting DB seed");

  await createTables();

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      "TRUNCATE TABLE ingestion_log, events, workers, workstations RESTART IDENTITY CASCADE",
    );

    const workers = [
      ["W1", "Asha"],
      ["W2", "Ravi"],
      ["W3", "Maya"],
      ["W4", "Jon"],
      ["W5", "Priya"],
      ["W6", "Leo"],
    ];
    const stations = [
      ["S1", "Assembly"],
      ["S2", "Packaging"],
      ["S3", "Inspection"],
      ["S4", "Welding"],
      ["S5", "Painting"],
      ["S6", "Testing"],
    ];

    for (const w of workers) {
      await client.query(
        "INSERT INTO workers(worker_id, name) VALUES ($1, $2)",
        w,
      );
    }
    for (const s of stations) {
      await client.query(
        "INSERT INTO workstations(workstation_id, name) VALUES ($1, $2)",
        s,
      );
    }

    const { events } = generateEvents(totalEvents);

    const batchSize = 200;
    let inserted = 0;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      const values = [];
      const placeholders = batch.map((ev, idx) => {
        const base = idx * 9;
        values.push(
          ev.event_id,
          ev.timestamp,
          ev.worker_id,
          ev.workstation_id,
          ev.event_type,
          ev.confidence,
          ev.count || 0,
          ev.model_version || null,
          JSON.stringify(ev.raw_json || ev),
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
      });

      const sql = `INSERT INTO events(
                        event_id, timestamp, worker_id, workstation_id,
                        event_type, confidence, count, model_version, raw_json
                    )
                    VALUES ${placeholders.join(",")}
                    ON CONFLICT (event_id) DO NOTHING
                    `;

      await client.query(sql, values);
      inserted += batch.length;
    }

    await client.query("COMMIT");
    logger.info({ inserted }, "Seeding complete");
    return {
      workersInserted: workers.length,
      stationsInserted: stations.length,
      eventsInserted: inserted,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "Seeding failed");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  seedData,
};
