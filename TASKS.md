# VIGIL OUTBREAK — Tasks

Legend: [x] done · [~] partial · [ ] open · [!] blocked

## Phase A — Inspect & bootstrap
- [x] Inspect VIGIL (Next 16 App Router, Prisma 7 + better-sqlite3 adapter, MapLibre with bundled world-atlas basemap, HMAC admin session + edge gate, scheduler via instrumentation.ts, timeline presets, Playwright test-DB pattern)
- [x] Independent repo; Next/TS/Tailwind 4/Prisma 7/Vitest/Playwright; .env.example; migrations; seed

## Phase B — Visual application
- [x] App shell, nav (Overview/Live Map/Outbreaks/Intelligence/Analytics + Live/Search/Notifications/Settings), KPI strip
- [x] MapLibre map: bundled borders + city labels, clustering, classification markers, hover/click, satellite mode
- [x] Event list, verified developments, selected-event panel
- [x] /outbreaks/russia-irkutsk-2026 with chronology, facts, unverified reports, contradictions, statements, measures, observations, risk, sources

## Phase C — Ingestion
- [x] WHO DON OData adapter, RSS/Atom adapter, normalization, extraction, association suggestions, 3-layer dedupe, conflict flags
- [x] Scheduler (60 s tick, per-source interval default 15 min, backoff) + Fetch Now (per source / all) + CLI
- [x] Intelligence feed
- [!] Live verification of WHO/ECDC/CDC endpoints — egress blocked in the build sandbox. Needs a check from an unrestricted network (`npm run verify:sources`).
- [ ] Confirm ECDC + CDC feed URLs, then enable them

## Phase D — Core
- [x] Filters (disease, country, status, last activity, text); URL-synced
- [x] Outbreak listing + detail pages
- [x] Analytics with empty states
- [x] Historical playback (Live/24H/7D/30D/90D/Custom, play/pause/step/scrub/speed), based on publication time
- [x] Admin: sources, logs, review, outbreak create/edit, reclassification, claim verification/promotion, observations, updates/corrections, merge, publish/unpublish, audit

## Phase E — Reliability
- [x] Vitest unit + DB integration (88 tests; also on PostgreSQL), Playwright desktop + mobile (25 tests), typecheck, lint, production build
- [x] README

