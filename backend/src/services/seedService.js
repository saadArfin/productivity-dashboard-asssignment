
const db = require("../db");
const { v4: uuidv4 } = require("uuid");

async function seedData() {
  // Clear existing data
  await db.query("DELETE FROM events");
  await db.query("DELETE FROM workers");
  await db.query("DELETE FROM workstations");

  // Workers
  const workers = [
    ["W1", "Asha"],
    ["W2", "Ravi"],
    ["W3", "Maya"],
    ["W4", "Jon"],
    ["W5", "Priya"],
    ["W6", "Leo"]
  ];

  for (const w of workers) {
    await db.query(
      "INSERT INTO workers (worker_id, name) VALUES ($1, $2)",
      w
    );
  }

  // Workstations
  const stations = [
    ["S1", "Assembly"],
    ["S2", "Packaging"],
    ["S3", "Inspection"],
    ["S4", "Welding"],
    ["S5", "Painting"],
    ["S6", "Testing"]
  ];

  for (const s of stations) {
    await db.query(
      "INSERT INTO workstations (workstation_id, name) VALUES ($1, $2)",
      s
    );
  }

  console.log("Seeded workers & stations");

  // seed a few example events
  const exampleEvent = {
    event_id: uuidv4(),
    timestamp: new Date().toISOString(),
    worker_id: "W1",
    workstation_id: "S1",
    event_type: "working",
    confidence: 0.95,
    count: 0,
    model_version: "v1.0"
  };

  await db.query(
    `INSERT INTO events
     (event_id, timestamp, worker_id, workstation_id, event_type, confidence, count, model_version, raw_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      exampleEvent.event_id,
      exampleEvent.timestamp,
      exampleEvent.worker_id,
      exampleEvent.workstation_id,
      exampleEvent.event_type,
      exampleEvent.confidence,
      exampleEvent.count,
      exampleEvent.model_version,
      exampleEvent
    ]
  );

  console.log("Seeded example event");
}

module.exports = { seedData };
