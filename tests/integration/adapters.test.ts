// Each adapter end-to-end through the real pipeline (persistence, provenance, dedupe, failure classes), against a
// local HTTP server that serves the documented response formats.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { prisma } from "@/lib/db";
import { runSource } from "@/lib/ingestion/pipeline";
import { verifyEndpoint } from "@/lib/ingestion/verify";
import { getFreshness, listFeed } from "@/lib/server/queries";

let server: Server;
let base = "";
const fx = (f: string) => readFileSync(`tests/fixtures/${f}`);
const pagedRows = [...JSON.parse(fx("who-don-paged-1.json").toString()).value, ...JSON.parse(fx("who-don-paged-2.json").toString()).value];

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const send = (status: number, type: string, body: string | Buffer, headers: Record<string, string> = {}) => res.writeHead(status, { "content-type": type, ...headers }).end(body);
    switch (u.pathname) {
      case "/cdc-content":
        return send(200, "application/json", fx(u.searchParams.get("pagenum") === "2" ? "cdc-content-p2.json" : "cdc-content-p1.json"));
      case "/ecdc":
        return send(200, "application/rss+xml", fx("ecdc-drupal.xml"));
      case "/who-paged":
        return send(200, "application/json", fx(u.searchParams.get("page") === "2" ? "who-don-paged-2.json" : "who-don-paged-1.json"));
      case "/who-odata": {
        // Minimal OData: honours $top/$skip on a newest-first collection.
        const top = Number(u.searchParams.get("$top") ?? 25);
        const skip = Number(u.searchParams.get("$skip") ?? 0);
        return send(200, "application/json", JSON.stringify({ value: pagedRows.slice(skip, skip + top) }));
      }
      case "/denied":
        // What a sandbox egress proxy returns for a non-allow-listed host.
        return send(403, "text/plain", "Host not in allowlist: www.who.int. Add this host to your network egress settings to allow access.", { "x-deny-reason": "host_not_allowed" });
      case "/publisher-403":
        return send(403, "text/html", "<html><body>Forbidden</body></html>", { server: "publisher" });
      case "/moved":
        return send(404, "text/html", "<html>Not found</html>");
      case "/html":
        return send(200, "text/html", "<!doctype html><html><body>Our feeds have moved</body></html>");
      default:
        return send(500, "text/plain", "error");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const mk = (slug: string, adapter: string, path: string) => ({ slug, name: `Adapter test ${slug}`, organization: "fixture", kind: "OFFICIAL", adapter, url: `${base}${path}`, enabled: true });
  await prisma.source.createMany({
    data: [
      mk("at-cdc", "CDC_CONTENT_API", "/cdc-content?q=outbreak"),
      mk("at-ecdc", "RSS", "/ecdc"),
      mk("at-who-paged", "WHO_DON_API", "/who-paged"),
      mk("at-denied", "WHO_DON_API", "/denied"),
      mk("at-403", "RSS", "/publisher-403"),
      mk("at-404", "RSS", "/moved"),
      mk("at-html", "RSS", "/html"),
    ],
  });
});

afterAll(async () => {
  server.close();
  await prisma.$disconnect();
});

const src = (slug: string) => prisma.source.findUniqueOrThrow({ where: { slug } });

describe("CDC Content Services adapter", () => {
  it("ingests, follows nextUrl, preserves provenance and dedupes", async () => {
    const r = await runSource((await src("at-cdc")).id, "TEST", { maxPages: 3 });
    expect(r.status).toBe("PARTIAL"); // the archived item is logged, not stored
    expect(r.itemsNew).toBe(3);
    const run = await prisma.ingestionRun.findUniqueOrThrow({ where: { id: r.runId! } });
    expect(run.pagesFetched).toBe(2);
    const a = await prisma.sourceArticle.findFirstOrThrow({ where: { externalId: "cdc-media-900002" } });
    expect(a).toMatchObject({ origin: "INGESTED", sourceType: "OFFICIAL", reviewStatus: "PENDING", canonicalUrl: "https://cdc.gov/fixture/han-plague.html" });
    expect(a.publishedAt.toISOString()).toBe("2026-10-04T18:30:00.000Z");
    expect(a.fetchedAt.getTime()).toBeGreaterThan(a.publishedAt.getTime());
    const ru = await prisma.outbreak.findUniqueOrThrow({ where: { slug: "russia-irkutsk-2026" } });
    expect(a.suggestedOutbreakId).toBe(ru.id);
    const measles = await prisma.sourceArticle.findFirstOrThrow({ where: { externalId: "cdc-media-900001" }, include: { claims: true } });
    expect(measles.claims.find((c) => c.metric === "CONFIRMED_CASES")?.value).toBe(14);
    expect(measles.claims.every((c) => c.verificationStatus === "UNVERIFIED")).toBe(true);
    const again = await runSource((await src("at-cdc")).id, "TEST", { maxPages: 3 });
    expect(again.itemsNew).toBe(0);
    expect(again.itemsDuplicate).toBe(3);
  });
});

