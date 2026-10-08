# VIGIL OUTBREAK — Global Infectious Disease Intelligence

An evidence-based monitoring platform for outbreaks, emerging pathogens, unexplained illnesses and official
public-health investigations. Architecture follows [VIGIL](https://github.com/atteeem/vigil) (Next.js App Router,
Prisma 7 driver adapters, MapLibre, HMAC admin gate), as an independent codebase with no dependency on it.
SQLite for local development, PostgreSQL for production; ingestion runs in a separate worker or cron job.

**Windows:** step-by-step PowerShell instructions are in [`docs/LOCAL_SETUP_WINDOWS.md`](docs/LOCAL_SETUP_WINDOWS.md).
**Deployment readiness:** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). **Live-source checks:**
[`docs/LIVE_SOURCE_VERIFICATION.md`](docs/LIVE_SOURCE_VERIFICATION.md).

**Featured record:** `/outbreaks/russia-irkutsk-2026`. This is a fatal pneumonia of undetermined cause in an Irkutsk
anti-plague institute worker. It is classified as an **unconfirmed investigation**. Plague (*Yersinia pestis*, a
bacterium) is listed as *suspected, not confirmed*. The death is confirmed, but it is **not** a confirmed plague death.

## Quick start

```bash
cp .env.example .env              # set ADMIN_PASSWORD and ADMIN_SESSION_SECRET
npm install                       # runs prisma generate
npx prisma migrate deploy         # creates prisma/dev.db
npm run db:seed                   # diseases, sources, sourced outbreak records
npm run dev                       # http://localhost:3000  (admin: /admin)
```

Production: `npm run build && npm start` plus `npm run worker` (or cron `npm run ingest -- --due`). Requires Node 22
or later.

| Command | Purpose |
| --- | --- |
| `npm run ingest` / `npm run ingest -- --due` | One-shot ingestion of all enabled sources, or only those due (cron-friendly; exit code 2 if a source failed) |
| `npm run ingest:backfill` | Same, following up to 4 upstream pages per source |
| `npm run verify:sources` | **Full-pipeline** check of WHO, CDC Content Services and ECDC's officially listed feeds. A source counts as verified only if real records are retrieved, parsed, stored, have dates/geography/disease extracted and deduplicate on a second run. Uses a throwaway DB. Exit 0 = all verified, 2 = blocked by network. See `docs/LIVE_SOURCE_VERIFICATION.md` |
| `npm run db:reference` | Non-destructive refresh of the disease reference list (names, agents, extractor keywords). Touches nothing else |
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

- **Overview `/`**: the KPI strip (investigations, confirmed active outbreaks, new reports in 24h, countries,
  last successful refresh) and the world map. The left column has filters, the outbreak list and verified
  developments. The right column shows the selected event. Below are playback controls, the intelligence feed and
  reporting volume.
- **Live Map `/map`**: a map-first version of the same workspace.
- **Outbreaks `/outbreaks`** and **`/outbreaks/[slug]`**: searchable listing and full records. A record has its
  chronology, confirmed facts, unverified reports, contradictions with provenance, official statements,
  measures, observations table, classification history, regional map, WHO/ECDC risk assessments and sources.
  Add `?asOf=` to see the record as it was known at that time.
- **Intelligence `/intelligence`**: the ingested publication feed. Each item shows its headline, country,
  pathogen or "unknown cause", time, source, summary, verification and linked outbreak.
- **Analytics `/analytics`**: confirmed and suspected cases, deaths, status, categories, geography and reporting
  history. A chart is drawn only when compatible observations exist; otherwise it shows an explanatory empty state.
- **Settings `/settings`**: time zone (UTC or local), default basemap, motion, and live source freshness.
- **Admin `/admin`** (password): sources with Test / Fetch Now / enable / URL / interval, Fetch Now for all
  sources, ingestion logs, incoming review (accept, link, reject, verify, promote a claim to an observation),
  outbreak create and edit, publish and unpublish, reclassification, observations, updates and corrections,
  merge, and audit history.

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
