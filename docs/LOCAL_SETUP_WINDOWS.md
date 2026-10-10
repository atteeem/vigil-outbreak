# VIGIL OUTBREAK — local setup on Windows (PowerShell)

These are exact commands for Windows 10/11 in **PowerShell** (Windows PowerShell 5.1 or PowerShell 7). Lines
starting with `#` are comments. Paths assume you work in `C:\dev`; change them freely.

> **What the build sandbox could and could not verify.** Everything in §1–§8 except live sources was executed in
> the build environment (Linux), on SQLite and on PostgreSQL 16: typecheck, lint, 88 unit/integration tests,
> 25 browser tests, production build, migrations, worker, health endpoint. **The live checks in §6 have never
> succeeded anywhere yet.** The sandbox's network policy refused www.who.int, tools.cdc.gov and
> www.ecdc.europa.eu before any request left the machine. Whether WHO, CDC and ECDC actually work with this app
> is only known after **you** run §6 on your computer.

---

## 1. Prerequisites (once)

```powershell
# Node.js 22 LTS (or newer) and Git
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Git.Git -e
# Close and reopen PowerShell, then check:
node --version     # v22.x or newer
npm --version
git --version
```

If PowerShell says *"running scripts is disabled on this system"* when you run `npm`, allow local scripts for
your user (once):

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 2. Clone from the Git bundle

```powershell
New-Item -ItemType Directory -Force C:\dev | Out-Null
Set-Location C:\dev
# Point this at the downloaded file:
$bundle = "$env:USERPROFILE\Downloads\vigil-outbreak.bundle"
git bundle verify $bundle                 # must end with: "The bundle records a complete history."
git clone $bundle vigil-outbreak
Set-Location C:\dev\vigil-outbreak
git log --oneline -3                      # newest commit first; compare with the hash given in the handoff report
```

## 3. Install dependencies

```powershell
npm ci
```

- `npm ci` installs exactly the versions in `package-lock.json`. If it fails because of a platform-specific
  optional package, run `npm install` instead.
- `better-sqlite3` downloads a prebuilt Windows binary during install, so it needs internet access to github.com.
  If that download is blocked, install *Visual Studio Build Tools (Desktop development with C++)* and run
  `npm install` again so it can compile.
- `postinstall` runs `prisma generate` automatically, and copies MapLibre's worker into `public\` if it differs
  from the installed version.
