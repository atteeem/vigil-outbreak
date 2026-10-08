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
- [!] Live verification of WHO/ECDC/CDC endpoints — egress blocked in the build sandbox (HTTP 403). Needs a check from an unrestricted network.
- [ ] Confirm ECDC + CDC feed URLs, then enable them

## Phase D — Core
- [x] Filters (disease, country, status, last activity, text); URL-synced
- [x] Outbreak listing + detail pages
- [x] Analytics with empty states
- [x] Historical playback (Live/24H/7D/30D/90D/Custom, play/pause/step/scrub/speed), based on publication time
- [x] Admin: sources, logs, review, outbreak create/edit, reclassification, claim verification/promotion, observations, updates/corrections, merge, publish/unpublish, audit

## Phase E — Reliability
- [x] Vitest unit + DB integration (41 tests), Playwright desktop + mobile (23 tests), typecheck, lint, production build
- [x] README

## Next
- [ ] Re-verify seeded facts against the original WHO/ECDC/Reuters pages once network access is available
- [ ] Manual article entry form in admin (articles currently arrive via ingestion or seed)
- [ ] Sub-national geocoding beyond the city gazetteer (e.g. Nominatim, as in VIGIL) with precision tracking
- [ ] PostgreSQL deployment profile; multi-user admin accounts
- [ ] Optional LLM-assisted claim extraction (left out of the MVP to avoid paid APIs; extraction is deterministic)
