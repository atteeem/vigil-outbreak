# Deployment readiness

Nothing here has been deployed or provisioned. This document describes how the codebase is prepared for
production and what must be done when you choose to deploy. No paid services or credentials are required.

## Architecture

```
            ┌────────────── web process ──────────────┐        ┌──── ingestion process ────┐
 browser ─▶ │ Next.js (npm start)                     │        │ npm run worker            │
            │  pages, public API, /admin, /api/health │        │  (or cron: npm run ingest │
            │  INGESTION_MODE=worker → no scheduling   │        │   -- --due)               │
            └───────────────┬─────────────────────────┘        └────────────┬──────────────┘
                            │                                               │
                            └────────────── PostgreSQL (or SQLite) ─────────┘
                                   sources · articles · claims · runs · leases · heartbeat
```

- **Separation.** In production (`NODE_ENV=production`) the web process does not schedule ingestion by default
  (`INGESTION_MODE=worker`). Ingestion runs in a separate process: the long-running `npm run worker`, or a
  scheduler running `npm run ingest -- --due`. In development the default is `inline`: the scheduler runs inside
  `next dev` for convenience. `INGESTION_MODE=off` disables scheduled ingestion entirely.
- **Several workers are safe.** Each run takes a per-source **lease** in the database (`Source.leaseOwner` /
  `leaseUntil`, 10 min). A second process, a cron job overlapping a manual *Fetch Now*, or a restarted worker
  skips a source that is already being fetched. A crashed holder's lease expires, and its run is closed as
  `ABANDONED`.
- **Idempotent ingestion.** Items are keyed by canonical URL (unique) and by source + external ID (unique), with a
  title-hash check for the same story under another URL. A unique-key violation from a concurrent insert counts
  as a duplicate, not an error. Re-running a pass never creates duplicates. This is tested on SQLite and PostgreSQL.
- **Retry and backoff.**
  - *Within a run:* timeouts, connection errors, 5xx and 429 are retried 2× with exponential backoff (1 s, 4 s,
    ±20% jitter), honouring `Retry-After` up to 60 s.
  - *Never retried:* network-policy blocks, 401/403, 404 and schema mismatches.
  - *Across runs:* `Source.nextAttemptAt` is persisted. After a success it is set to one polling interval (±10%
    jitter). After failures it backs off ×2 per consecutive failure, up to ×16 and capped at 6 h.
- **Freshness and failure tracking.** Every run records status, HTTP code, pages, counts, item errors and a
  classified `failureKind`. Each source keeps its last success, last attempt, last error and class, consecutive
  failures and endpoint status (`WORKING` / `FAILING` / `BLOCKED` / `UNTESTED`).
- **Live indicator = operational health.** "Live" requires both of these:
  1. a real (non-localhost) source succeeded within 2 polling intervals, and
  2. an ingestion process heartbeat (`WorkerHeartbeat`) within max(5 min, 2 intervals).

  If the worker stops, the indicator drops to *Not live* even if the last success was recent. Logic:
  `lib/domain/live-status.ts`.

## Database

| | Local development | Production |
|---|---|---|
| Engine | SQLite (`file:./prisma/dev.db`) | PostgreSQL 14+ (tested on 16) |
| Schema | `prisma/schema.prisma` (canonical) | `prisma/postgres/schema.prisma` (generated, do not edit) |
| Migrations | `prisma/migrations` | `prisma/postgres/migrations` |
| Driver | better-sqlite3 adapter | node-postgres adapter (`DATABASE_POOL_MAX`, default 10) |

`DATABASE_URL` decides everything. `prisma.config.ts` picks the schema and migrations, and `lib/db.ts` picks the
adapter. The Prisma client must be generated for the active engine:

```bash
npm run db:generate      # after changing DATABASE_URL between file: and postgresql:
npm run db:deploy        # apply migrations (idempotent; safe on every deploy)
npm run db:seed          # reference data + sourced records (re-runnable; never overwrites source URLs/enabled flags)
npm run db:check         # migrations reproduce the schema; deployed DB has no drift
```

**Changing the schema:**
1. Edit `prisma/schema.prisma`.
2. Create the SQLite migration with `npx prisma migrate dev --name x`, or non-interactively with
   `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/migrations/<ts>_x/migration.sql`.
3. Run `npm run db:pg:sync -- x` to regenerate the PostgreSQL schema and write the matching PostgreSQL migration.
   This is an offline schema-to-schema diff; no database is needed.
4. Run `npm run db:check`.

`npm run test:pg` runs the whole Vitest suite against a disposable PostgreSQL database. Pass `TEST_DATABASE_URL`;
the database name must contain "test".

## Running ingestion in production

Pick one:

**A. Long-running worker** (recommended; heartbeat every pass):

```bash
npm run worker                     # WORKER_TICK_SECONDS=60; Ctrl+C / SIGTERM stops gracefully
```

systemd unit (Linux):

```ini
[Unit]
Description=VIGIL OUTBREAK ingestion worker
After=network-online.target postgresql.service

[Service]
WorkingDirectory=/opt/vigil-outbreak
EnvironmentFile=/opt/vigil-outbreak/.env
ExecStart=/usr/bin/npm run worker
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

**B. Cron / Task Scheduler** (one pass per invocation; heartbeat mode `cli`):

```cron
*/5 * * * * cd /opt/vigil-outbreak && npm run ingest -- --due >> logs/ingest.log 2>&1
```

Windows Task Scheduler: see `docs/LOCAL_SETUP_WINDOWS.md` §9.

Each pass fetches only sources that are due (`nextAttemptAt`), so running cron more often than the polling
interval is harmless.

## Web process

```bash
npm run build && npm start          # NODE_ENV=production → INGESTION_MODE defaults to "worker"
```

Required environment: `DATABASE_URL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` (long random values). Never set
`ADMIN_TEST_BYPASS_SECRET` or `TEST_FIXTURES` in production; both are ignored when `NODE_ENV=production` anyway.

**Health checks:**
- `GET /api/health` returns 200 while the web app and database work. It also reports ingestion state, worker
  heartbeat and failing sources.
- `GET /api/health?strict=1` returns 503 unless ingestion is genuinely live.

## Production checklist (when you decide to deploy)

- [ ] PostgreSQL database and a dedicated user; `DATABASE_URL` set; `npm run db:generate && npm run db:deploy && npm run db:seed`
- [ ] `npm run verify:sources` passes from the production network for every source you enable (see `LIVE_SOURCE_VERIFICATION.md`)
- [ ] Web: `npm run build && npm start` behind HTTPS (reverse proxy); `ADMIN_*` secrets set
- [ ] Ingestion: worker service or cron installed; `/api/health` shows `worker.healthy: true`
- [ ] `INGESTION_CONTACT` set (identifies your deployment to publishers)
- [ ] Backups of the database
- [ ] Monitor `/api/health?strict=1` and alert on 503