describe("ECDC RSS (Drupal format)", () => {
  it("ingests and links to the investigation as a suggestion", async () => {
    const r = await runSource((await src("at-ecdc")).id, "TEST");
    expect(r.status).toBe("SUCCESS");
    expect(r.itemsNew).toBe(2);
    const a = await prisma.sourceArticle.findFirstOrThrow({ where: { externalId: "90001 at https://www.ecdc.europa.eu" } });
    expect(a.origin).toBe("INGESTED");
    expect(a.publishedAt.toISOString()).toBe("2026-10-06T10:15:00.000Z");
    expect(a.suggestedOutbreakId).not.toBeNull();
  });
});

describe("WHO DON paging", () => {
  it("follows @odata.nextLink up to maxPages", async () => {
    const r = await runSource((await src("at-who-paged")).id, "TEST", { maxPages: 5 });
    expect(r.itemsFetched).toBe(30);
    const run = await prisma.ingestionRun.findUniqueOrThrow({ where: { id: r.runId! } });
    expect(run.pagesFetched).toBe(2);
  });
  it("scheduled runs read only the newest page by default", async () => {
    const r = await runSource((await src("at-who-paged")).id, "TEST");
    expect(r.itemsFetched).toBe(25);
    expect(r.itemsNew).toBe(0);
  });
});

describe("failure classes are recorded, nothing is fabricated", () => {
  it("separates network-policy blocks from publisher errors and format changes", async () => {
    const before = await prisma.sourceArticle.count();
    const denied = await runSource((await src("at-denied")).id, "TEST");
    expect(denied).toMatchObject({ status: "FAILED", failureKind: "NETWORK_POLICY_BLOCKED" });
    expect(denied.error).toMatch(/never|Blocked by local network policy/);
    expect((await src("at-denied")).endpointStatus).toBe("BLOCKED");
    expect((await runSource((await src("at-403")).id, "TEST")).failureKind).toBe("HTTP_AUTH");
    expect((await runSource((await src("at-404")).id, "TEST")).failureKind).toBe("HTTP_NOT_FOUND");
    expect((await runSource((await src("at-html")).id, "TEST")).failureKind).toBe("SCHEMA_MISMATCH");
    const run = await prisma.ingestionRun.findFirstOrThrow({ where: { source: { slug: "at-denied" } } });
    expect(run.failureKind).toBe("NETWORK_POLICY_BLOCKED");
    expect(await prisma.sourceArticle.count()).toBe(before);
  });

  it("fixture successes never make the public freshness claim live", async () => {
    const f = await getFreshness();
    expect(f.lastSuccessAt).toBeNull();
    expect(f.live.state).not.toBe("LIVE");
  });

  it("labels ingested vs seeded items in the feed", async () => {
    const feed = await listFeed(null, {}, 200);
    expect(feed.find((i) => i.title.startsWith("Fixture: Health Advisory"))?.origin).toBe("INGESTED");
    expect(feed.find((i) => i.title.startsWith("ECDC closely monitoring"))?.origin).toBe("SEED");
  });
});

describe("live-source verifier", () => {
  it("verifies a well-formed paged OData endpoint", async () => {
    const r = await verifyEndpoint("who", "WHO_DON_API", `${base}/who-odata`, new Date("2026-10-08T00:00:00Z"));
    expect(r.verdict).toBe("VERIFIED");
    expect(r.checks.find((c) => c.name === "pagination")?.status).toBe("PASS");
    expect(r.checks.find((c) => c.name === "ordering")?.status).toBe("PASS");
  });
  it("reports a policy denial as BLOCKED_BY_NETWORK", async () => {
    const r = await verifyEndpoint("who", "WHO_DON_API", `${base}/denied`);
    expect(r.verdict).toBe("BLOCKED_BY_NETWORK");
    expect(r.failureKind).toBe("NETWORK_POLICY_BLOCKED");
  });
  it("reports wrong format and wrong path as FAILED with the right class", async () => {
    expect((await verifyEndpoint("x", "RSS", `${base}/html`)).failureKind).toBe("SCHEMA_MISMATCH");
    expect((await verifyEndpoint("x", "RSS", `${base}/moved`)).failureKind).toBe("HTTP_NOT_FOUND");
  });
  it("verifies CDC paging via pagenum", async () => {
    const r = await verifyEndpoint("cdc", "CDC_CONTENT_API", `${base}/cdc-content?q=outbreak`, new Date("2026-10-08T00:00:00Z"));
    expect(r.checks.find((c) => c.name === "pagination")?.status).toBe("PASS");
    expect(r.itemCount).toBe(2);
  });
});
