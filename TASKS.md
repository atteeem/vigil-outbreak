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
- [x] Vitest unit + DB integration (66 tests), Playwright desktop + mobile (25 tests), typecheck, lint, production build
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

## Next
- [ ] Re-verify seeded facts against the original WHO/ECDC/Reuters pages once network access is available
- [ ] Manual article entry form in admin (articles currently arrive via ingestion or seed)
- [ ] Sub-national geocoding beyond the city gazetteer (e.g. Nominatim, as in VIGIL) with precision tracking
- [ ] PostgreSQL deployment profile; multi-user admin accounts
- [ ] Optional LLM-assisted claim extraction (left out of the MVP to avoid paid APIs; extraction is deterministic)
