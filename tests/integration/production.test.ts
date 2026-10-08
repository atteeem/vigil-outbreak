// Production-readiness behaviours against a real database: full-pipeline verification, retries/backoff,
// cross-process leases, idempotent concurrent ingestion, due-source scheduling and the ingestion heartbeat.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { prisma } from "@/lib/db";
import { runSource, dueSources } from "@/lib/ingestion/pipeline";
import { verifyPipeline } from "@/lib/ingestion/pipeline-verify";
import { ingestionTick } from "@/lib/ingestion/tick";
import { getFreshness } from "@/lib/server/queries";

let server: Server;
/** Unique copy of a shared fixture (URLs, ids, titles) so this file never collides with other test files' data. */
const variant = (text: string, tag: string) => text.replace(/fixture/gi, tag).replace(/9000(\d)/g, `${tag.length}${tag.length}77$1`);
let base = "";
const hits: Record<string, number> = {};

// A realistic WHO DON collection: "<Disease> – <Country>" titles, newest first, honouring $top/$skip.
const WHO_TITLES = [
  "Cholera - Sudan", "Avian Influenza A(H5N1) - Cambodia", "Marburg virus disease - Rwanda", "Mpox - Democratic Republic of the Congo",
  "Yellow fever - Colombia", "Nipah virus infection - Bangladesh", "Dengue - Brazil", "Middle East respiratory syndrome coronavirus - Saudi Arabia",
  "Measles - Mongolia", "Anthrax - Kenya", "Lassa fever - Nigeria", "Diphtheria - Guinea",
];
const whoRows = WHO_TITLES.map((t, i) => ({ Id: `real-${i}`, DonId: `2026-DON9${String(i).padStart(2, "0")}`, Title: t, UrlName: `2026-DON9${String(i).padStart(2, "0")}`, PublicationDate: new Date(Date.UTC(2026, 8, 30 - i * 2, 9)).toISOString(), Summary: `<p>On ${30 - i * 2} September 2026 the Ministry of Health notified WHO.</p>` }));

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    hits[u.pathname] = (hits[u.pathname] ?? 0) + 1;
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) => res.writeHead(status, { "content-type": "application/json", ...headers }).end(typeof body === "string" ? body : JSON.stringify(body));
    switch (u.pathname) {
      case "/who-real": {
        const top = Number(u.searchParams.get("$top") ?? 25);
        const skip = Number(u.searchParams.get("$skip") ?? 0);
        return json(200, { value: whoRows.slice(skip, skip + top) });
      }
      case "/who-noextract": {
        const top = Number(u.searchParams.get("$top") ?? 25);
        const skip = Number(u.searchParams.get("$skip") ?? 0);
        return json(200, { value: whoRows.slice(skip, skip + top).map((r) => ({ ...r, Id: `nx-${r.Id}`, DonId: `nx-${r.DonId}`, UrlName: `nx-${r.UrlName}`, Title: `Bulletin ${r.Id}`, Summary: "<p>General update.</p>" })) });
      }
      case "/empty":
        return json(200, { value: [] });
      case "/cdc":
        return json(200, variant(readFileSync(`tests/fixtures/cdc-content-p${u.searchParams.get("pagenum") === "2" ? 2 : 1}.json`, "utf8"), "prodcdc"));
      case "/flaky": // fails twice with 503, then succeeds
        return (hits[u.pathname] ?? 0) <= 2 ? json(503, { error: "busy" }) : res.writeHead(200, { "content-type": "application/rss+xml" }).end(variant(readFileSync("tests/fixtures/ecdc-drupal.xml", "utf8"), "prodflaky"));
      case "/always-503":
        return json(503, { error: "down" });
      case "/rate-limited":
        return (hits[u.pathname] ?? 0) <= 1 ? json(429, { error: "slow down" }, { "retry-after": "0" }) : res.writeHead(200, { "content-type": "application/rss+xml" }).end(variant(readFileSync("tests/fixtures/ecdc.xml", "utf8"), "prodratelimit"));
      case "/denied":
        return res.writeHead(403, { "content-type": "text/plain", "x-deny-reason": "host_not_allowed" }).end("Host not in allowlist");
      default:
        return json(404, {});
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  await prisma.$disconnect();
});

