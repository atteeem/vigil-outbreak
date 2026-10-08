// End-to-end ingestion against a local HTTP server serving recorded-format fixtures, using a throwaway SQLite DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { prisma } from "@/lib/db";
import { runSource } from "@/lib/ingestion/pipeline";
import { getOutbreakDetail, listFeed, getDashboard } from "@/lib/server/queries";

let server: Server;
let base = "";
let currentWho = "who-don.json";

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    if (path === "/who") return res.writeHead(200, { "content-type": "application/json" }).end(readFileSync(`tests/fixtures/${currentWho}`));
    if (path === "/ecdc.xml") return res.writeHead(200, { "content-type": "application/rss+xml" }).end(readFileSync("tests/fixtures/ecdc.xml"));
    if (path === "/broken") return res.writeHead(200, { "content-type": "application/json" }).end(readFileSync("tests/fixtures/broken.json"));
    res.writeHead(500).end("upstream failure");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await prisma.source.createMany({
    data: [
      { slug: "fx-who", name: "Fixture WHO DON", organization: "WHO (fixture)", kind: "OFFICIAL", adapter: "WHO_DON_API", url: `${base}/who`, enabled: true },
      { slug: "fx-ecdc", name: "Fixture ECDC RSS", organization: "ECDC (fixture)", kind: "OFFICIAL", adapter: "RSS", url: `${base}/ecdc.xml`, enabled: true },
      { slug: "fx-down", name: "Fixture failing source", organization: "Nobody", kind: "OFFICIAL", adapter: "RSS", url: `${base}/down`, enabled: true },
      { slug: "fx-broken", name: "Fixture wrong format", organization: "Nobody", kind: "OFFICIAL", adapter: "WHO_DON_API", url: `${base}/broken`, enabled: true },
    ],
  });
});

afterAll(async () => {
  server.close();
  await prisma.$disconnect();
});

const src = (slug: string) => prisma.source.findUniqueOrThrow({ where: { slug } });

