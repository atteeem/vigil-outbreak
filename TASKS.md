# VIGIL OUTBREAK — Tasks

Legend: [x] done · [~] partial · [ ] open · [!] blocked

## Phase A — Inspect & bootstrap
- [x] Inspect VIGIL (Next 16 App Router, Prisma 7 + better-sqlite3 adapter, MapLibre with bundled world-atlas basemap, HMAC admin session + edge gate, scheduler via instrumentation.ts, timeline presets)
- [x] Independent repo + Next/TS/Tailwind/Prisma/Vitest/Playwright setup

## Phase B — Visual application
- [ ] App shell, nav, KPI strip
- [ ] MapLibre world map (bundled borders, city labels, clustering, satellite mode)
- [ ] Event list, detail panel
- [ ] /outbreaks/russia-irkutsk-2026

## Phase C — Ingestion
- [ ] WHO DON OData adapter, RSS adapter (ECDC, CDC), normalization, extraction, dedupe
- [ ] Scheduler (configurable interval, default 15 min) + manual Fetch Now
- [ ] Intelligence feed

## Phase D — Core
- [ ] Filters (disease, geography, date, status)
- [ ] Outbreak listing + detail pages
- [ ] Analytics with empty states
- [ ] Historical playback (as-of publication time)
- [ ] Admin: sources, logs, review, outbreak edit, classification, claim verification, merge, publish, audit

## Phase E — Reliability
- [ ] Unit + API tests (Vitest), Playwright E2E, build, docs