const mkSource = (slug: string, adapter: string, path: string, extra: Record<string, unknown> = {}) =>
  prisma.source.create({ data: { slug, name: `Prod test ${slug}`, organization: "fixture", kind: "OFFICIAL", adapter, url: `${base}${path}`, enabled: true, ...extra } });

describe("full-pipeline verification (reachable is not enough)", () => {
  it("PIPELINE_VERIFIED requires retrieval, parsing, persistence, extraction and dedupe", async () => {
    const r = await verifyPipeline({ slug: "who-real", adapter: "WHO_DON_API", url: `${base}/who-real` }, { now: new Date("2026-10-08T00:00:00Z") });
    expect(r.verdict).toBe("PIPELINE_VERIFIED");
    expect(r.stages.map((s) => s.name)).toEqual(["endpoint", "ingest", "persistence", "dates", "geography", "disease", "dedupe"]);
    expect(r.stored).toBe(12);
    expect(r.extraction!.withCountry).toBeGreaterThanOrEqual(11);
    expect(r.extraction!.withDisease).toBeGreaterThanOrEqual(10);
    expect(r.samples[0]!.countries).toContain("SD");
  });
  it("fails a WHO feed whose records yield no geography/disease (extractor or format mismatch)", async () => {
    const r = await verifyPipeline({ slug: "who-noextract", adapter: "WHO_DON_API", url: `${base}/who-noextract` }, { now: new Date("2026-10-08T00:00:00Z") });
    expect(r.verdict).toBe("FAILED");
    expect(r.failedStage).toBe("geography");
  });
  it("fails an endpoint that answers correctly but has no records", async () => {
    const r = await verifyPipeline({ slug: "empty", adapter: "WHO_DON_API", url: `${base}/empty` });
    expect(r.verdict).toBe("FAILED");
  });
  it("reports network-policy blocks distinctly", async () => {
    const r = await verifyPipeline({ slug: "denied", adapter: "RSS", url: `${base}/denied` });
    expect(r).toMatchObject({ verdict: "BLOCKED_BY_NETWORK", failedStage: "endpoint", failureKind: "NETWORK_POLICY_BLOCKED" });
  });
  it("verifies CDC Content Services end to end (extraction thresholds only warn for broad news)", async () => {
    const r = await verifyPipeline({ slug: "cdc", adapter: "CDC_CONTENT_API", url: `${base}/cdc?q=outbreak` }, { now: new Date("2026-10-08T00:00:00Z") });
    expect(r.verdict).toBe("PIPELINE_VERIFIED");
    expect(r.stored).toBe(2);
  });
});

describe("retry and backoff", () => {
  it("retries transient 5xx within a run and succeeds", async () => {
    const s = await mkSource("prod-flaky", "RSS", "/flaky");
    const r = await runSource(s.id, "TEST");
    expect(r.status).toBe("SUCCESS");
    expect(hits["/flaky"]).toBe(3);
  });
  it("honours 429 + Retry-After", async () => {
    const s = await mkSource("prod-429", "RSS", "/rate-limited");
    const r = await runSource(s.id, "TEST");
    expect(r.status).toBe("PARTIAL"); // fixture's undated item is logged, not invented
    expect(r.itemsNew).toBe(1);
    expect(hits["/rate-limited"]).toBe(2);
  });
  it("gives up after the retry budget, records the failure and schedules backoff", async () => {
    const s = await mkSource("prod-503", "RSS", "/always-503");
    const before = Date.now();
    const r = await runSource(s.id, "TEST");
    expect(r).toMatchObject({ status: "FAILED", failureKind: "HTTP_SERVER" });
    expect(r.error).toMatch(/after 3 attempts/);
    expect(hits["/always-503"]).toBe(3);
    const row = await prisma.source.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.consecutiveFailures).toBe(1);
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(before + 25 * 60_000); // 15 min × 2 backoff (±10%)
  });
  it("never retries a network-policy block", async () => {
    const s = await mkSource("prod-denied", "RSS", "/denied");
    hits["/denied"] = 0;
    expect((await runSource(s.id, "TEST")).failureKind).toBe("NETWORK_POLICY_BLOCKED");
    expect(hits["/denied"]).toBe(1);
  });
});

