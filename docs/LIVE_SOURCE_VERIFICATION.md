# Live-source verification procedure

Use this on any machine with normal internet access. A laptop on a home or office network is fine. No API keys are needed.

## 0. What happened in the build environment

Every upstream host was refused by the sandbox's egress proxy before a TLS handshake took place:

```
> CONNECT www.who.int:443 HTTP/1.1
< HTTP/1.1 403 Forbidden            (from the local proxy, 127.0.0.1)
x-deny-reason: host_not_allowed
Host not in allowlist: www.who.int. Add this host to your network egress settings to allow access.
```

The request never reached WHO, CDC or ECDC. That rules out a malformed request, a wrong endpoint and missing
authentication, but it also means none of them was proven correct. The adapters classify this case as
`NETWORK_POLICY_BLOCKED` and mark the source `BLOCKED`, not `FAILING`. The captured report is in
[`verification/2026-10-08-build-sandbox.json`](verification/2026-10-08-build-sandbox.json).

## 1. Set up (once)

```bash
git clone vigil-outbreak.bundle vigil-outbreak && cd vigil-outbreak
cp .env.example .env                  # set ADMIN_PASSWORD / ADMIN_SESSION_SECRET
npm install
npx prisma migrate deploy && npm run db:seed
```

Node 22 or later. Behind a corporate proxy, export `HTTPS_PROXY` and, on Node versions that support it, set `NODE_USE_ENV_PROXY=1`
so `fetch` uses the proxy. If the proxy inspects TLS, also set `NODE_EXTRA_CA_CERTS`.

## 2. Check every endpoint (stores nothing)

```bash
npm run verify:sources
```

This checks every configured automatic source that has a URL, plus WHO's two sibling routes as diagnostics.
For each one it runs:

| Check | Meaning |
|---|---|
| reachable | HTTP 2xx. On failure, the failure class (below) and a hint |
| schema | Items parse in the documented format: WHO OData `value[]` with Title/PublicationDate/UrlName; CDC `results[]` with name/sourceUrl/datePublished; RSS or Atom items with title/link/date |
| freshness | Newest item is no more than 45 days old (otherwise WARN) |
| timestamps | Publication times parse and are not in the future |
| ordering | Newest first (WHO, CDC) |
| pagination | Page 2 (`$skip` for WHO, `pagenum` for CDC) returns different, older items |

Exit codes: `0` everything verified, `2` blocked by local network policy, `1` a source failed or is degraded.
A JSON report is written to `reports/`.

Useful variants:

```bash
npm run verify:sources -- --only who-don                    # one source
npm run verify:sources -- --url "https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed" --adapter RSS
npm run verify:sources -- --update-db                       # record results on each Source (never enables)
```

Raw sanity check with curl:

```bash
curl -s "https://www.who.int/api/news/diseaseoutbreaknews?\$orderby=PublicationDate%20desc&\$top=2" | head -c 600
curl -s "https://tools.cdc.gov/api/v2/resources/media?q=outbreak&max=2" | head -c 600
```

## 3. Enable what verified

1. `npm run dev`, then open `/admin` and log in.
2. For ECDC, copy the exact feed URL for *News* and/or *Communicable disease threats report* from
   https://www.ecdc.europa.eu/en/rss-feeds into the source's URL field and **Save**.
3. Click **Test endpoint**. A source can be enabled only after its test passes; the API refuses otherwise.
4. Click **Enable**, then **Fetch now**. Check `/admin/logs` for a SUCCESS or PARTIAL run with new items.
5. Optional backfill of older WHO and CDC pages: `npm run ingest:backfill` (4 pages).

## 4. Confirm the public UI

- The nav indicator shows **Live** only after a real (non-localhost) source has succeeded within two polling
  intervals. Until then it says **Not live** or **Stale**.
- Overview → KPI **Last successful live ingestion** shows the timestamp of that success.
- `/intelligence`: newly retrieved items carry an **Auto-ingested** badge with their retrieval time. The initial
  dataset carries **Seeded**.

## 5. Failure classes

| Class | Meaning | Typical fix |
|---|---|---|
| NETWORK_POLICY_BLOCKED | A local/egress proxy refused the host; the publisher never saw the request | Allow the host or use another network |
| PROXY_ERROR | Proxy failure | Check proxy settings |
| DNS / TIMEOUT / CONNECTION / TLS | Network layer | Connectivity, firewall, CA certificates |
| HTTP_AUTH | The publisher itself answered 401/403 | Check URL and terms; do not try to bypass |
| HTTP_NOT_FOUND | 404/410 | Endpoint moved; re-check the documentation |
| HTTP_RATE_LIMITED | 429 | Raise the polling interval |
| HTTP_CLIENT / HTTP_SERVER | Other 4xx / 5xx | Query parameters / transient |
| SCHEMA_MISMATCH | Reachable but not in the documented format (for example an HTML page) | Adapter review before trusting data |

## 6. Known open questions to settle on first live run

- **WHO DON paging.** Whether the server returns `@odata.nextLink`, and whether `$skip` is honoured. The adapter
  supports both and stops if a page repeats. The `pagination` check answers this.
- **CDC query.** `q=outbreak` is a starting point. If the `ordering` check WARNs, add a sort parameter that the
  live API accepts. Keep whatever passes `verify:sources`.
- **ECDC feed IDs.** `taxonomy/term/1307` (News) comes from a third-party directory and must be confirmed on
  ECDC's RSS page.
