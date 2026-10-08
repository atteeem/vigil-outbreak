// Regression tests (real pipeline + database) for the 2026-10 verification findings: event location vs mentioned
// countries, disease recognition, content classification, feed behaviour, CDC variants and safe reprocessing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { prisma } from "@/lib/db";
import { runSource } from "@/lib/ingestion/pipeline";
import { verifyPipeline } from "@/lib/ingestion/pipeline-verify";
import { reprocessArticles } from "@/lib/ingestion/reprocess";
import { getDashboard, listFeed } from "@/lib/server/queries";
import { safeJson } from "@/lib/ingestion/pipeline";

let server: Server;
let base = "";
const hits: Record<string, number> = {};
const fx = (p: string) => readFileSync(`tests/fixtures/${p}`, "utf8");
const cdcItem = (id: number, extra: Record<string, unknown> = {}) => ({ id, name: `DQ CDC item ${id}: Hepatitis A outbreak linked to frozen berries in the United States`, description: "CDC reports 12 confirmed cases in 5 states.", sourceUrl: `https://www.cdc.gov/dq/item-${id}.html`, datePublished: "2026-10-02T15:00:00Z", status: "Published", mediaType: "Html", ...extra });

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    hits[u.pathname] = (hits[u.pathname] ?? 0) + 1;
    switch (u.pathname) {
      case "/who-nipah":
        return res.writeHead(200, { "content-type": "application/json" }).end(fx("real-verification/who-don-nipah.json"));
      case "/ecdc-mix":
        return res.writeHead(200, { "content-type": "application/rss+xml" }).end(fx("real-verification/ecdc-mixed-feed.xml"));
      case "/ecdc-mix-fresh": // same items under new URLs/GUIDs/titles, so a verification run stores them anew
        return res.writeHead(200, { "content-type": "application/rss+xml" }).end(fx("real-verification/ecdc-mixed-feed.xml").replace(/rv-/g, "rvf-").replace(/<title>(?!ECDC)/g, "<title>[v] "));
      case "/cdc-negotiates":
        // Answers XML unless the documented format=json selector is given.
        if (u.searchParams.get("format") !== "json") return res.writeHead(200, { "content-type": "application/xml" }).end('<?xml version="1.0"?><mediaResponse><results/></mediaResponse>');
        return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ meta: { status: 200 }, results: [cdcItem(1), cdcItem(2, { mediaType: "Podcast", name: "DQ CDC podcast: A Cup of Health with CDC" })] }));
      case "/cdc-pascal":
        return res.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end("﻿" + JSON.stringify({ Meta: { Status: 200 }, Results: [{ Id: 3, Name: "DQ CDC item 3: Measles cases in Texas", SourceUrl: "/dq/item-3.html", DatePublished: "/Date(1790950000000)/", Status: "Live" }] }));
      case "/cdc-unknown-shape":
        return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: { items: [{ headline: "x" }] }, total: 1 }));
      default:
        return res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  await prisma.$disconnect();
});

const mk = (slug: string, adapter: string, path: string) => prisma.source.create({ data: { slug, name: `DQ ${slug}`, organization: "fixture", kind: "OFFICIAL", adapter, url: `${base}${path}`, enabled: true } });
const counts = async () => ({ outbreaks: await prisma.outbreak.count(), observations: await prisma.outbreakObservation.count(), updates: await prisma.outbreakUpdate.count(), history: await prisma.investigationStatusHistory.count() });

describe("WHO DON: event location, mentioned countries, diseases", () => {
  it("stores Nipah – Bangladesh as BD with the other countries as mentions only", async () => {
    const s = await mk("dq-who", "WHO_DON_API", "/who-nipah");
    const r = await runSource(s.id, "TEST");
    expect(r.itemsNew).toBe(3);
    const nipah = await prisma.sourceArticle.findFirstOrThrow({ where: { externalId: "2026-DON-RV01" } });
    expect(safeJson<string[]>(nipah.countryCodes, [])).toEqual(["BD"]);
    expect(new Set(safeJson<string[]>(nipah.mentionedCountryCodes, []))).toEqual(new Set(["IN", "MY", "PH", "SG", "MM"]));
    expect(safeJson<string[]>(nipah.diseaseSlugs, [])).toEqual(["nipah"]);
    expect(nipah).toMatchObject({ contentType: "OUTBREAK_REPORT", outbreakRelevant: true, geoPrecision: "COUNTRY", classifierVersion: 1 });
    const wnv = await prisma.sourceArticle.findFirstOrThrow({ where: { externalId: "2026-DON-RV02" } });
    expect(safeJson<string[]>(wnv.diseaseSlugs, [])).toEqual(["west-nile"]);
    expect(safeJson<string[]>(wnv.countryCodes, [])).toEqual(["GR"]);
    const multi = await prisma.sourceArticle.findFirstOrThrow({ where: { externalId: "2026-DON-RV03" } });
    expect(multi.geoPrecision).toBe("MULTI_COUNTRY");
    expect(safeJson<string[]>(multi.countryCodes, [])).toEqual([]);
  });
  it("the feed shows only the event country", async () => {
    const feed = await listFeed(null, { q: "Nipah virus infection" }, 50);
    expect(feed.find((f) => f.title.startsWith("Nipah"))?.countries.map((c) => c.code)).toEqual(["BD"]);
  });
});

