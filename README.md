# VIGIL OUTBREAK — Irkutsk investigation tracker

A dedicated intelligence dashboard for **one emerging public-health event and any subsequent spread**: the
October 2026 investigation into the death of a laboratory worker from the Irkutsk Anti-Plague Research Institute
(`/outbreaks/russia-irkutsk-2026`). Think of an early tracker for the first Wuhan cases rather than a general
infectious-disease news site. Unrelated outbreaks and news are kept in secondary sections (**Global watch**,
**Intelligence → Other news**).

**Scientific status as recorded:** the death from pneumonia of unknown origin is documented. **No pathogen has
been laboratory-confirmed.** Plague (*Yersinia pestis* — a bacterium, not a virus) is under consideration only.
The record is an **unconfirmed investigation**; the death is not a confirmed plague death.

Architecture follows [VIGIL](https://github.com/atteeem/vigil) (Next.js App Router, Prisma 7 driver adapters,
MapLibre, HMAC admin gate), as an independent codebase with no dependency on it. SQLite for local development,
PostgreSQL for production; ingestion runs inline in development and in a worker or cron job in production. The
tracked subject is data (`TrackedEvent`), so another specific emerging outbreak can be tracked later from the admin.

**Windows:** step-by-step PowerShell instructions are in [`docs/LOCAL_SETUP_WINDOWS.md`](docs/LOCAL_SETUP_WINDOWS.md).
**Deployment readiness:** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). **Live-source checks:**
[`docs/LIVE_SOURCE_VERIFICATION.md`](docs/LIVE_SOURCE_VERIFICATION.md).

## Quick start

```bash
cp .env.example .env              # set ADMIN_PASSWORD and ADMIN_SESSION_SECRET
npm install                       # runs prisma generate
npx prisma migrate deploy         # creates prisma/dev.db
npm run db:seed                   # diseases, sources, sourced records, tracked investigation
npm run dev                       # http://localhost:3000  (admin: /admin)
```

Production: `npm run build && npm start` plus `npm run worker` (or cron `npm run ingest -- --due`). Requires Node 22
or later.

| Command | Purpose |
| --- | --- |
| `npm run ingest` / `npm run ingest -- --due` | One-shot ingestion of all enabled sources, or only those due (cron-friendly; exit code 2 if a source failed) |
| `npm run ingest:backfill` | Same, following up to 4 upstream pages per source |
| `npm run verify:sources` | **Full-pipeline** check of WHO, CDC Content Services and ECDC's officially listed feeds. A source counts as verified only if real records are retrieved, parsed, stored, have dates/geography/disease extracted and deduplicate on a second run. Uses a throwaway DB. Exit 0 = all verified, 2 = blocked by network. See `docs/LIVE_SOURCE_VERIFICATION.md` |
| `npm run db:reference` | Non-destructive refresh: disease reference list, plus the tracked-event setup (Irkutsk investigation as primary subject, its precautionary location, the Rospotrebnadzor source, tracked-article tags, dates of seeded verdicts). Never deletes or overwrites analyst data |
| `npm run reprocess` / `-- --apply` | Re-derive event location, mentioned countries, diseases and content type for ingested articles with the current rules (dry run by default; never deletes; never changes review/verification/analyst links/claims) |
| `npm run worker` | Standalone ingestion worker (production): polls due sources, writes a heartbeat, stops gracefully |
| `npm run db:deploy` / `npm run db:check` | Apply migrations / verify migrations reproduce the schema and the DB has no drift |
| `npm run db:pg:sync -- <name>` | After editing `prisma/schema.prisma`: regenerate the PostgreSQL schema and its migration (offline) |
| `npm run test:pg` | The Vitest suite against PostgreSQL (`TEST_DATABASE_URL`, DB name must contain "test") |
| `npm test` | Vitest: 136 unit + DB-backed integration tests (adapters through the real pipeline, verifier, retries, leases, concurrency) on a throwaway `prisma/vitest.db` |
| `npm run test:e2e` | Playwright, desktop and Pixel 7. Builds its own `prisma/test.db` and serves fixtures, so no external network is needed |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |

If you use a different Chromium, set `PLAYWRIGHT_CHROMIUM_PATH`. Otherwise run `npx playwright install chromium`.

**PostgreSQL:** set `DATABASE_URL=postgresql://…`, then `npm run db:generate && npm run db:deploy && npm run db:seed`.
`prisma.config.ts` and `lib/db.ts` pick the PostgreSQL schema, migrations (`prisma/postgres/`) and driver from the
URL. The PostgreSQL schema is generated from the canonical SQLite schema (`npm run db:pg:sync`). All 88 Vitest
tests and an app/worker smoke test were run on PostgreSQL 16 in the build environment. Details:
`docs/DEPLOYMENT.md`.

## Pages

