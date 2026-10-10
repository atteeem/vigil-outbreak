// Focused tracker against the real pipeline and database: tagging Irkutsk-related publications, flagging material
// changes, never creating/linking/publishing anything, the tracker view (metrics, spread, timeline, history), and
// the non-destructive bootstrap.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { prisma } from "@/lib/db";
import { runSource } from "@/lib/ingestion/pipeline";
import { listFeed } from "@/lib/server/queries";
import { getTracker } from "@/lib/server/tracker";
import { ensureTrackedEvents } from "@/lib/tracked/store";

let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer((_req, res) => res.writeHead(200, { "content-type": "application/rss+xml" }).end(readFileSync("tests/fixtures/irkutsk-feed.xml", "utf8")));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await prisma.$disconnect();
});

const snapshot = async () => ({
  outbreaks: await prisma.outbreak.count(),
  observations: await prisma.outbreakObservation.count(),
  updates: await prisma.outbreakUpdate.count(),
  locations: await prisma.outbreakLocation.count(),
  history: await prisma.investigationStatusHistory.count(),
});
const byGuid = (guid: string) => prisma.sourceArticle.findFirstOrThrow({ where: { externalId: guid } });

describe("bootstrap", () => {
  it("the seed makes the Irkutsk investigation the primary tracked event, with its precautionary location", async () => {
    const t = await prisma.trackedEvent.findFirstOrThrow({ include: { outbreak: true } });
    expect(t.outbreak.slug).toBe("russia-irkutsk-2026");
    expect(t.primary).toBe(true);
    expect(await prisma.outbreakLocation.count({ where: { outbreakId: t.outbreakId, role: "PRECAUTIONARY_MEASURE" } })).toBe(1);
    // Seeded articles linked to the investigation are tagged as about it.
    expect(await prisma.sourceArticle.count({ where: { trackedEventId: t.id, outbreakId: t.outbreakId } })).toBeGreaterThanOrEqual(10);
    expect(await prisma.source.findUnique({ where: { slug: "rospotrebnadzor-news" } })).toMatchObject({ enabled: false, url: null });
  });

  it("is idempotent and never overwrites analyst data", async () => {
    // Other test files may have stored untagged articles directly; the first call tags them, the second is a no-op.
    await ensureTrackedEvents();
    const before = await snapshot();
    const sources = await prisma.source.count();
    expect(await ensureTrackedEvents()).toEqual([]);
    expect(await snapshot()).toEqual(before);
    expect(await prisma.source.count()).toBe(sources);
    expect(await prisma.trackedEvent.count()).toBe(1);
  });
});

describe("ingestion: identifying reports about the investigation", () => {
  it("tags, prioritises and flags — but creates, links, verifies and publishes nothing", async () => {
    const before = await snapshot();
    const tracked = await prisma.trackedEvent.findFirstOrThrow();
    const src = await prisma.source.create({ data: { slug: "trk-fixture", name: "Tracked fixture authority", organization: "fixture", kind: "OFFICIAL", adapter: "RSS", url: `${base}/feed`, enabled: true } });
    const r = await runSource(src.id, "TEST");
    expect(r.itemsNew).toBe(7);
    expect(await snapshot()).toEqual(before); // no outbreaks, figures, timeline entries, locations or status changes

    const lab = await byGuid("irk-lab-tests");
    expect(lab).toMatchObject({ trackedEventId: tracked.id, trackedLevel: "DIRECT", materialChange: true, reviewStatus: "PENDING", verificationStatus: "UNVERIFIED", outbreakId: null, suggestedOutbreakId: tracked.outbreakId });
    expect(JSON.parse(lab.trackedTopics)).toEqual(expect.arrayContaining(["LAB_RESULTS", "PATHOGEN", "CONTACTS"]));

    expect(await byGuid("shelekhov-second-case")).toMatchObject({ trackedLevel: "DIRECT", materialChange: true });
    // Russian-language report: the content classifier cannot read it, the tracked matcher can.
    expect(await byGuid("irk-quarantine-ru")).toMatchObject({ trackedLevel: "DIRECT", materialChange: false, outbreakRelevant: true });

    const kz = await byGuid("kz-traveller");
    expect(kz).toMatchObject({ trackedLevel: "DIRECT", materialChange: true, outbreakId: null });
    expect(JSON.parse(kz.trackedTopics)).toContain("SPREAD");
    expect(kz.trackedReasons).toMatch(/KZ.*needs evidence/);

    expect(await byGuid("siberia-plague")).toMatchObject({ trackedLevel: "POSSIBLE", suggestedOutbreakId: null });
    expect(await byGuid("madagascar-plague")).toMatchObject({ trackedEventId: null, trackedLevel: null });
    expect(await byGuid("irk-airport")).toMatchObject({ trackedEventId: null });

    // A second run stores nothing new (dedupe unchanged).
    expect((await runSource(src.id, "TEST")).itemsNew).toBe(0);
    await prisma.source.update({ where: { id: src.id }, data: { enabled: false } });
  });

  it("targeted feed vs secondary feed", async () => {
    const tracked = await prisma.trackedEvent.findFirstOrThrow();
    const only = (await listFeed(null, { tracked: { mode: "only", eventId: tracked.id } }, 200)).map((i) => i.title);
    const other = (await listFeed(null, { tracked: { mode: "exclude" } }, 200)).map((i) => i.title);
    expect(only).toContain("Fixture: Laboratory tests of Irkutsk contacts negative for plague");
    expect(only).not.toContain("Fixture: Plague case confirmed in Madagascar");
    expect(only).not.toContain("Fixture: Plague concerns grow across Siberia"); // POSSIBLE stays out of the main view
    expect(other).toContain("Fixture: Plague case confirmed in Madagascar");
    expect(other).not.toContain("Fixture: Laboratory tests of Irkutsk contacts negative for plague");
  });
});