describe("ECDC: guidance, podcasts and general publications are not outbreaks", () => {
  it("classifies each item and only relevant ones get suggestions and claims", async () => {
    const before = await counts();
    const s = await mk("dq-ecdc", "RSS", "/ecdc-mix");
    const r = await runSource(s.id, "TEST");
    expect(r.itemsNew).toBe(10);
    const rows = await prisma.sourceArticle.findMany({ where: { sourceId: s.id }, include: { claims: true } });
    const byTitle = (t: string) => rows.find((x) => x.title.startsWith(t))!;
    for (const t of ["Epi Pulse podcast", "Guidance on the prevention", "Operational tool", "Annual Epidemiological Report", "Call for tenders", "European Antibiotic Awareness Day"]) {
      const row = byTitle(t);
      expect(row.outbreakRelevant, t).toBe(false);
      expect(row.suggestedOutbreakId, t).toBeNull();
      expect(row.claims, t).toHaveLength(0); // e.g. the AER's "11 000 cases" never becomes a case-count claim
    }
    const wnv = byTitle("Surveillance of West Nile virus");
    expect(safeJson<string[]>(wnv.diseaseSlugs, [])).toEqual(["west-nile"]);
    expect(wnv.outbreakRelevant).toBe(true);
    expect(wnv.claims.length).toBeGreaterThan(0);
    expect(wnv.claims.every((c) => c.verificationStatus === "UNVERIFIED" && c.outbreakId === null)).toBe(true);
    // 6. Ingestion never creates or changes outbreaks, case observations, updates or classifications.
    expect(await counts()).toEqual(before);
    expect(rows.every((x) => x.reviewStatus === "PENDING" && x.outbreakId === null)).toBe(true);
  });

  it("the default feed and KPIs show outbreak-related items; all types are available on request", async () => {
    const def = await listFeed(null, { q: "" }, 200);
    const all = await listFeed(null, { includeAllTypes: true }, 200);
    expect(def.some((i) => i.title.startsWith("Epi Pulse podcast"))).toBe(false);
    expect(def.some((i) => i.title.startsWith("Call for tenders"))).toBe(false);
    expect(def.some((i) => i.title.startsWith("Epidemiological update: West-Nile fever"))).toBe(true);
    const pod = all.find((i) => i.title.startsWith("Epi Pulse podcast"));
    expect(pod).toMatchObject({ contentType: "PODCAST_MEDIA", outbreakRelevant: false, unknownCause: false });
    const guidance = all.find((i) => i.title.startsWith("Guidance on the prevention"));
    expect(guidance?.diseases.map((d) => d.slug)).toEqual(["west-nile"]);
    const dash = await getDashboard(null);
    expect(dash.feed.some((i) => !i.outbreakRelevant)).toBe(false);
  });

  it("full-pipeline verification passes and reports the content-type mix", async () => {
    const v = await verifyPipeline({ slug: "dq-ecdc-verify", adapter: "RSS", url: `${base}/ecdc-mix-fresh` }, { now: new Date("2026-10-08T00:00:00Z") });
    expect(v.verdict).toBe("PIPELINE_VERIFIED");
    expect(v.stored).toBe(10);
    expect(v.contentTypes).toMatchObject({ PODCAST_MEDIA: 1, GUIDANCE: 2, CORPORATE: 1, GENERAL_PUBLICATION: 1, RISK_ASSESSMENT: 1 });
    expect(v.stages.find((s) => s.name === "classification")?.detail).toMatch(/4 of 10 records outbreak-relevant/);
  });
});