- **Investigation `/`** (main dashboard): the tracked investigation at a glance.
  - Status, pathogen status, a plain pathogen statement, the last verified update, and the time the current status
    took effect.
  - **Wider spread**: whether verified case locations exist outside Irkutsk Oblast.
  - Key figures: laboratory-confirmed cases, suspected cases, deaths (with whether the cause is
    laboratory-confirmed), contacts under observation, hospitalised, and contacts tested negative. Each figure has a
    state (*verified official*, *unverified report*, *disputed* or *unknown*), a source link and timestamps.
  - What changed in the last 24 hours, and the major developments.
  - A focused map, and targeted intelligence (the possible pathogen, laboratory results, contacts, transmission and
    spread first).
  - Three separate panels: claims about the pathogen, laboratory findings, and alternative or unverified accounts.
  - Contradictions and risk assessments.
  - `?asOf=` shows what was known at a past time.
- **Live Map `/map`**: starts on Irkutsk / Shelekhov.
  - Only analyst-verified locations are drawn, each symbolised by its role: investigation site, suspected case,
    laboratory-confirmed case, or precautionary measure. A precautionary measure (quarantine or observation) is
    never shown as an infection.
  - Unverified locations are listed beside the map but not drawn.
  - The view widens to the world when verified case locations exist elsewhere.
  - Unrelated outbreaks are off by default and shown faded on request.
  - Normal and satellite modes, playback, and the no-WebGL fallback all still work.
- **Timeline `/timeline`**: the chronology from the first reports.
  - Covers deaths, symptoms, testing, quarantines, official statements, corrections, new evidence and status
    changes.
  - Every entry shows when it **occurred** and when it was **reported**.
  - Entries can be filtered by category.
  - "What was known then" opens the state of knowledge right after any entry.
- **Intelligence `/intelligence`**: three sections.
  - The investigation (default): reports identified as being about it, with topic filters.
  - **Other infectious disease news**: everything else.
  - **Everything**.
- **Global watch `/global`, `/global/map`, `/outbreaks`** (secondary): all published outbreak records worldwide,
  with the KPI strip, filters and playback. **`/outbreaks/[slug]`** is the full sourced record.
- **Analytics `/analytics`**, **Settings `/settings`**: unchanged.
- **Admin `/admin`** (password):
  - Sources, logs and audit.
  - A review queue that lists possible material changes about the investigation first. From it an analyst can
    accept, link, reject, verify, promote a claim, or **Add to investigation timeline**.
  - The outbreak editor: locations with role, verification and evidence; timeline category; tracked-event
    settings (match terms, origin region, map view, primary).

## The tracked investigation (how automation is bounded)

- **Identifying relevant reports** (`lib/tracked/relevance.ts`):
  - **DIRECT**: an article names the event's places (Irkutsk, Shelekhov, the anti-plague institute, including in
    Cyrillic) **and** event-specific context (plague, pneumonia, contacts, Rospotrebnadzor, …).
  - A place name alone, such as Irkutsk weather, is not enough, and neither is plague elsewhere.
  - Wider-area terms, such as "Siberia" + plague, only make an article **POSSIBLE**. Those go to review and never
    appear on the dashboard.
- **Material changes**: direct reports about the pathogen, laboratory results, transmission, spread, deaths, cases
  or corrections are flagged and queued first for analyst review. **Nothing is published automatically.**
  Ingestion never creates timeline entries, figures, locations or status changes. An analyst adds an entry to the
  timeline from the review queue, and it stays unverified unless they verify it.
- **Spread needs evidence**: countries merely mentioned are never mapped. A report located in another country is
  flagged *Spread — needs evidence*. A case location outside the origin starts **unverified**: it is listed but not
  mapped or counted. The server refuses to verify it without evidence (a source article or an evidence note).
- **No derived statistics**: no transmission rates, fatality ratios or projections are calculated.
- **History**: playback hides publications, figures, locations and verdicts (including disputes and conflict notes)
  that were not yet known at the selected time.

## Data integrity rules (enforced in `lib/domain/stats.ts`, tested)

1. **Headline counts come from one observation, never a sum.** The figure shown is the latest cumulative,
   **official and verified** observation. Figures from overlapping sources or reporting periods are never added
   together.
2. **Media and unverified figures are never promoted.** They appear separately under "Reported, not verified".
   A media observation stays `MEDIA` even after it is verified, so it can never become a confirmed headline.
3. **Metrics do not cross.** People under observation, people in hospital and negative tests are not infections.
   Plain "N cases" with no qualifier is kept as an unclassified claim.
4. **Unknown means null, not zero.** Missing values display as "Not reported".
5. **Two clocks.** `reportedAt`/`publishedAt` records when information became public, and drives playback.
   `asOfDate`/`occurredAt`/`eventDate` records when the thing happened. A historical view hides rows published
   after the selected time, and any verification verdict or reclassification reached after it. Narrative
   summaries are replaced with the latest update that was public at that time.
