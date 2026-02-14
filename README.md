# Worker Productivity Dashboard

A full-stack application that ingests computer vision events from CCTV feeds, persists them to a database, computes productivity metrics, and displays them via a web dashboard.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Running Locally](#running-locally)
- [API Reference](#api-reference)
- [Metrics Computation](#metrics-computation)
- [Database Schema](#database-schema)
- [Ingestion Semantics](#ingestion-semantics)
- [Caching & Recompute](#caching--recompute)
- [Design Decisions](#design-decisions)
- [Scaling Considerations](#scaling-considerations)
- [Deployment](#deployment)
- [Project Structure](#project-structure)

## Overview

The system accepts computer vision events from CCTV feeds (worker states and product count data), persists them to PostgreSQL, computes productivity metrics for workers, workstations, and factory level, and provides a Next.js dashboard for visualization.

**Key features:**
- Idempotent event ingestion with deterministic deduplication
- Late-event detection and correction via a recompute queue
- Cached metrics for fast dashboard reads
- Support for out-of-order event processing
- Observability via logging and Sentry integration

## Architecture

```
[CCTV Event Producer] 
    ↓
[Express Backend API] ←→ [PostgreSQL Database]
    ├─ Event Ingestion
    ├─ Metrics Computation
    ├─ Recompute Worker
    └─ Observability
    ↓
[Next.js Dashboard]
```

**Core tables:**
- `workers` — worker records
- `workstations` — workstation records
- `events` — vision events (working, idle, absent, product_count)
- `ingestion_log` — audit trail
- `recompute_requests` — queue for cache corrections
- `metrics_cache` — cached metric results

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL instance (local or Supabase)
- Docker & docker-compose (optional)

## Running Locally

### 1. Configure Environment

Create `.env` in `backend/`:

```
PORT=4000
DATABASE_URL=postgres://user:pass@host:5432/dbname
SENTRY_DSN=
NODE_ENV=development
```

For production, use Supabase connection pooler URL.

### 2. Start Backend

```bash
cd backend
npm install
npm run dev
```

### 3. Initialize Database

```bash
# Create tables and schema
curl -X POST http://localhost:4000/api/setup-db

# Seed with sample data
curl -X POST "http://localhost:4000/api/seed?size=medium"
```

### 4. Start Frontend

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

## API Reference

Base URL: `http://localhost:4000/api`

### Setup & Seed

**POST /api/setup-db**
Create database tables and migrations.

```bash
curl -X POST http://localhost:4000/api/setup-db
```

**POST /api/seed**
Seed workers, workstations, and generated events.

```bash
curl -X POST "http://localhost:4000/api/seed?size=medium"
```

Options: `small`, `medium`, `heavy`, or specify `events=N`

### Ingestion

**POST /api/events**
Ingest a single event.

```bash
curl -X POST http://localhost:4000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp":"2026-01-15T10:15:00Z",
    "worker_id":"W1",
    "workstation_id":"S3",
    "event_type":"product_count",
    "confidence":0.93,
    "count": 1
  }'
```

**POST /api/events/bulk**
Ingest multiple events.

```bash
curl -X POST http://localhost:4000/api/events/bulk \
  -H "Content-Type: application/json" \
  -d '[
    {"timestamp":"2026-01-15T10:15:00Z","worker_id":"W1","workstation_id":"S3","event_type":"working","confidence":0.93},
    {"timestamp":"2026-01-15T10:18:00Z","worker_id":"W1","workstation_id":"S3","event_type":"product_count","count":2}
  ]'
```

### Metrics

**GET /api/metrics/worker/:id**
Compute metrics for a worker in a time window.

```bash
GET /api/metrics/worker/W1?start=2026-01-15T00:00:00Z&end=2026-01-15T23:59:59Z
```

**GET /api/metrics/cache/worker/:id**
Fetch or populate cached metrics.

```bash
GET /api/metrics/cache/worker/W1?start=2026-01-15T00:00:00Z&end=2026-01-15T23:59:59Z&populate=true
```

**GET /api/metrics/workstation/:id** and **GET /api/metrics/cache/workstation/:id**
Workstation-level metrics (same parameters).

**GET /api/metrics/factory** and **GET /api/metrics/cache/factory**
Factory-level aggregated metrics.

### Recompute

**POST /api/metrics/recompute**
Process pending recompute requests.

```bash
curl -X POST http://localhost:4000/api/metrics/recompute
```

### Health & Debug

**GET /api/health** — Health check

**GET /api/debug/counts** — Quick counts of entities

**GET /api/recompute/pending** — List pending recompute requests

## Metrics Computation

Metrics are computed from state-change events (working, idle, absent) and product_count events.

### Worker Level

1. Reconstruct work/idle/absent durations by iterating ordered events and calculating time differences
2. Clip intervals to the selected time window
3. Sum durations by state
4. Sum product counts in the window

**Derived metrics:**
- `utilization_percent` = (total_working_seconds / window_seconds) × 100
- `units_per_hour` = total_units / window_hours

### Workstation Level

Sum working durations of assigned workers, clipped to the window.

**Note:** When multiple workers overlap at a station, this counts their combined time (not unique time). This is documented as a design tradeoff.

### Factory Level

- Sum productive seconds across all workers
- Sum total units across all workers
- Compute workforce averages

**Window semantics:** Uses inclusive [start, end] boundaries. All computations and cache keys follow this convention consistently.

## Database Schema

### workers
- `worker_id` (text, PK)
- `name` (text)

### workstations
- `workstation_id` (text, PK)
- `name` (text)

### events
- `event_id` (text, PK, deterministic SHA256 if not provided)
- `timestamp` (ISO timestamp)
- `worker_id`, `workstation_id`
- `event_type` (working | idle | absent | product_count)
- `confidence` (float)
- `count` (int, used for product_count)
- `model_version` (text, optional)
- `is_late` (bool)
- `raw_json` (jsonb)
- `ingested_at` (timestamp)

### ingestion_log
- `event_id`, `first_seen_at` — Audit trail for deduplication

### recompute_requests
- `id` (uuid)
- `entity_type` (worker|workstation|factory)
- `entity_id`, `window_start`, `window_end`
- `status` (pending|processing|done|failed)
- `created_at`, `updated_at`

### metrics_cache
- `entity_type`, `entity_id`, `window_start`, `window_end`
- `metrics` (json), `updated_at`

## Ingestion Semantics

### Deterministic Event ID

If a client doesn't provide `event_id`, the backend computes a deterministic SHA256 hash from the event signature. This ensures retries produce the same event ID, enabling safe retries.

### Duplicate Handling

A database uniqueness constraint on `event_id` prevents duplicates. The ingestion response includes an `inserted` flag (true/false) so clients know if the event was new or already in the system.

### Late / Out-of-Order Events

On ingestion, the system checks the latest timestamp for the worker/workstation pair. If an incoming event is older, `is_late` is set to true. The event is still stored, and a recompute request is queued for the affected entity and time window. This allows:
- Accepting all events (no silent data loss)
- Maintaining audit trail
- Correcting metrics via background recompute

### Why Accept Late Events?

Preserving all events maintains data integrity and auditability. Recompute jobs update cached aggregates asynchronously, ensuring eventual correctness without blocking ingestion.

## Caching & Recompute

On-the-fly metric computation can be expensive for large event sets. Instead:

1. Metrics are cached per (entity_type, entity_id, window_start, window_end)
2. Cache-read endpoints return cached results if available
3. The `populate=true` query parameter triggers computation and caching
4. When late events are inserted, recompute requests are enqueued
5. A recompute worker (triggered via API or periodic job) processes requests and updates the cache

This design balances performance and correctness: dashboards are fast and stable, and late data is eventually corrected.


## Assumptions & Tradeoffs

- **Sample size:** The system assumes exactly 6 workers and 6 workstations, seeded via the backend for demo and testing purposes.
- **Event types:** Only the specified event types (`working`, `idle`, `absent`, `product_count`) are supported. Product count events use the `count` field for units produced.
- **Time window semantics:** All metrics are computed using inclusive `[start, end]` time windows. Intervals are clipped to window bounds.
- **Worker/workstation assignment:** Events are associated with both a worker and a workstation. Metrics are computed per entity.
- **Overlapping workers:** For workstation occupancy/utilization, if multiple workers are present at the same time, their working durations are summed (may double-count overlapping time). This is a deliberate tradeoff for query simplicity and is documented.
- **Idempotency:** Event ingestion is idempotent. If an event with the same signature is sent multiple times, it is only stored once (using a deterministic event_id hash).
- **Late/out-of-order events:** All events are accepted, even if their timestamp is earlier than the latest for a worker/workstation. Such events are marked as `is_late` and trigger a recompute for affected metrics.
- **No ML/CV model training:** The system does not train or run any ML/CV models; it only ingests structured events from an external CV system.
- **Pre-populated data:** The database is always seeded with demo data so the dashboard is meaningful on first run. Seeding and refreshing can be done via API.
- **Database:** PostgreSQL is used, but the schema is compatible with SQLite for local testing.
- **Production readiness:** The design is robust for demo and small-scale use, but scaling to 100+ cameras or multi-site would require further optimizations (see Scaling Considerations).

## Design Decisions

### 1. Intermittent Connectivity

**How handled:** Clients retry with exponential backoff. Idempotency via deterministic event IDs and database uniqueness constraints ensures safe retries. At scale, a message queue (Kafka/RabbitMQ) or edge buffering decouples producer spikes from database load.

### 2. Duplicate Events

**How handled:** Deterministic event ID + database ON CONFLICT DO NOTHING. The ingestion response indicates success (inserted=true/false), enabling clients to detect duplicates.

### 3. Out-of-Order Events

**How handled:** Events are appended regardless of timestamp order. Late events trigger recompute requests. A background worker updates cached metrics, yielding eventual consistency with fast dashboard reads.

### 4. Model Versioning & Drift Detection

**How handled:** The `model_version` is stored with every event.

- Log and track confidence distributions per version
- Compare recent vs baseline distributions (e.g., KL divergence, KS test)
- Monitor metric degradation (units/hr, utilization)
- If drift exceeds thresholds, schedule retraining (e.g., via Airflow/Dagster)
- Upon validation, deploy new version and route partial traffic for sanity checks (canary)
- Persist model metadata (commit ID, training snapshot) for reproducibility

## Scaling Considerations

### 5 Cameras (Demo)
- Single backend instance
- Local PostgreSQL
- Local recompute trigger

### 100+ Cameras
- Connection pooler (PgBouncer) and read replicas
- Message queue (Kafka/RabbitMQ) for ingestion
- Database consumers for writes
- Distributed recompute workers (SKIP LOCKED for coordination)
- Materialized views or data warehouse for analytics

### Multi-Site
- Per-site metric caches
- Separate DB schemas or tenant-aware partitioning
- Central aggregator for cross-site reporting


## Docker & Deployment

### Local Development with Docker Compose

You can run both backend and frontend locally using Docker Compose. This does NOT start a database; you must point to your Supabase/Postgres instance in your backend `.env`.

```bash
docker-compose up --build
# Backend: http://localhost:4000
# Frontend: http://localhost:3000
```

### Deploying Backend to Render

1. Push your code to GitHub.
2. In Render, create a new Web Service:
  - **Environment:** Docker
  - **Dockerfile path:** `Dockerfile.backend`
  - **Build Command:** (leave blank for Docker)
  - **Start Command:** (leave blank for Docker)
  - **Port:** 4000
  - **Environment Variables:** Set all required vars (see `.env`), especially `DATABASE_URL` (use your Supabase connection string).
3. Render will build and deploy your backend using the Dockerfile. Healthcheck is set up at `/api/health`.

### Deploying Frontend to Vercel

1. Push your code to GitHub.
2. Import your repo in Vercel.
3. Set the following environment variable in Vercel:
  - `NEXT_PUBLIC_API_BASE` = `https://<your-render-backend-url>/api`
4. Vercel will build and deploy your Next.js frontend automatically (no Dockerfile needed).

### Database: Supabase

- Create a new project in Supabase.
- Get the connection string and set it as `DATABASE_URL` in your backend environment (Render or local `.env`).
- The backend will auto-create tables and seed data on first run via `/api/setup-db` and `/api/seed`.

### Notes
- For local development, you can use Docker Compose or run each service manually.
- For production, deploy frontend to Vercel, backend to Render, and use Supabase for the database.
- The provided Dockerfiles are for local development and Render backend deployment only. Vercel does not use Dockerfiles.

## Project Structure

```
backend/
  src/
    routes/              # API endpoint handlers
    services/            # Business logic
      db/               # Database setup
      ingest/           # Event ingestion
      metrics/          # Metric computation and recompute
      seed/             # Test data generation
      utils/            # Validators and helpers
    middleware/         # Logging, error handling
    db/                # Database connection pool
    config/            # Configuration
    instrument.js      # Sentry setup
    server.js          # Express app

frontend/
  app/                 # Next.js app directory
  components/          # UI components
  hooks/              # Custom React hooks
  services/           # API clients
  types/              # TypeScript definitions

docs/
  postman_full_collection.json  # API tests

Dockerfile, docker-compose.yml  # Containerization
```
