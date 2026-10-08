# VIGIL OUTBREAK — Global Infectious Disease Intelligence

An evidence-based monitoring platform for outbreaks, emerging pathogens, unexplained illnesses and official
public-health investigations. Architecture follows [VIGIL](https://github.com/atteeem/vigil) (Next.js App Router,
Prisma 7 + SQLite driver adapter, MapLibre, HMAC admin gate, in-process scheduler), as an independent codebase
with no dependency on it.

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

Production: `npm run build && npm start`. Requires Node 22 or later.

| Command | Purpose |
| --- | --- |
| `npm run ingest` / `npm run ingest -- --due` | One-shot ingestion of all enabled sources, or only those due (cron-friendly; exit code 2 if a source failed) |
| `npm test` | Vitest: unit tests plus a DB-backed ingestion integration test (throwaway `prisma/vitest.db`) |
| `npm run test:e2e` | Playwright, desktop and Pixel 7. Builds its own `prisma/test.db` and serves fixtures, so no external network is needed |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |

If you use a different Chromium, set `PLAYWRIGHT_CHROMIUM_PATH`. Otherwise run `npx playwright install chromium`.

**PostgreSQL:** set `provider = "postgresql"` in `prisma/schema.prisma` and point `DATABASE_URL` at your database.
Then swap the adapter in `lib/db.ts` for `@prisma/adapter-pg` and run `npx prisma migrate dev`. Enum-like fields are
strings, so no model changes are needed. SQLite is the default because no Postgres server was available in the
build environment.

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

- **Adapters.** The WHO Disease Outbreak News OData API is `WHO_DON_API`, using the endpoint documented at
  `who.int/api/news/diseaseoutbreaknews/sfhelp`. RSS and Atom feeds are `RSS`, for ECDC, CDC and others.
- **Extraction** is deterministic and conservative. It picks out countries, cities, diseases, explicit dates and
  qualified counts. Everything extracted is stored as an **UNVERIFIED claim**. Only an analyst can promote a
  claim to an observation.
- **Association** only *suggests* an outbreak (`suggestedOutbreakId`). The link is made when an analyst accepts it.
- **Dedupe** works in three layers: canonical URL (a unique key), source plus external ID, and a title hash within
  ±3 days. Title-hash duplicates are kept as `DUPLICATE` for provenance and hidden from the feed.
- **Persisted per item:** original URL, source organisation, publication time, event date, fetch time, extracted
  claims, verification and review status, geographic precision and raw payload. Per run: HTTP status, counts and
  errors.
- **Failures** are recorded on the run and the source (last error, failure count, `FAILING`), with exponential
  backoff. Nothing is ever substituted for missing data.
- **Scheduling.** `instrumentation.ts` starts an in-process scheduler that checks every 60 s which sources are due.
  Each source has its own interval, defaulting to `INGESTION_INTERVAL_MINUTES=15`. Disable it with
  `DISABLE_INGESTION_SCHEDULER=1` and use `npm run ingest` from cron instead.
- **Public visibility.** Official publications appear in the feed straight away, labelled "awaiting review".
  Media items appear only after an analyst accepts them.

### Source status (verified 2026-10-08)

| Source | Status |
| --- | --- |
| WHO DON API | Enabled. Adapter tested against the documented response format with fixtures. **Not reachable from the build sandbox:** its egress policy returned HTTP 403 for who.int, and this is recorded in the run log. It needs a live check on an unrestricted network: `/admin` → Test endpoint. |
| ECDC CDTR / news RSS | Shipped **disabled with no URL**. The feed URLs could not be confirmed (ecdc.europa.eu was blocked). Paste the URL from ECDC's RSS page, Test it, then Enable. |
| CDC HAN RSS | Disabled, URL not confirmed. |
| CDC Travel Notices RSS | Disabled, candidate URL **unverified**. |

The Live indicator in the nav shows **Live** only when the scheduler is running *and* a source succeeded within two
polling intervals. Otherwise it shows Stale or Offline.

## Seed data and provenance

`prisma/seed.ts` loads sourced records: the Irkutsk investigation, Ebola (Bundibugyo virus) in DRC, Ebola in Uganda
(resolved), mpox clade Ib in DRC, an A(H5N1) notification in Bangladesh, and yellow fever in Côte d'Ivoire. Every
fact cites its publication. The direct sites were blocked during the build, so facts were compiled from search
results of those publications. Media claims stay UNVERIFIED, and any time that was approximate is noted in the row.
Re-verify against the originals once you have network access.

## Project layout

```
app/                 pages + API routes (app/api/admin/* gated by proxy.ts)
components/          map, dashboard, outbreak, admin, ui
lib/domain/          enums, case-statistics rules, timeline model
lib/ingestion/       adapters, normalize, extract, match, pipeline, scheduler
lib/server/queries.ts  as-of-aware read model
lib/geo/             country + city gazetteers
prisma/              schema, migrations, seed
tests/unit|integration|e2e, tests/fixtures
```

Basemap: Natural Earth borders (world-atlas 50m, served from `/geo`) and self-hosted Noto Sans glyphs, so it works
offline. Satellite mode uses Esri World Imagery tiles, with attribution, and needs network access.