describe("CDC Content Services variants (SCHEMA_MISMATCH investigation)", () => {
  it("retries with format=json when the API answers XML, and classifies podcasts by mediaType", async () => {
    const s = await mk("dq-cdc-xml", "CDC_CONTENT_API", "/cdc-negotiates?q=outbreak");
    const r = await runSource(s.id, "TEST");
    expect(r.status).toBe("SUCCESS");
    expect(hits["/cdc-negotiates"]).toBe(2);
    const pod = await prisma.sourceArticle.findFirstOrThrow({ where: { externalId: "cdc-media-2", sourceId: s.id } });
    expect(pod).toMatchObject({ contentType: "PODCAST_MEDIA", outbreakRelevant: false });
    const hep = await prisma.sourceArticle.findFirstOrThrow({ where: { externalId: "cdc-media-1", sourceId: s.id } });
    expect(safeJson<string[]>(hep.diseaseSlugs, [])).toEqual(["hepatitis-a"]);
    expect(safeJson<string[]>(hep.countryCodes, [])).toEqual(["US"]);
  });
  it("accepts PascalCase + BOM + /Date()/ + relative URLs", async () => {
    const s = await mk("dq-cdc-pascal", "CDC_CONTENT_API", "/cdc-pascal");
    const r = await runSource(s.id, "TEST");
    expect(r.itemsNew).toBe(1);
    const a = await prisma.sourceArticle.findFirstOrThrow({ where: { sourceId: s.id } });
    expect(a.url).toBe("https://www.cdc.gov/dq/item-3.html");
  });
  it("an unknown shape fails as SCHEMA_MISMATCH with the actual keys in the error and the verifier's responseSample", async () => {
    const s = await mk("dq-cdc-unknown", "CDC_CONTENT_API", "/cdc-unknown-shape");
    const r = await runSource(s.id, "TEST");
    expect(r.failureKind).toBe("SCHEMA_MISMATCH");
    expect(r.error).toMatch(/top-level keys: data, total/);
    const v = await verifyPipeline({ slug: "dq-cdc-unknown-v", adapter: "CDC_CONTENT_API", url: `${base}/cdc-unknown-shape` });
    expect(v.endpoint.responseSample).toMatch(/top-level keys: data, total/);
  });
});

describe("reprocessing existing records with the new rules", () => {
  it("fixes derived fields of legacy rows and preserves review, verification, analyst links and claims", async () => {
    const src = await prisma.source.findUniqueOrThrow({ where: { slug: "dq-who" } });
    const ru = await prisma.outbreak.findUniqueOrThrow({ where: { slug: "russia-irkutsk-2026" } });
    const nipahRaw = JSON.parse(fx("real-verification/who-don-nipah.json")).value[0];
    const legacy = await prisma.sourceArticle.create({
      data: {
        sourceId: src.id, url: "https://www.who.int/emergencies/disease-outbreak-news/item/legacy-nipah", canonicalUrl: "https://who.int/emergencies/disease-outbreak-news/item/legacy-nipah", externalId: "LEGACY-NIPAH", title: "Nipah virus infection – Bangladesh", titleHash: "legacy-hash", publishedAt: new Date("2026-10-03T10:00:00Z"),
        countryCodes: JSON.stringify(["BD", "IN", "MY", "PH", "SG", "MM"]), diseaseSlugs: "[]", sourceType: "OFFICIAL", origin: "INGESTED", classifierVersion: 0,
        reviewStatus: "ACCEPTED", verificationStatus: "VERIFIED", outbreakId: ru.id, raw: JSON.stringify(nipahRaw),
        claims: { create: [{ claimType: "CASE_COUNT", text: "7 confirmed cases", metric: "CONFIRMED_CASES", value: 7, sourceType: "OFFICIAL", extractedBy: "AUTO", publishedAt: new Date("2026-10-03T10:00:00Z") }] },
      },
    });
    const seededBefore = await prisma.sourceArticle.findMany({ where: { origin: "SEED" }, orderBy: { id: "asc" } });

    const dry = await reprocessArticles({ apply: false });
    expect(dry.changed).toBeGreaterThanOrEqual(1);
    expect((await prisma.sourceArticle.findUniqueOrThrow({ where: { id: legacy.id } })).countryCodes).toBe(JSON.stringify(["BD", "IN", "MY", "PH", "SG", "MM"]));

    await reprocessArticles({ apply: true });
    const after = await prisma.sourceArticle.findUniqueOrThrow({ where: { id: legacy.id }, include: { claims: true } });
    expect(safeJson<string[]>(after.countryCodes, [])).toEqual(["BD"]);
    expect(safeJson<string[]>(after.mentionedCountryCodes, []).length).toBe(5);
    expect(safeJson<string[]>(after.diseaseSlugs, [])).toEqual(["nipah"]);
    expect(after).toMatchObject({ classifierVersion: 1, contentType: "OUTBREAK_REPORT", reviewStatus: "ACCEPTED", verificationStatus: "VERIFIED", outbreakId: ru.id });
    expect(after.claims).toHaveLength(1);
    // Seeded/manual articles are never touched.
    expect(await prisma.sourceArticle.findMany({ where: { origin: "SEED" }, orderBy: { id: "asc" } })).toEqual(seededBefore);
    expect(await prisma.adminAuditLog.count({ where: { action: "articles.reprocess" } })).toBeGreaterThanOrEqual(1);
  });
});