describe("ingestion pipeline", () => {
  it("fetches, normalizes, persists and records the run", async () => {
    const s = await src("fx-who");
    const r = await runSource(s.id, "TEST");
    expect(r.status).toBe("PARTIAL"); // one fixture row is malformed and is logged, not invented
    expect(r.itemsNew).toBe(2);
    const run = await prisma.ingestionRun.findUniqueOrThrow({ where: { id: r.runId! } });
    expect(run.itemsFailed).toBe(1);
    expect(JSON.parse(run.errors)[0]).toMatch(/missing title/);
    const a = await prisma.sourceArticle.findFirstOrThrow({ where: { externalId: "2026-DON-FX1" }, include: { claims: true } });
    expect(a.sourceType).toBe("OFFICIAL");
    expect(a.reviewStatus).toBe("PENDING");
    expect(a.publishedAt.toISOString()).toBe("2026-10-07T09:00:00.000Z");
    expect(a.eventDate?.toISOString().slice(0, 10)).toBe("2026-10-02");
    expect(JSON.parse(a.countryCodes)).toContain("RU");
    expect(a.geoPrecision).toBe("CITY");
    const updated = await src("fx-who");
    expect(updated.lastSuccessAt).not.toBeNull();
    expect(updated.endpointStatus).toBe("WORKING");
  });

  it("associates the Irkutsk report with the existing investigation as a suggestion only", async () => {
    const ru = await prisma.outbreak.findUniqueOrThrow({ where: { slug: "russia-irkutsk-2026" } });
    const a = await prisma.sourceArticle.findFirstOrThrow({ where: { externalId: "2026-DON-FX1" } });
    expect(a.suggestedOutbreakId).toBe(ru.id);
    expect(a.outbreakId).toBeNull();
  });

  it("extracts '200 under observation' as an unverified observation claim and never inflates case counts", async () => {
    const a = await prisma.sourceArticle.findFirstOrThrow({ where: { externalId: "2026-DON-FX1" }, include: { claims: true } });
    const obs = a.claims.find((c) => c.metric === "UNDER_OBSERVATION");
    expect(obs?.value).toBe(200);
    expect(obs?.verificationStatus).toBe("UNVERIFIED");
    expect(a.claims.some((c) => c.metric === "CONFIRMED_CASES" || c.metric === "SUSPECTED_CASES")).toBe(false);
    const d = await getOutbreakDetail("russia-irkutsk-2026", null);
    if (!d || d.notYetReported) throw new Error("missing");
    expect(d.cases.confirmedCases).toBeNull();
    expect(d.cases.suspectedCases).toBeNull();
  });

  it("deduplicates repeated items across runs", async () => {
    const s = await src("fx-who");
    const before = await prisma.sourceArticle.count();
    const again = await runSource(s.id, "TEST");
    expect(again.itemsNew).toBe(0);
    expect(again.itemsDuplicate).toBe(2);
    expect(await prisma.sourceArticle.count()).toBe(before);
    currentWho = "who-don-page2.json";
    const page2 = await runSource(s.id, "TEST");
    expect(page2.itemsNew).toBe(1);
    expect(page2.itemsDuplicate).toBe(1);
    expect(await prisma.sourceArticle.count({ where: { externalId: "2026-DON-FX1" } })).toBe(1);
  });

  it("deduplicates the same story under a different URL (title hash) without losing provenance", async () => {
    const ecdc = await src("fx-ecdc");
    const r = await runSource(ecdc.id, "TEST");
    expect(r.itemsNew).toBe(1);
    // Same title republished elsewhere
    await prisma.source.update({ where: { id: ecdc.id }, data: { url: `${base}/ecdc.xml?mirror=1` } });
    const { storeItem } = await import("@/lib/ingestion/pipeline");
    const res = await storeItem(
      { externalId: null, url: "https://mirror.example.org/cdtr-41", title: "Fixture: Communicable disease threats report, week 41", text: "copy", publishedAt: new Date("2026-10-03T15:00:00Z"), language: null, raw: {} },
      { id: ecdc.id, kind: "OFFICIAL" },
      null,
      { keywords: [], candidates: [] },
    );
    expect(res).toBe("duplicate");
    const dup = await prisma.sourceArticle.findFirstOrThrow({ where: { canonicalUrl: "https://mirror.example.org/cdtr-41" } });
    expect(dup.reviewStatus).toBe("DUPLICATE");
    expect(dup.duplicateOfId).not.toBeNull();
    const feed = await listFeed(null, {}, 200);
    expect(feed.find((f) => f.id === dup.id)).toBeUndefined();
  });

  it("records upstream failures without fabricating data", async () => {
    const before = await prisma.sourceArticle.count();
    const down = await runSource((await src("fx-down")).id, "TEST");
    expect(down.status).toBe("FAILED");
    expect(down.error).toMatch(/HTTP 500/);
    const broken = await runSource((await src("fx-broken")).id, "TEST");
    expect(broken.status).toBe("FAILED");
    expect(broken.error).toMatch(/value/);
    expect(await prisma.sourceArticle.count()).toBe(before);
    const s = await src("fx-down");
    expect(s.consecutiveFailures).toBe(1);
    expect(s.endpointStatus).toBe("FAILING");
    expect(s.lastSuccessAt).toBeNull();
  });

  it("makes new official publications visible in the feed and KPIs by publication time", async () => {
    const feed = await listFeed(null, {}, 200);
    expect(feed.some((f) => f.title.startsWith("Fixture: Cholera"))).toBe(true);
    const past = await listFeed(new Date("2026-10-05T00:00:00Z"), {}, 200);
    expect(past.some((f) => f.title.startsWith("Fixture: Cholera"))).toBe(false);
    const dash = await getDashboard(null);
    expect(dash.kpis.lastSuccessfulRefresh).not.toBeNull();
  });
});

describe("historical integrity of seeded Irkutsk record", () => {
  it("does not show facts first reported later", async () => {
    const early = await getOutbreakDetail("russia-irkutsk-2026", new Date("2026-10-03T00:00:00Z"));
    if (!early || early.notYetReported) throw new Error("missing");
    expect(early.pathogenStatus).toBe("SUSPECTED");
    expect(early.cases.deaths).toBeNull(); // WHO's statement confirming the death was published 5 Oct
    expect(early.riskAssessments).toHaveLength(0);
    expect(early.chronology.every((u) => new Date(u.publishedAt) <= new Date("2026-10-03T00:00:00Z"))).toBe(true);
    const before = await getOutbreakDetail("russia-irkutsk-2026", new Date("2026-09-30T00:00:00Z"));
    expect(before?.notYetReported).toBe(true);
    const live = await getOutbreakDetail("russia-irkutsk-2026", null);
    if (!live || live.notYetReported) throw new Error("missing");
    expect(live.pathogenStatus).toBe("UNDER_INVESTIGATION");
    expect(live.classification).toBe("UNCONFIRMED_INVESTIGATION");
    expect(live.cases.deaths).toBe(1);
    expect(live.cases.deathsCauseConfirmed).toBe(false);
    expect(live.disease).toBeNull();
    expect(live.suspectedDisease?.pathogenType).toBe("BACTERIUM");
  });
});