6. **History is append-only.** Observations are dated rows and reclassifications append to
   `InvestigationStatusHistory`. A resolved or ruled-out investigation stays public with its record intact.
   A merged duplicate is kept with a pointer to the surviving record.
7. **The map draws no infection zones.** Investigations are rings and confirmed outbreaks are discs. Marker size
   comes only from official confirmed counts. Country-level locations get a halo. Russia is not shaded.

## Ingestion

The flow is fetch, normalize, extract, associate, dedupe, store, then flag conflicts (`lib/ingestion/`).

- **Adapters.**
  - `WHO_DON_API`: WHO Disease Outbreak News, a Sitefinity OData endpoint documented at
    `who.int/api/news/diseaseoutbreaknews/sfhelp`. It pages with `$top`/`$skip` or `@odata.nextLink`.
  - `CDC_CONTENT_API`: CDC Content Services v2 (`tools.cdc.gov/api/v2/resources/media`). Its schema comes from
    CDC's API docs and published OpenAPI definition (`results[]`, `meta.pagination.nextUrl`).
  - `RSS`: RSS 2.0, Atom and RDF, including ECDC's Drupal feeds. Relative links and non-permalink GUIDs are handled.
  - All adapters fail loudly on a format change (`SCHEMA_MISMATCH`) instead of storing nothing quietly.
- **Extraction** is deterministic and conservative. It picks out countries, cities, diseases, explicit dates and
  qualified counts. Everything extracted is stored as an **UNVERIFIED claim**. Only an analyst can promote a
  claim to an observation.
- **Association** only *suggests* an outbreak (`suggestedOutbreakId`). The link is made when an analyst accepts it.
- **Dedupe** works in three layers: canonical URL (a unique key), source plus external ID, and a title hash within
  ±3 days. Title-hash duplicates are kept as `DUPLICATE` for provenance and hidden from the feed.
- **Persisted per item:** original URL, source organisation, publication time, event date, fetch (retrieval)
  time, **origin** (`INGESTED` / `SEED` / `MANUAL`), extracted claims, verification and review status, geographic
  precision and raw payload. Per run: HTTP status, pages fetched, counts, errors and the **failure class**.
- **Failures** are classified (`lib/ingestion/errors.ts`). A sandbox or firewall refusal (`NETWORK_POLICY_BLOCKED`,
  source marked `BLOCKED`) is never confused with the publisher rejecting us (`HTTP_AUTH`), a moved endpoint
  (`HTTP_NOT_FOUND`) or a format change (`SCHEMA_MISMATCH`). Failing sources back off exponentially. Nothing is
  ever substituted for missing data.
- **Enabling.** New sources are created disabled. An automatic source can be enabled only after **Test endpoint**
  has observed a valid response.
- **Scheduling.** `INGESTION_MODE` decides where it runs: `inline` (development default; in-process scheduler
  started by `instrumentation.ts`), `worker` (production default; `npm run worker` or cron) or `off`. Each pass
  polls sources whose persisted `nextAttemptAt` is due. Per-source database leases prevent concurrent fetches
  across processes, transient errors are retried with backoff, and every pass writes a heartbeat.
- **Intervals.** Each source has its own polling interval (default `INGESTION_INTERVAL_MINUTES=15`); after failures
  it backs off ×2 per consecutive failure (max ×16, capped at 6 h). `npm run ingest:backfill` reads 4 pages per
  source.
- **Public visibility.** Official publications appear in the feed straight away, labelled "awaiting review".
  Media items appear only after an analyst accepts them.

### Data quality rules (classifier version 1)

