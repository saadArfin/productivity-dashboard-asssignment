
const express = require("express");
const router = express.Router();
const db = require("../db"); 
const { createTables } = require("../services/dbSetupService");
const { seedData } = require("../services/seed/seedService");

// initialize DB schema
router.post("/setup-db", async (req, res) => {
  try {
    await createTables();
    res.json({ message: "Database setup complete" });
  } catch (err) {
    console.error("setup-db error:", err);
    res.status(500).json({ error: "DB setup failed", details: err.message });
  }
});

// seed dummy data
router.post("/seed", async (req, res) => {
  try {
    // Accept either ?events=300 or ?size=heavy
    const totalEvents = req.query.events ? Number(req.query.events) : undefined;
    const size = req.query.size;
    const result = await seedData({ totalEvents, size });
    res.json({ message: "Database seeded", details: result });
  } catch (err) {
    console.error("seed error:", err);
    res.status(500).json({ error: "Seeding failed", details: err.message });
  }
});

// debug counts of records in each table
router.get("/debug/counts", async (req, res) => {
  try {
    const workers = await db.query("SELECT COUNT(*) FROM workers");
    const stations = await db.query("SELECT COUNT(*) FROM workstations");
    const events = await db.query("SELECT COUNT(*) FROM events");

    res.json({
      workers: Number(workers.rows[0].count),
      workstations: Number(stations.rows[0].count),
      events: Number(events.rows[0].count)
    });
  } catch (err) {
    console.error("debug/counts error:", err);
    res.status(500).json({ error: "Failed to fetch counts", details: err.message });
  }
});

module.exports = router;
