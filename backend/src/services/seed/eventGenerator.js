const crypto = require('crypto');

const DEFAULT_SHIFT_DATE = '2026-01-15T09:00:00Z';
const SHIFT_HOURS = 8;

/** Deterministic event id so seeded data is reproducible */
function makeEventId(ev) {
  const base = `${ev.timestamp}|${ev.worker_id || ''}|${ev.workstation_id || ''}|${ev.event_type}|${ev.count || 0}`;
  return crypto.createHash('sha256').update(base).digest('hex');
}

function sizeToCount(size) {
  if (!size) return 300;
  const s = String(size).toLowerCase();
  if (s === 'light') return 120;
  if (s === 'medium') return 300;
  if (s === 'heavy') return 800;
  const n = Number(size);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 300;
}

function baseWorkersStations() {
  const workers = [
    { worker_id: 'W1', name: 'Asha' },
    { worker_id: 'W2', name: 'Ravi' },
    { worker_id: 'W3', name: 'Maya' },
    { worker_id: 'W4', name: 'Jon' },
    { worker_id: 'W5', name: 'Priya' },
    { worker_id: 'W6', name: 'Leo' }
  ];
  const stations = [
    { workstation_id: 'S1', name: 'Assembly' },
    { workstation_id: 'S2', name: 'Packaging' },
    { workstation_id: 'S3', name: 'Inspection' },
    { workstation_id: 'S4', name: 'Welding' },
    { workstation_id: 'S5', name: 'Painting' },
    { workstation_id: 'S6', name: 'Testing' }
  ];
  return { workers, stations };
}

/**
 * generateEvents(totalTarget = 300)
 * returns { workers, stations, events }
 *  events are time-ordered (ascending)
 *  each event has event_id, raw_json, is_late:false by default
 */
function generateEvents(totalTarget = 300) {
  const { workers, stations } = baseWorkersStations();

  const shiftStart = new Date(DEFAULT_SHIFT_DATE).getTime();
  const shiftEnd = shiftStart + SHIFT_HOURS * 60 * 60 * 1000;
  const shiftMillis = shiftEnd - shiftStart;

  const perWorkerTarget = Math.max(10, Math.floor(totalTarget / workers.length));
  const events = [];

  for (let i = 0; i < workers.length; i++) {
    const w = workers[i];
    const station = stations[i % stations.length];

    let t = shiftStart + Math.floor(Math.random() * 15 * 60 * 1000);
    let isWorking = Math.random() > 0.2;

    let producedForWorker = 0;
    while (t < shiftEnd && producedForWorker < perWorkerTarget) {
      const blockDuration = isWorking
        ? (20 + Math.floor(Math.random() * 71)) * 60 * 1000 // 20-90 min
        : (5 + Math.floor(Math.random() * 26)) * 60 * 1000; // 5-30 min

      const obsTime = new Date(Math.min(t, shiftEnd)).toISOString();

      const stateType = isWorking ? 'working' : 'idle';
      events.push({
        timestamp: obsTime,
        worker_id: w.worker_id,
        workstation_id: station.workstation_id,
        event_type: stateType,
        confidence: +(0.85 + Math.random() * 0.15).toFixed(3),
        count: 0,
        model_version: 'v1.0',
        is_late: false
      });
      producedForWorker++;

      if (isWorking) {
        const prodEvents = 1 + Math.floor(Math.random() * 4); // 1-4
        for (let p = 0; p < prodEvents && producedForWorker < perWorkerTarget; p++) {
          const offset = Math.floor(Math.random() * blockDuration);
          const productTs = new Date(Math.min(t + offset, shiftEnd)).toISOString();
          events.push({
            timestamp: productTs,
            worker_id: w.worker_id,
            workstation_id: station.workstation_id,
            event_type: 'product_count',
            confidence: +(0.85 + Math.random() * 0.15).toFixed(3),
            count: 1 + Math.floor(Math.random() * 3), // 1-3 units
            model_version: 'v1.0',
            is_late: false
          });
          producedForWorker++;
        }
      }

      t += blockDuration;
      isWorking = !isWorking;
    }
  }

  while (events.length < totalTarget) {
    const w = workers[Math.floor(Math.random() * workers.length)];
    const s = stations[Math.floor(Math.random() * stations.length)];
    const randomTs = new Date(shiftStart + Math.floor(Math.random() * shiftMillis)).toISOString();
    events.push({
      timestamp: randomTs,
      worker_id: w.worker_id,
      workstation_id: s.workstation_id,
      event_type: 'product_count',
      confidence: +(0.85 + Math.random() * 0.15).toFixed(3),
      count: 1 + Math.floor(Math.random() * 3),
      model_version: 'v1.0',
      is_late: false
    });
  }

  //sort events by timestamp(ascending)
  events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  //attach deterministic event_id and raw_json
  const withIds = events.map(e => {
    const ev = { ...e };
    ev.event_id = makeEventId(ev);
    ev.raw_json = { ...e };
    return ev;
  });

  return { workers, stations, events: withIds };
}

module.exports = {
  generateEvents,
  sizeToCount
};