describe("tracker view", () => {
  it("current state: status, sourced metrics with explicit states, spread, findings kept apart", async () => {
    const t = (await getTracker(null))!;
    expect(t.event.slug).toBe("russia-irkutsk-2026");
    expect(t.status!.classification).toBe("UNCONFIRMED_INVESTIGATION");
    expect(t.status!.pathogenStatement).toMatch(/^No pathogen has been laboratory-confirmed\. Plague \(Yersinia pestis, a bacterium, not a virus\) is under consideration but not confirmed\.$/);
    expect(t.status!.lastVerifiedUpdate?.verificationStatus).toBe("VERIFIED");

    const m = Object.fromEntries(t.metrics.map((x) => [x.key, x]));
    expect(m.CONFIRMED_CASES).toMatchObject({ state: "UNKNOWN", value: null });
    expect(m.SUSPECTED_CASES!.state).toBe("UNKNOWN");
    expect(m.DEATHS).toMatchObject({ state: "VERIFIED_OFFICIAL", value: 1, deathCauseConfirmed: false, sourceType: "OFFICIAL" });
    expect(m.DEATHS!.reportedAt).toBeTruthy();
    expect(m.UNDER_OBSERVATION).toMatchObject({ state: "UNVERIFIED", value: 189, valueHigh: 197, sourceType: "MEDIA" });
    for (const x of t.metrics.filter((x) => x.state !== "UNKNOWN")) expect(x.reportedAt && (x.source || x.attributedTo)).toBeTruthy();
    // No derived rates or projections anywhere in the payload.
    expect(JSON.stringify(t)).not.toMatch(/"(cfr|caseFatality|fatalityRate|attackRate|r0|growthRate|projection)"/i);

    expect(t.spread.state).toBe("NO_EVIDENCE");
    expect(t.locations.map((l) => l.role)).toEqual(expect.arrayContaining(["INVESTIGATION_SITE", "PRECAUTIONARY_MEASURE"]));
    expect(t.hypotheses.some((h) => h.verificationStatus === "DISPUTED" && /plague/i.test(h.text))).toBe(true);
    expect(t.labFindings.some((f) => /rhinovirus/.test(f.text))).toBe(true);
    expect(t.labFindings.some((f) => /test tube/.test(f.text))).toBe(false);
    expect(t.alternatives.some((f) => /Thailand/.test(f.text))).toBe(true);
    // Targeted intelligence includes the newly ingested official report (labelled pending), not the unrelated one.
    expect(t.intel.map((i) => i.title)).toContain("Fixture: Laboratory tests of Irkutsk contacts negative for plague");
    expect(t.intel.map((i) => i.title)).not.toContain("Fixture: Plague case confirmed in Madagascar");
    expect(t.pendingReview.material).toBeGreaterThanOrEqual(3);
    expect(t.pendingReview.possible).toBeGreaterThanOrEqual(1);
  });

  it("timeline keeps occurred and reported dates; history shows only what was known then", async () => {
    const live = (await getTracker(null))!;
    const hosp = live.timeline.find((e) => e.title === "Patient hospitalised")!;
    expect(hosp.occurredAt?.slice(0, 10)).toBe("2026-09-29");
    expect(hosp.publishedAt.slice(0, 10)).toBe("2026-10-02");
    expect(live.timeline.some((e) => e.type === "status")).toBe(true);

    const early = (await getTracker(new Date("2026-10-03T00:00:00Z")))!;
    expect(early.timeline.every((e) => e.publishedAt <= "2026-10-03T00:00:00.000Z")).toBe(true);
    const em = Object.fromEntries(early.metrics.map((x) => [x.key, x]));
    expect(em.DEATHS!.state).toBe("UNKNOWN"); // the verified WHO figure was published on 5 Oct
    expect(em.UNDER_OBSERVATION).toMatchObject({ state: "UNVERIFIED", value: 200 });
    expect(early.intel.every((i) => i.publishedAt <= "2026-10-03T00:00:00.000Z")).toBe(true);
    expect(early.locations.some((l) => l.role === "PRECAUTIONARY_MEASURE")).toBe(false); // reported 5 Oct

    expect((await getTracker(new Date("2026-09-30T00:00:00Z")))!.notYetReported).toBe(true);
  });

  it("verified case locations elsewhere change the spread assessment; unverified ones do not", async () => {
    const t = await prisma.trackedEvent.findFirstOrThrow();
    const unverified = await prisma.outbreakLocation.create({ data: { outbreakId: t.outbreakId, name: "Almaty (traveller)", countryCode: "KZ", lat: 43.24, lng: 76.95, precision: "CITY", role: "SUSPECTED_CASE", verificationStatus: "UNVERIFIED", firstReportedAt: new Date("2026-10-08T13:00:00Z") } });
    let s = (await getTracker(null))!;
    expect(s.spread.state).toBe("NO_EVIDENCE");
    expect(s.spread.unverified.map((l) => l.name)).toEqual(["Almaty (traveller)"]);
    await prisma.outbreakLocation.update({ where: { id: unverified.id }, data: { verificationStatus: "VERIFIED", evidence: "test evidence", verifiedAt: new Date() } });
    s = (await getTracker(null))!;
    expect(s.spread.state).toBe("SPREAD_VERIFIED");
    expect(s.spread.headline).toMatch(/Almaty/);
    await prisma.outbreakLocation.delete({ where: { id: unverified.id } });
  });
});