- There is a single `better-sqlite3` (12.11.1, the version Prisma's adapter needs), so only one native binary is
  installed (see §12).

## 4. Configure environment variables

```powershell
Copy-Item .env.example .env

# Generate two strong random secrets and write them into .env
function New-Secret { $b = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) }
$adminPassword = New-Secret
$sessionSecret = New-Secret
(Get-Content .env) `
  -replace '^ADMIN_PASSWORD=.*', "ADMIN_PASSWORD=$adminPassword" `
  -replace '^ADMIN_SESSION_SECRET=.*', "ADMIN_SESSION_SECRET=$sessionSecret" |
  Set-Content .env -Encoding utf8

Write-Host "Your admin password is: $adminPassword"   # save it in your password manager
notepad .env                                           # optional: review other settings
```

Defaults are fine for local use: SQLite at `prisma/dev.db`, ingestion inside the dev server, 15-minute polling.
Optionally set `INGESTION_CONTACT=you@example.org` so publishers can identify your requests.

## 5. Database migrations and data

```powershell
npx prisma migrate deploy      # creates prisma\dev.db and applies all migrations
npm run db:seed                # diseases, sources, sourced outbreak records (incl. the Irkutsk investigation)
npm run db:check               # expect three PASS lines
```

## 6. Run the real-source verification (requires your internet connection)

This is the step the sandbox could not do.

```powershell
npm run verify:sources
$LASTEXITCODE                  # 0 = all verified end-to-end · 2 = blocked by your network · 1 = a source failed
```

What it does, per source: WHO Disease Outbreak News, CDC Content Services, and every feed listed on ECDC's
official page https://www.ecdc.europa.eu/en/rss-feeds (discovered automatically):

1. **Endpoint.** Reachable; response in the documented format; fresh; newest-first; page 2 differs from page 1.
2. **Ingest.** Runs the real pipeline and must store ≥1 real record.
3. **Persistence.** Rows exist with URL, publisher, origin = INGESTED, run id, and publication + retrieval times.
4. **Dates, geography, disease.** Every publication date is valid. For WHO, ≥60% of records must yield a country
   and ≥60% a disease (or an unknown-cause flag). CDC and ECDC are only warned on, because their news is broader.
5. **Dedupe.** An immediate second run must store nothing new.

Only a source that passes all of these is reported as **`PIPELINE_VERIFIED`**. A reachable endpoint is not
enough. The ingestion runs in a throwaway database (`prisma\verify.db`, recreated each time). Your `dev.db` is not
touched. A JSON report is written to `reports\`.

Useful variants:

```powershell
npm run verify:sources -- --only who-don                # who-don | cdc-content | ecdc
npm run verify:sources -- --update-db                   # also record the verdicts on your sources (never enables them)
npm run verify:sources -- --endpoint-only               # quick reachability/schema check (does NOT prove ingestion)
npm run verify:sources -- --url "https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed" --adapter RSS
Get-ChildItem reports | Sort-Object LastWriteTime | Select-Object -Last 1 | Get-Content    # newest report
```

Please send me the console output or the newest report file. That is the evidence that decides which
integrations work.

## 7. Start the website

```powershell
npm run dev
# open http://localhost:3000
```

The dev server also runs scheduled ingestion every minute for due sources (`INGESTION_MODE=inline`).

Production-style run, with web and ingestion in separate processes:

```powershell
npm run build
# Window 1 (web):
npm start                       # http://localhost:3000 — does NOT schedule ingestion in production mode
# Window 2 (ingestion worker):
npm run worker                  # Ctrl+C stops it gracefully
```

## 8. Admin dashboard: enable the sources that verified

1. Open http://localhost:3000/admin and sign in with the `ADMIN_PASSWORD` from step 4.
2. *Sources & ingestion* shows the live-ingestion health panel, each source's endpoint status and last error
   (with failure class and hint), and the ingestion-process heartbeat.
3. For each source that was `PIPELINE_VERIFIED` in step 6:
   - For ECDC, paste the exact feed URL that verified into the URL field and click **Save**.
   - Click **Test endpoint**. It must pass; a source cannot be enabled otherwise.
   - Click **Enable**, then **Fetch now**.
4. Check */admin/logs* (runs, failure classes) and */intelligence*: new items carry an **Auto-ingested** badge.
5. The nav indicator turns **Live** only after a real source has succeeded recently *and* the ingestion process
   (dev server, worker or scheduled task) is running.
6. Seeded facts: */admin/review?status=ACCEPTED*, then **Mark checked vs primary** after you open each original
   publication. The Irkutsk checklist is in `docs\IRKUTSK_VALIDATION.md`.

## 9. Optional: scheduled ingestion with Windows Task Scheduler (instead of a worker window)

```powershell
New-Item -ItemType Directory -Force C:\dev\vigil-outbreak\logs | Out-Null
$action  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument '/c cd /d C:\dev\vigil-outbreak && npm run ingest -- --due >> logs\ingest.log 2>&1'
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName "VIGIL OUTBREAK ingestion" -Action $action -Trigger $trigger -Description "Fetch due outbreak sources"
# Remove later with:
# Unregister-ScheduledTask -TaskName "VIGIL OUTBREAK ingestion" -Confirm:$false
```

## 10. Diagnosing network and API errors

`verify:sources` and */admin* report a **failure class** for every error:

| Class | Meaning | What to do on Windows |
|---|---|---|
| `NETWORK_POLICY_BLOCKED` | A proxy/firewall refused the host; the publisher never saw the request | Corporate network or VPN policy: ask IT to allow the host, or try another network |
| `PROXY_ERROR` | Proxy failure | See *Proxy* below |
| `DNS` | Host name did not resolve | `Resolve-DnsName www.who.int` |
| `TIMEOUT` / `CONNECTION` | No answer or connection reset | `Test-NetConnection www.who.int -Port 443`; check firewall/antivirus |
| `TLS` | Certificate validation failed (usually TLS-inspecting antivirus or proxy) | Export the root CA as `.pem` and set `$env:NODE_EXTRA_CA_CERTS = "C:\path\corp-root.pem"` |
| `HTTP_AUTH` | The publisher itself answered 401/403 | Check the URL in the source's documentation; do not try to bypass |
| `HTTP_NOT_FOUND` | 404/410: endpoint moved | Re-check the publisher's documentation; update the URL in /admin |
| `HTTP_RATE_LIMITED` | 429 | Increase the polling interval in /admin |
| `HTTP_SERVER` | Publisher 5xx (already retried twice) | Usually transient; wait |
| `SCHEMA_MISMATCH` | Reachable but not in the documented format (for example an HTML page) | Send me the report; the adapter needs review |

Manual checks, independent of the app:

```powershell
Test-NetConnection www.who.int -Port 443
Test-NetConnection tools.cdc.gov -Port 443
Test-NetConnection www.ecdc.europa.eu -Port 443

# WHO DON API: newest two items (single quotes keep $top literal)
(Invoke-RestMethod 'https://www.who.int/api/news/diseaseoutbreaknews?$orderby=PublicationDate desc&$top=2').value |
  Select-Object Title, PublicationDate, UrlName

# CDC Content Services
(Invoke-RestMethod 'https://tools.cdc.gov/api/v2/resources/media?q=outbreak&max=2').results |
  Select-Object id, name, datePublished, sourceUrl

# ECDC RSS index page, and one feed
(Invoke-WebRequest 'https://www.ecdc.europa.eu/en/rss-feeds' -UseBasicParsing).StatusCode
([xml](Invoke-WebRequest 'https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed' -UseBasicParsing).Content).rss.channel.item |
  Select-Object -First 3 title, pubDate
```

**Proxy.** If these PowerShell commands work but `verify:sources` reports `CONNECTION`/`TIMEOUT`, your network
probably requires a proxy. PowerShell uses the Windows system proxy; Node.js does not. Check with:

```powershell
netsh winhttp show proxy
```

Then, in the same PowerShell window before running npm:

```powershell
$env:HTTPS_PROXY = "http://proxy.example.com:8080"
$env:NODE_USE_ENV_PROXY = "1"        # makes Node's built-in fetch honour HTTPS_PROXY on Node versions that support it (recent 22.x / 24+); otherwise upgrade Node
npm run verify:sources
```

## 11. Running the test suites on Windows (optional)

```powershell
npm run typecheck
npm run lint
npm test                              # 136 unit + integration tests on a throwaway SQLite DB
npx playwright install chromium       # once
npm run test:e2e                      # 35 browser tests (desktop + mobile; Live Map, Sources UI, end-to-end workflow), own test DB and port 3100
```

With a local PostgreSQL (optional; for example installed via `winget install PostgreSQL.PostgreSQL.16`):

```powershell
$env:TEST_DATABASE_URL = "postgresql://postgres:YOUR_PASSWORD@localhost:5432/vigil_test"   # create the DB first
npm run test:pg                       # same 136 tests on PostgreSQL; restores the SQLite client afterwards
```

## 12. Updating an existing installation (keeps your data)

Your database (`prisma\dev.db`) and settings (`.env`) are ignored by Git, so updating the code never replaces
them. Update **in place**, in the folder you already use. Do not clone into a new folder and do not run `npm ci`,
because `npm ci` deletes `node_modules` and reinstalls everything.

```powershell
cd C:\dev\vigil-outbreak
# Stop the dev server / worker first (Ctrl+C in their windows).

# 1. Back up the data (a copy, never moved).
$stamp = Get-Date -Format yyyyMMdd-HHmm
New-Item -ItemType Directory -Force backups | Out-Null
Copy-Item prisma\dev.db "backups\dev.db.$stamp"
Copy-Item .env "backups\.env.$stamp"

# 2. Keep a copy of the SQLite native binding that already works on this PC (see the note below).
$nested = "node_modules\@prisma\adapter-better-sqlite3\node_modules\better-sqlite3\build\Release\better_sqlite3.node"
if (Test-Path $nested) { Copy-Item $nested "backups\better_sqlite3.node.$stamp" }

# 3. Get the new commits. From a bundle:
$bundle = "$env:USERPROFILE\Downloads\vigil-outbreak.bundle"
git bundle verify $bundle
git fetch $bundle main:refs/remotes/bundle/main
git merge --ff-only bundle/main            # or: git pull   (if you use the GitHub remote)
git status --short                          # dev.db / .env never appear here: they are not tracked

# 4. Update only what changed (no full reinstall).
npm install                                 # also runs: prisma generate + MapLibre worker sync
npx prisma migrate deploy                   # applies new migrations only; never deletes rows
npm run db:reference                        # non-destructive: reference data + tracked-investigation setup
```

**The Irkutsk-tracker update (migration `20261010090000_tracked_event`)** adds columns and one table; it changes
no dependencies. On your database, `migrate deploy` makes the existing `russia-irkutsk-2026` record the primary
tracked event, and keeps your existing locations as verified. It also tags the articles already linked to it.
`db:reference` then makes these additions:

- the "Irkutsk (contacts under observation)" precautionary location;
- a disabled *Rospotrebnadzor — news (RSS)* source (paste its feed URL in `/admin`, then Save, Test endpoint,
  Enable);
- dates for the seeded contradictions, so historical views only show them from when they became known;
- tags for any other articles about the investigation.

Nothing is deleted, and nothing you edited is overwritten. Afterwards `/` is the investigation dashboard; the
previous overview is at `/global`.

Then check that the SQLite binding loads and your data is still there. Both commands are read-only:

```powershell
node -e "const D=require('better-sqlite3'); const db=new D('prisma/dev.db',{readonly:true}); console.log(db.prepare('select (select count(*) from Outbreak) outbreaks, (select count(*) from SourceArticle) articles, (select count(*) from Source) sources').get())"
npm run dev
```

**About the native SQLite binding (`better-sqlite3`).** Until commit `3a03df5`, the project had two copies of
`better-sqlite3`. A 13.x copy sat at the top level, unused. A 12.x copy was nested under
`@prisma\adapter-better-sqlite3\node_modules`, and that is the one the app actually loads. Each copy needs its
own Windows binary, which is why the nested one caused problems. There is now exactly one copy, `12.11.1`, in
`node_modules\better-sqlite3`, the same version the Prisma adapter requires. An npm `overrides` entry keeps it
that way. `npm install` downloads the prebuilt Windows binary for it.

If `npm install` reports a better-sqlite3 build error, or the check above says *Could not locate the bindings
file*, reuse the binary from step 2. It is the same version, so it is compatible:

```powershell
New-Item -ItemType Directory -Force node_modules\better-sqlite3\build\Release | Out-Null
Copy-Item (Get-ChildItem backups\better_sqlite3.node.* | Sort-Object Name | Select-Object -Last 1).FullName node_modules\better-sqlite3\build\Release\better_sqlite3.node
```

Only if neither works, run `npm rebuild better-sqlite3`. That needs Visual Studio Build Tools, see §3.

To roll back, stop the server, then run `git reset --hard <previous commit>` and `npm install`. If needed,
restore the backups with `Copy-Item backups\dev.db.<stamp> prisma\dev.db`.

Other optional upgrade steps from earlier milestones are still safe to run at any time:
`npm run db:reference` (adds/refreshes diseases), `npm run reprocess` (dry run) and
`npm run reprocess -- --apply`. `npm run db:seed` is also safe: it keeps existing seeded outbreaks as they are.

## 13. If the Live Map or the Sources page does not work

**Live Map**

| What you see | Cause | What to do |
|---|---|---|
| A yellow note *"Simplified map: this browser has no WebGL2 …"* and a flat map | The browser has no WebGL2. Common causes: hardware acceleration is off, the GPU driver is blocklisted, or this is a Remote Desktop/VM session. Recent Chrome and Edge versions no longer fall back to software WebGL. | Markers, selection and filters still work. For the interactive map, open `edge://settings/system` or `chrome://settings/system`, turn on *Use graphics acceleration when available* and restart the browser. `chrome://gpu` should then show *WebGL2: Hardware accelerated*. Updating the GPU driver also helps. |
| *"Simplified map: the map engine did not start …"* | The MapLibre worker (`/maplibre-gl-worker.mjs`) could not load. Antivirus or proxy filtering, or an outdated copy, can cause this. | Run `node scripts/sync-maplibre-worker.mjs --check`. If it reports a mismatch, run it without `--check`. Then open http://localhost:3000/maplibre-gl-worker.mjs. It must return JavaScript. |
| *"Basemap geometry failed to load"* | `/geo/countries-50m.json` is blocked or damaged | Run `git status public` (it must be clean). Then run `git checkout -- public`. |
| The map shows, but with no markers | Missing data, not a rendering problem | Open http://localhost:3000/api/dashboard. If `outbreaks` is empty, nothing is published yet. Run `npm run db:seed`, or publish an outbreak in the admin. |
| The whole page shows an error | Usually the database (see the native-binding note in §12) | Read the error in the `npm run dev` window |

Before this update, a browser without WebGL2 crashed the Overview and Live Map pages ("This page couldn't load"),
and a worker that failed to load left the map empty with no message. Both cases now show the simplified map.

**Sources (`/admin`)**

- **Login keeps returning to the sign-in page.** With `npm start` (production mode), opening the site as
  `http://<PC name or LAN IP>:3000` failed because the browser rejected the cookie, which was marked secure-only
  over plain HTTP. This is fixed. The cookie is now marked secure only on HTTPS.
- **Test endpoint / Fetch now are greyed out.** The source has no URL saved yet. The row says so. Paste the URL,
  click **Save**, then **Test endpoint**.
- **Enable is refused.** Enabling requires a passing **Test endpoint** after the last URL change. The red message
  says so.
- **Failures.** A failed test or fetch now shows in red with its failure class, and the row keeps the last error.
  Previously a failed check appeared in a green box.
- **The ECDC feeds you verified are not listed as sources.** `npm run verify:sources` ingests into a throwaway
  database. It does not add sources. Put each feed URL you want into an ECDC row (*News* /
  *Communicable disease threats report*), then click **Save → Test endpoint → Enable → Fetch now**.
- **"Not live".** The indicator turns **Live** only after a real (non-localhost) source has succeeded recently
  **and** an ingestion process is running. `npm run dev` counts. With `npm start`, also run `npm run worker`
  (§7).

## What I need back from you

1. The output of `npm run verify:sources` (or the newest `reports\source-verification-*.json`). For CDC, the
   `actual response:` line / `responseSample` field is what identifies its real format.
2. If anything failed, the failure class and message shown for that source.
