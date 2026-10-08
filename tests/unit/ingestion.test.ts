import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canonicalizeUrl, stripHtml, titleHash, shortSummary } from "@/lib/ingestion/normalize";
import { parseWhoDon, buildWhoDonUrl } from "@/lib/ingestion/adapters/who-don";
import { parseFeed } from "@/lib/ingestion/adapters/rss";
import { matchOutbreak, haversineKm } from "@/lib/ingestion/match";
import { extract } from "@/lib/ingestion/extract";
import { parseAsOf, windowFor, progress, atProgress } from "@/lib/domain/timeline";

describe("normalization", () => {
  it("canonicalizes URLs for dedupe", () => {
    expect(canonicalizeUrl("http://WWW.Example.org/a/b/?utm_source=x&b=2&a=1#frag")).toBe("https://example.org/a/b?a=1&b=2");
    expect(canonicalizeUrl("https://example.org/a")).toBe(canonicalizeUrl("https://www.example.org/a/"));
  });
  it("hashes titles case/punctuation-insensitively", () => {
    expect(titleHash("Cholera – Sudan!")).toBe(titleHash("cholera sudan"));
  });
  it("strips HTML and entities", () => {
    expect(stripHtml("<p>A&amp;B&nbsp;<b>C</b></p>")).toBe("A&B C");
    expect(shortSummary("x ".repeat(400)).length).toBeLessThanOrEqual(322);
  });
});

describe("WHO DON adapter", () => {
  it("builds an OData query", () => {
    const u = new URL(buildWhoDonUrl("https://www.who.int/api/news/diseaseoutbreaknews"));
    expect(u.searchParams.get("$orderby")).toBe("PublicationDate desc");
    expect(u.searchParams.get("$top")).toBe("25");
  });
  it("parses rows and reports unparseable ones without inventing data", () => {
    const { items, itemErrors } = parseWhoDon(JSON.parse(readFileSync("tests/fixtures/who-don.json", "utf8")));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ externalId: "2026-DON-FX1", url: "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON-FX1" });
    expect(items[0]!.publishedAt.toISOString()).toBe("2026-10-07T09:00:00.000Z");
    expect(itemErrors).toHaveLength(1);
  });
  it("rejects responses without a value array", () => {
    expect(() => parseWhoDon({ unexpected: true })).toThrow(/value/);
  });
});

describe("RSS adapter", () => {
  it("parses items and skips undated ones", () => {
    const { items, itemErrors } = parseFeed(readFileSync("tests/fixtures/ecdc.xml", "utf8"), "https://www.ecdc.europa.eu/feed");
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toContain("Mpox clade Ib");
    expect(itemErrors[0]).toMatch(/date/);
  });
  it("parses Atom", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>T</title><link href="https://x.org/1"/><updated>2026-10-01T00:00:00Z</updated><summary>s</summary></entry></feed>`;
    expect(parseFeed(xml, "https://x.org").items[0]).toMatchObject({ url: "https://x.org/1", title: "T" });
  });
  it("throws on non-feed XML", () => {
    expect(() => parseFeed("<html></html>", "https://x.org")).toThrow();
  });
});

describe("outbreak association", () => {
  const candidates = [
    { id: "ru", countryCode: "RU", diseaseSlug: null, suspectedDiseaseSlug: "plague", pathogenStatus: "UNDER_INVESTIGATION", classification: "UNCONFIRMED_INVESTIGATION", locations: [{ lat: 52.21, lng: 104.1 }] },
    { id: "drc", countryCode: "CD", diseaseSlug: "ebola", suspectedDiseaseSlug: null, pathogenStatus: "CONFIRMED", classification: "CONFIRMED_WIDESPREAD", locations: [{ lat: -2.9, lng: 23.6 }] },
  ];
  const D = [{ slug: "plague", keywords: ["plague"] }, { slug: "ebola", keywords: ["ebola"] }];
  it("suggests the matching investigation", () => {
    expect(matchOutbreak(extract("Pneumonia of unknown origin - Russian Federation", "Shelekhov, Irkutsk", new Date(), D), candidates)).toBe("ru");
    expect(matchOutbreak(extract("Ebola update - Democratic Republic of the Congo", "", new Date(), D), candidates)).toBe("drc");
  });
  it("does not match on country alone", () => {
    expect(matchOutbreak(extract("Measles in Russia", "", new Date(), D), candidates)).toBeNull();
  });
  it("computes distances", () => {
    expect(haversineKm(52.2869, 104.305, 52.2104, 104.0975)).toBeGreaterThan(10);
    expect(haversineKm(52.2869, 104.305, 52.2104, 104.0975)).toBeLessThan(25);
  });
});

describe("timeline", () => {
  it("parses asOf and treats future/invalid as live", () => {
    const now = new Date("2026-10-08T00:00:00Z");
    expect(parseAsOf("2026-10-03T00:00:00Z", now)?.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(parseAsOf("2027-01-01", now)).toBeNull();
    expect(parseAsOf("nonsense", now)).toBeNull();
  });
  it("maps progress both ways", () => {
    const { start, end } = windowFor("7D", new Date("2026-10-08T00:00:00Z"));
    expect(progress(atProgress(0.5, start, end), start, end)).toBeCloseTo(0.5);
  });
});
