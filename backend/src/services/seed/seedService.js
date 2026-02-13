const pino = require('pino');
const logger = pino();

const db = require('../../db'); 
const { createTables } = require('../dbSetupService'); 
const { generateEvents, sizeToCount } = require('./eventGenerator');

/**
 * Seed the DB with workers, stations and generated events
 * options: { totalEvents: number } OR { size: 'light'|'medium'|'heavy' }
 *
 * - truncates recompute_requests as well
 * - inserts events including is_late column (default false for seeded data)
 * - uses RETURNING to get actual inserted rows
 * - writes ingestion_log entries for inserted events
 */
async function seedData(options = {}) {
  const totalEvents = options.totalEvents ? Number(options.totalEvents) : sizeToCount(options.size);
  logger.info({ totalEvents }, 'Starting DB seed');

  // ensure schema exists 
  await createTables();

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // truncate all relevant tables for a clean demo state
    await client.query('TRUNCATE TABLE recompute_requests, ingestion_log, events, workers, workstations RESTART IDENTITY CASCADE');

    //insert workers & workstations
    const workers = [
      ['W1', 'Asha'],
      ['W2', 'Ravi'],
      ['W3', 'Maya'],
      ['W4', 'Jon'],
      ['W5', 'Priya'],
      ['W6', 'Leo']
    ];
    const stations = [
      ['S1', 'Assembly'],
      ['S2', 'Packaging'],
      ['S3', 'Inspection'],
      ['S4', 'Welding'],
      ['S5', 'Painting'],
      ['S6', 'Testing']
    ];

    for (const w of workers) {
      await client.query('INSERT INTO workers(worker_id, name) VALUES ($1, $2)', w);
    }
    for (const s of stations) {
      await client.query('INSERT INTO workstations(workstation_id, name) VALUES ($1, $2)', s);
    }

    // Generate events 
    const { events } = generateEvents(totalEvents);

    // Batch insert events 
    const batchSize = 200;
    let inserted = 0;

    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      const values = [];
      const placeholders = batch.map((ev, idx) => {
        const base = idx * 10;
        values.push(
          ev.event_id,
          ev.timestamp,
          ev.worker_id,
          ev.workstation_id,
          ev.event_type,
          ev.confidence,
          ev.count || 0,
          ev.model_version || null,
          ev.is_late === true, // explicit false for seeded data
          JSON.stringify(ev.raw_json || ev)
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`;
      });

      const sql = `
        INSERT INTO events (
          event_id, timestamp, worker_id, workstation_id,
          event_type, confidence, count, model_version, is_late, raw_json
        )
        VALUES ${placeholders.join(',')}
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      `;

      const res = await client.query(sql, values);
      const insertedIds = res.rows.map(r => r.event_id);
      const insertedCount = res.rowCount || 0;

      // If some were inserted, record them in ingestion_log
      if (insertedCount > 0) {
        const ilPlaceholders = insertedIds.map((_, idx) => `($${idx + 1})`).join(',');
        const ilSql = `INSERT INTO ingestion_log(event_id) VALUES ${ilPlaceholders} ON CONFLICT DO NOTHING`;
        await client.query(ilSql, insertedIds);
      }

      inserted += insertedCount;
    }

    await client.query('COMMIT');

    logger.info({ inserted }, 'Seeding complete');
    return {
      workersInserted: workers.length,
      stationsInserted: stations.length,
      eventsInserted: inserted
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Seeding failed');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  seedData
};