describe("leases, idempotency and scheduling", () => {
  it("skips a source leased by another process and recovers an expired lease", async () => {
    const s = await mkSource("prod-lease", "CDC_CONTENT_API", "/cdc");
    await prisma.source.update({ where: { id: s.id }, data: { leaseOwner: "other-host:1", leaseUntil: new Date(Date.now() + 60_000) } });
    const skipped = await runSource(s.id, "TEST");
    expect(skipped.status).toBe("SKIPPED");
    expect(skipped.error).toMatch(/lease/);
    const stale = await prisma.ingestionRun.create({ data: { sourceId: s.id, trigger: "SCHEDULED", status: "RUNNING", startedAt: new Date(Date.now() - 60 * 60_000) } });
    await prisma.source.update({ where: { id: s.id }, data: { leaseUntil: new Date(Date.now() - 1000) } });
    expect((await runSource(s.id, "TEST")).status).not.toBe("SKIPPED");
    expect((await prisma.ingestionRun.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("ABANDONED");
    expect((await prisma.source.findUniqueOrThrow({ where: { id: s.id } })).leaseOwner).toBeNull();
  });
  it("concurrent runs of the same source never double-fetch", async () => {
    const s = await mkSource("prod-concurrent", "WHO_DON_API", "/who-real");
    const [a, b] = await Promise.all([runSource(s.id, "TEST"), runSource(s.id, "TEST")]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toContain("SKIPPED");
  });
  it("two sources racing on the same items store each item once (unique keys make inserts idempotent)", async () => {
    const x = await mkSource("prod-race-a", "RSS", "/flaky");
    const y = await mkSource("prod-race-b", "RSS", "/flaky");
    const before = await prisma.sourceArticle.count();
    const [ra, rb] = await Promise.all([runSource(x.id, "TEST"), runSource(y.id, "TEST")]);
    expect(ra.itemsFailed + rb.itemsFailed).toBe(0);
    expect(await prisma.sourceArticle.count()).toBe(before); // all items were already stored by prod-flaky
  });
  it("dueSources honours the persisted retry schedule and leases", async () => {
    const due = await prisma.source.create({ data: { slug: "prod-due", name: "due", organization: "fixture", kind: "OFFICIAL", adapter: "RSS", url: `${base}/flaky`, enabled: true, nextAttemptAt: new Date(Date.now() - 1000) } });
    const later = await prisma.source.create({ data: { slug: "prod-later", name: "later", organization: "fixture", kind: "OFFICIAL", adapter: "RSS", url: `${base}/flaky`, enabled: true, nextAttemptAt: new Date(Date.now() + 3600_000) } });
    const leased = await prisma.source.create({ data: { slug: "prod-leased", name: "leased", organization: "fixture", kind: "OFFICIAL", adapter: "RSS", url: `${base}/flaky`, enabled: true, leaseOwner: "x", leaseUntil: new Date(Date.now() + 60_000) } });
    const ids = (await dueSources()).map((s) => s.id);
    expect(ids).toContain(due.id);
    expect(ids).not.toContain(later.id);
    expect(ids).not.toContain(leased.id);
  });
});

describe("ingestion heartbeat", () => {
  it("each pass records a heartbeat that the live status reads", async () => {
    await ingestionTick("worker", new Date());
    const beat = await prisma.workerHeartbeat.findUniqueOrThrow({ where: { id: "worker" } });
    expect(beat.ticks).toBeGreaterThanOrEqual(1);
    expect(beat.lastTickStatus).toMatch(/source|idle/);
    const f = await getFreshness();
    expect(f.live.worker?.healthy).toBe(true);
    // Fixture (localhost) successes still never make the public status LIVE.
    expect(f.live.state).not.toBe("LIVE");
  });
});
