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

## Milestone: Live Map and Sources UI verified in a real browser (2026-10-08)
Reproduced with Playwright against a populated database (desktop 1600×1000 and Pixel 7), in dev and production mode:
- [x] Map without WebGL2 crashed the whole Overview / Live Map page ("This page couldn't load"). Now a static SVG map shows the same markers, with click-to-select and filters, plus an explanatory note
- [x] MapLibre worker failing to load left an empty map and no message. Now a 20 s watchdog shows the error and the fallback map
- [x] Public MapLibre worker is now kept byte-identical to the installed `maplibre-gl` (`scripts/sync-maplibre-worker.mjs` on postinstall/predev/prebuild); `.gitattributes` stops Windows line-ending conversion in `public/`
- [x] Two copies of `better-sqlite3` (unused 13.x at the top level, 12.x nested under Prisma's adapter, which the app actually loads). Now a single 12.11.1, pinned with `overrides`
- [x] Production over plain HTTP from a LAN IP or PC name: the browser dropped the `Secure` session cookie, so login looped back to the sign-in page. The cookie is now `Secure` only on HTTPS
- [x] Sources UI: a failed endpoint test or fetch showed in a green "success" box. It is now an error. Enable/Disable gives feedback, and rows without a URL explain why Test/Fetch are disabled
- [x] New Playwright tests (map engine/assets/rendering, hover/click/selection, filters/timeline, no-WebGL and worker-failure fallbacks, mobile tap; Sources UI with real password login and DB assertions; end-to-end report → ingest → review → new outbreak → location → publish → open Live Map refresh). 35 Playwright, 136 Vitest, typecheck, lint, build
- [x] Windows: in-place update procedure that keeps `dev.db` / `.env` and avoids a full reinstall (LOCAL_SETUP_WINDOWS.md §12), plus troubleshooting (§13)
- [ ] Re-test on the owner's Windows PC (real browser and GPU, real WHO/ECDC network)
- [ ] No UI to add a new source row (the 11 verified ECDC feeds must be pasted into the existing ECDC rows); decide whether to add one

## Milestone: Focus on the Irkutsk investigation (2026-10-10)
Product direction corrected: a dedicated tracker for one emerging event and its possible spread; general outbreak
news is secondary.
- [x] `TrackedEvent` model (match terms, origin region, map view, primary); migration registers the existing Irkutsk record; admin can track another outbreak later
- [x] Main dashboard `/`: status, pathogen statement (plague = bacterium, not confirmed), last verified update, wider-spread assessment, figures with explicit state + source + timestamps, last 24 hours, developments, pathogen claims / lab findings / alternative accounts kept apart, contradictions, risk, targeted intelligence; `?asOf=` history
- [x] Live Map `/map`: Irkutsk/Shelekhov first; verified locations only; roles (investigation site, suspected, confirmed, precautionary measure — never an infection); unverified listed, not drawn; unrelated outbreaks off by default; satellite, playback and no-WebGL fallback preserved
- [x] Timeline `/timeline`: occurred vs reported dates, categories, corrections in place, "what was known then"
- [x] Intelligence: investigation section (default, topic filters) vs other infectious-disease news; global overview moved to Global watch (`/global`)
- [x] Automation: relevance matcher (place + context; Cyrillic; wider-area = review only), topics, material-change flag, priority review queue, "Add to investigation timeline"; nothing published automatically
- [x] Spread requires evidence: case locations outside the origin start unverified; verification refused without evidence
- [x] Historical integrity fix: claim disputes / conflict notes no longer shown before they were known
- [x] Rospotrebnadzor source added (disabled until its feed URL is confirmed)
- [x] Tests: 159 Vitest (SQLite and PostgreSQL), 47 Playwright (desktop + mobile), typecheck, lint, build; SQLite and PostgreSQL upgrade paths rehearsed on existing data
- [ ] Confirm the Rospotrebnadzor RSS URL and enable it; consider Russian regional sources (Irkutsk Oblast health ministry)
- [ ] Analyst: re-verify seeded Irkutsk facts against primary publications

## Next
- [ ] Re-verify seeded facts against the original WHO/ECDC/Reuters pages once network access is available
- [ ] Manual article entry form in admin (articles currently arrive via ingestion or seed)
- [ ] Sub-national geocoding beyond the city gazetteer (e.g. Nominatim, as in VIGIL) with precision tracking
- [ ] Multi-user admin accounts (PostgreSQL profile done)
- [ ] Optional LLM-assisted claim extraction (left out of the MVP to avoid paid APIs; extraction is deterministic)