- **Event location ≠ countries mentioned.** `countryCodes` holds where the reported event is: the text after the last
  " – " in the title (WHO's "<Disease> – <Country>" convention), else countries in the title, else the lead
  sentence; a known city named there also locates the event. Countries found only elsewhere (history, comparisons,
  neighbours, travel) go to `mentionedCountryCodes` and are never used for the map, filters or outbreak matching.
  More than 3 candidate countries, or "Multi-country" in the title, gives `MULTI_COUNTRY` with no single location.
  "Congo basin", "Guinea worm", "Niger Delta" and "Lake Chad" are not countries.
- **Diseases** come from the title first; body text is used only when the title names none (max 2). Matching
  ignores case, hyphens and typographic apostrophes ("West-Nile", "Legionnaires’"). 50 diseases with keywords are
  in `prisma/reference/diseases.ts` (incl. West Nile, Usutu, TBE, Legionnaires', STEC, hepatitis A, …); a specific
  influenza (avian/zoonotic) suppresses generic "influenza".
- **Content type.** Every ingested item is classified (`lib/ingestion/classify.ts`): outbreak report, situation
  update, risk assessment, surveillance report, guidance, podcast/media, general publication, corporate. Guidance,
  podcasts/media, corporate, general publications and routine annual surveillance reports are
  `outbreakRelevant = false`. They are stored and visible on `/intelligence` under "All publication types", but they
  are never suggested for an outbreak, never produce case-count claims and never count in outbreak KPIs. Analysts
  can override relevance in `/admin/review`.
- **Ingestion never creates outbreaks or case figures.** New publications become feed entries (official ones
  marked "awaiting review") with UNVERIFIED claims. Outbreaks, observations and classifications change only through
  analyst actions (tested).

### Freshness and trust

- **The UI never claims to be live without evidence.** The nav indicator, the overview banner and the KPI
  **Last successful live ingestion** are computed in `lib/domain/live-status.ts` from successes of real sources
  only; localhost and fixture sources never count. "Live" requires a success within two polling intervals **and** a
  recent ingestion-process heartbeat, so a stopped worker cannot keep the indicator green. `/api/health` exposes
  the same state for monitoring (`?strict=1` returns 503 unless live). If
  every enabled source is failing, the UI says **Not live**, names the failure class, and states that the data
  shown is seeded or previously retrieved.
- **Every article is labelled Seeded or Auto-ingested** (feed, outbreak sources, admin review), and auto-ingested
  items show when they were retrieved.
- **Primary-source validation.** Facts that rest on hand-compiled (seed or manual) articles are listed on each
  outbreak page under *Primary-source validation* until an analyst opens the original and clicks **Mark checked vs
  primary** (`/admin/review?status=ACCEPTED`). The Irkutsk checklist is in
  [`docs/IRKUTSK_VALIDATION.md`](docs/IRKUTSK_VALIDATION.md).
- **Admin** (`/admin`) shows a live-ingestion health panel, per-source failure class with a remediation hint, the
  last endpoint check, and a failure-class column in `/admin/logs`.

### Source status (2026-10-08)

| Source | Adapter | State | Live check |
| --- | --- | --- | --- |
| WHO Disease Outbreak News | `WHO_DON_API` | **Enabled** (endpoint documented by WHO) | **Blocked**: the build sandbox's egress proxy refused www.who.int (`x-deny-reason: host_not_allowed`). Not a WHO error. |
| CDC Content Services (q=outbreak) | `CDC_CONTENT_API` | Disabled until a live test passes | Blocked by sandbox (tools.cdc.gov) |
| ECDC News RSS | `RSS` | Disabled; candidate URL `…/taxonomy/term/1307/feed` from a third-party directory | Blocked by sandbox (www.ecdc.europa.eu) |
| ECDC Communicable Disease Threats Report | `RSS` | Disabled; URL to copy from ECDC's RSS page | — |
| CDC HAN | `RSS` | Disabled; URL not confirmed | — |
| CDC Travel Notices | `RSS` | Disabled; candidate URL unverified | Blocked by sandbox (wwwnc.cdc.gov) |

**No live integration has been observed succeeding yet.** To check from your own machine, follow
[`docs/LIVE_SOURCE_VERIFICATION.md`](docs/LIVE_SOURCE_VERIFICATION.md) (`npm run verify:sources`). The sandbox
evidence is in `docs/verification/2026-10-08-build-sandbox.json`.

## Seed data and provenance

`prisma/seed.ts` loads sourced records: the Irkutsk investigation, Ebola (Bundibugyo virus) in DRC, Ebola in Uganda
(resolved), mpox clade Ib in DRC, an A(H5N1) notification in Bangladesh, and yellow fever in Côte d'Ivoire. Every
fact cites its publication. The direct sites were blocked during the build, so facts were compiled from search
results about those publications. These articles carry `origin = SEED`, media claims stay UNVERIFIED, and any time
that was approximate is noted in the row. Re-seeding never overwrites an operator's source URL or enabled setting.

## Project layout

```
app/                 pages + API routes (app/api/admin/* gated by proxy.ts)
components/          map, dashboard, outbreak, admin, ui
lib/domain/          enums, case-statistics rules, timeline model
lib/ingestion/       adapters, normalize, extract, match, pipeline (leases, retries), tick/scheduler, verify, pipeline-verify, discover
lib/server/queries.ts  as-of-aware read model
lib/geo/             country + city gazetteers
prisma/              canonical schema (SQLite), migrations, seed; prisma/postgres/ generated PostgreSQL schema + migrations
scripts/             worker, ingest, verify-sources, db-check, db-pg-sync, test-pg (all cross-platform Node)
tests/unit|integration|e2e, tests/fixtures
```

Basemap: Natural Earth borders (world-atlas 50m, served from `/geo`) and self-hosted Noto Sans glyphs, so it works
offline. Satellite mode uses Esri World Imagery tiles, with attribution, and needs network access.