## Milestone: Live data reliability (2026-10-08)
- [x] Repository and bundle integrity: `git fsck`, `git bundle verify`, test clone matches the working tree
- [x] Root cause of WHO "HTTP 403": the sandbox egress proxy refuses CONNECT (`x-deny-reason: host_not_allowed`); WHO never sees the request. Not a malformed request, wrong endpoint or authentication problem.
- [x] Failure classification (NETWORK_POLICY_BLOCKED, DNS, TIMEOUT, TLS, HTTP_AUTH, HTTP_NOT_FOUND, SCHEMA_MISMATCH, …) on runs and sources; BLOCKED vs FAILING endpoint status
- [x] WHO adapter: OData paging (`$skip` / `@odata.nextLink`), loop guard, schema-change detection; documented fields re-checked against WHO help pages
- [x] New `CDC_CONTENT_API` adapter (schema from CDC's published OpenAPI); ECDC Drupal RSS handling; fixtures + integration tests for each
- [x] `npm run verify:sources` (reachability, schema, freshness, ordering, pagination; JSON report; `--update-db`) + `docs/LIVE_SOURCE_VERIFICATION.md`
- [x] Gate: sources are created disabled and can only be enabled after a passing endpoint test
- [x] Trust: origin (SEED / INGESTED / MANUAL) on every article; "Last successful live ingestion" counts real sources only; "Not live" banner/indicator naming the failure; admin health panel + failure-class column
- [x] Irkutsk: added WHO 6 Oct statement (no plague recorded; awaiting confirmation) and Rospotrebnadzor contact testing; validation section + `docs/IRKUTSK_VALIDATION.md`; still unconfirmed
- [ ] Run `npm run verify:sources` from an unrestricted network; enable what passes
- [ ] Validate the 15 Irkutsk checklist items against primary publications

## Milestone: Real-network validation prep + production readiness (2026-10-08)
- [x] Bundle verified to contain 61946e6 before work began
- [x] `verify:sources` is now a full-pipeline check (endpoint → ingest → persistence → dates → geography/disease → dedupe) in a throwaway DB; only PIPELINE_VERIFIED counts; ECDC feeds discovered from ECDC's official RSS page; Windows-safe (no shell/sandbox dependencies)
- [x] PostgreSQL support: generated schema + baseline migration (`prisma/postgres/`), adapter chosen from DATABASE_URL, case-insensitive search; 88/88 Vitest + app/worker smoke on PostgreSQL 16
- [x] Reproducible migrations: `db:check` (no drift), `db:pg:sync` (offline schema-to-schema diffs)
- [x] Ingestion separated from the web process: INGESTION_MODE (inline/worker/off), `npm run worker`, cron via `ingest -- --due`
- [x] Idempotency: unique (sourceId, externalId) + canonicalUrl; concurrent unique violations count as duplicates
- [x] Cross-process per-source leases; abandoned runs closed; persisted `nextAttemptAt` backoff with jitter
- [x] In-run retries for transient failures (timeouts, connection, 5xx, 429 + Retry-After); never for policy/auth/404/schema
- [x] Worker heartbeat; Live indicator requires recent real success AND recent heartbeat; `/api/health` (+ `?strict=1`)
- [x] docs/LOCAL_SETUP_WINDOWS.md, docs/DEPLOYMENT.md, updated LIVE_SOURCE_VERIFICATION.md
- [!] Real-source runs (WHO, CDC, ECDC) — must be executed outside the sandbox (`npm run verify:sources` on your computer)

## Milestone: Data quality after the first real-network run (2026-10-09)
Real run on the owner's Windows PC: WHO DON + 11 ECDC feeds PIPELINE_VERIFIED; CDC Content Services SCHEMA_MISMATCH.
- [x] ECDC discovery: skip links / in-page anchors / the index page itself are no longer "feeds" (`/en/rss-feeds` matched the old loose `/rss` pattern)
- [~] CDC SCHEMA_MISMATCH: adapter now accepts XML→`format=json` retry, JSONP/BOM, PascalCase, bare arrays, `/Date()/`/US/zone-less dates, relative URLs, non-"Published" statuses; every mismatch records the ACTUAL response shape (`responseSample` in the report). Root cause still unconfirmed — needs the shape from the next real run
- [x] Disease recognition: West Nile (+ 29 more diseases), hyphen/apostrophe-insensitive matching, title-first diseases, generic-influenza suppression
- [x] Event location vs mentioned countries (`mentionedCountryCodes`), multi-country detection, city-implies-country, alias double-count fix, non-country phrases
- [x] Content classification (`contentType`, `outbreakRelevant`); non-relevant items never matched/claimed/counted; feed "All publication types" toggle; admin relevance override
- [x] Ingestion creates feed entries only — no outbreaks/observations/classification changes (tested)
- [x] Non-destructive upgrades: `db:reference`, `reprocess` (dry run / --apply), seed keeps existing seeded outbreaks
- [x] Regression fixtures + 48 new tests (136 Vitest on SQLite and PostgreSQL; 25 Playwright); typecheck, lint, build
- [ ] Re-run `npm run verify:sources` and send the CDC `responseSample` if it still fails

## Next
- [ ] Re-verify seeded facts against the original WHO/ECDC/Reuters pages once network access is available
- [ ] Manual article entry form in admin (articles currently arrive via ingestion or seed)
- [ ] Sub-national geocoding beyond the city gazetteer (e.g. Nominatim, as in VIGIL) with precision tracking
- [ ] Multi-user admin accounts (PostgreSQL profile done)
- [ ] Optional LLM-assisted claim extraction (left out of the MVP to avoid paid APIs; extraction is deterministic)
