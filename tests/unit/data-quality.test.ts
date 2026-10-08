// Regression tests for the data-quality issues found in the first real-network verification run (2026-10).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseFeedLinks, looksLikeFeedUrl } from "@/lib/ingestion/discover";
import { extract, findDiseases, locateEvent } from "@/lib/ingestion/extract";
import { classifyContent, type ClassifyInput } from "@/lib/ingestion/classify";
import { parseWhoDon } from "@/lib/ingestion/adapters/who-don";
import { parseFeed } from "@/lib/ingestion/adapters/rss";
import { parseCdcContent, parseCdcDate, describeShape } from "@/lib/ingestion/adapters/cdc-content";
import { parseJson } from "@/lib/ingestion/http";
import { findCountries } from "@/lib/geo/countries";
import { DISEASES } from "../../prisma/reference/diseases";

const KW = DISEASES.map((d) => ({ slug: d.slug, keywords: d.keywords }));
const fx = (p: string) => readFileSync(`tests/fixtures/${p}`, "utf8");

describe("1. ECDC feed discovery", () => {
  const feeds = parseFeedLinks(fx("ecdc-rss-index.html"), "https://www.ecdc.europa.eu/en/rss-feeds");
  it("does not treat the 'Skip to main content' link or the index page itself as a feed", () => {
    expect(feeds.some((f) => /skip to main content/i.test(f.label))).toBe(false);
    expect(feeds.some((f) => f.url.startsWith("https://www.ecdc.europa.eu/en/rss-feeds"))).toBe(false);
    expect(feeds).toHaveLength(4);
  });
  it("only accepts URLs that denote feed documents", () => {
    const u = (s: string) => looksLikeFeedUrl(new URL(s));
    expect(u("https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed")).toBe(true);
    expect(u("https://example.org/news.rss")).toBe(true);
    expect(u("https://example.org/x?format=rss")).toBe(true);
    expect(u("https://www.ecdc.europa.eu/en/rss-feeds")).toBe(false);
    expect(u("https://www.ecdc.europa.eu/en/rss-feeds#main-content")).toBe(false);
    expect(u("https://example.org/feedback")).toBe(false);
  });
});

describe("3. Disease recognition", () => {
  it.each([
    ["Surveillance of West Nile virus infections in humans and animals in Europe, weekly update", "west-nile"],
    ["Epidemiological update: West-Nile fever in Italy", "west-nile"],
    ["WNV: first human case of the season", "west-nile"],
    ["West Nile neuroinvasive disease cluster", "west-nile"],
    ["Annual Epidemiological Report for 2024: Legionnaires’ disease", "legionnaires"],
    ["Tick-borne encephalitis in Austria", "tick-borne-encephalitis"],
    ["Crimean–Congo haemorrhagic fever in Spain", "cchf"],
    ["Avian influenza A(H5N1) in Cambodia", "avian-influenza"],
    ["Nipah virus infection – Bangladesh", "nipah"],
  ])("%s → %s", (title, slug) => {
    expect(findDiseases(title, KW)).toContain(slug);
  });
  it("a specific influenza does not also count as seasonal influenza", () => {
    expect(findDiseases("Avian influenza A(H5N1) – Cambodia", KW)).toEqual(["avian-influenza"]);
    expect(findDiseases("Seasonal influenza – weekly overview", KW)).toEqual(["influenza"]);
  });
  it("does not over-match inside words", () => {
    expect(findDiseases("Summers in Europe; flu-like symptoms; plagued by delays", KW)).not.toContain("mers");
    expect(findDiseases("plagued by delays", KW)).not.toContain("plague");
  });
  it("uses title diseases and ignores diseases mentioned only in background text", () => {
    const x = extract("Nipah virus infection – Bangladesh", "Unlike COVID-19 and influenza, Nipah virus is transmitted by fruit bats.", new Date("2026-10-03"), KW);
    expect(x.diseaseSlugs).toEqual(["nipah"]);
  });
});

describe("4. Event location vs countries merely mentioned", () => {
  const who = parseWhoDon(JSON.parse(fx("real-verification/who-don-nipah.json")));
  const nipah = who.items[0]!;
  it("Nipah virus infection – Bangladesh is located in BD only; background countries are 'mentioned'", () => {
    const x = extract(nipah.title, nipah.text, nipah.publishedAt, KW, { lead: nipah.lead });
    expect(x.countryCodes).toEqual(["BD"]);
    expect(x.locationScope).toBe("TITLE");
    expect(x.geoPrecision).toBe("COUNTRY");
    expect(new Set(x.mentionedCountryCodes)).toEqual(new Set(["IN", "MY", "PH", "SG", "MM"]));
  });
  it("background cities do not set the location (Kerala/Kolkata in history text)", () => {
    const x = extract("Nipah virus infection – Bangladesh", "Cases were reported in Kolkata, India in 2001.", new Date(), KW, { lead: "Bangladesh reported 7 cases." });
    expect(x.geoPrecision).toBe("COUNTRY");
    expect(x.locationText).toBeNull();
  });
  it("West Nile – Greece is GR only, not the other countries in the epidemiology section", () => {
    const wnv = who.items[1]!;
    const x = extract(wnv.title, wnv.text, wnv.publishedAt, KW, { lead: wnv.lead });
    expect(x.countryCodes).toEqual(["GR"]);
    expect(x.mentionedCountryCodes).toEqual(expect.arrayContaining(["IT", "RO", "HU", "RS"]));
    expect(x.diseaseSlugs).toEqual(["west-nile"]);
  });
  it("multi-country items are not pinned to one or six countries", () => {
    const m = who.items[2]!;
    const x = extract(m.title, m.text, m.publishedAt, KW, { lead: m.lead });
    expect(x.countryCodes).toEqual([]);
    expect(x.geoPrecision).toBe("MULTI_COUNTRY");
    expect(x.mentionedCountryCodes.length).toBeGreaterThanOrEqual(6);
  });
  it("falls back to the lead sentence when the title has no country", () => {
    expect(locateEvent("Locally acquired dengue cases", "France reported 3 locally acquired dengue cases.", "France ... Spain ... Italy").primary).toEqual(["FR"]);
  });
  it("a longer country name is not double-counted via a shorter alias later in the text", () => {
    expect(findCountries("Democratic Republic of the Congo reports cases. Earlier, the Congo basin …")).toEqual(["CD"]);
    expect(findCountries("South Sudan: cases rise. In South Sudan, …")).toEqual(["SS"]);
    expect(findCountries("Guinea worm disease eradication; Niger Delta; Lake Chad region")).toEqual([]);
    expect(findCountries("Mpox – Congo")).toEqual(["CG"]);
  });
});

describe("5. Content classification", () => {
  const feed = parseFeed(fx("real-verification/ecdc-mixed-feed.xml"), "https://www.ecdc.europa.eu/en/taxonomy/term/1/feed");
  const cls = (title: string) => {
    const it = feed.items.find((i) => i.title.startsWith(title))!;
    const x = extract(it.title, it.text, it.publishedAt, KW, { lead: it.lead });
    const input: ClassifyInput = { title: it.title, url: it.url, lead: it.lead ?? "", adapter: "RSS", hints: it.hints, diseaseSlugs: x.diseaseSlugs, countryCodes: x.countryCodes, unknownCause: x.unknownCause };
    return classifyContent(input);
  };
  it.each([
    // ECDC's seasonal weekly update reports current-season human cases → an active situation update.
    ["Surveillance of West Nile virus infections", "SITUATION_UPDATE", true],
    ["Epidemiological update: West-Nile fever in Italy", "SITUATION_UPDATE", true],
    ["Communicable disease threats report", "SITUATION_UPDATE", true],
    ["Epi Pulse podcast", "PODCAST_MEDIA", false],
    ["Guidance on the prevention of West Nile", "GUIDANCE", false],
    ["Operational tool on rapid risk assessment", "GUIDANCE", false],
    ["Annual Epidemiological Report for 2024", "SURVEILLANCE_REPORT", false],
    ["Call for tenders", "CORPORATE", false],
    ["European Antibiotic Awareness Day", "GENERAL_PUBLICATION", false],
    ["Rapid risk assessment: Locally acquired dengue", "RISK_ASSESSMENT", true],
  ])("%s → %s (outbreak-relevant: %s)", (title, type, relevant) => {
    const c = cls(title);
    expect(c.contentType).toBe(type);
    expect(c.outbreakRelevant).toBe(relevant);
  });
  it("WHO Disease Outbreak News is always an outbreak report", () => {
    expect(classifyContent({ title: "Nipah virus infection – Bangladesh", url: "https://www.who.int/x", lead: "", adapter: "WHO_DON_API", diseaseSlugs: ["nipah"], countryCodes: ["BD"], unknownCause: false })).toMatchObject({ contentType: "OUTBREAK_REPORT", outbreakRelevant: true });
  });
  it("publisher media types mark podcasts/videos even when the title looks like news", () => {
    expect(classifyContent({ title: "Measles outbreak: what parents should know", url: "https://www.cdc.gov/x", lead: "", adapter: "CDC_CONTENT_API", hints: ["Podcast"], diseaseSlugs: ["measles"], countryCodes: ["US"], unknownCause: false }).contentType).toBe("PODCAST_MEDIA");
  });
});

describe("2. CDC Content Services response variants", () => {
  const item = { id: 1, name: "Measles outbreak in Texas", description: "<p>Texas reported 20 confirmed cases.</p>", sourceUrl: "https://www.cdc.gov/measles/x.html", datePublished: "2026-10-01T12:00:00Z", status: "Published", mediaType: "Html" };
  it("accepts the documented camelCase shape", () => {
    expect(parseCdcContent({ meta: { status: 200 }, results: [item] }).items).toHaveLength(1);
  });
  it("accepts PascalCase keys, .NET /Date()/ dates, relative URLs and non-'Published' statuses", () => {
    const r = parseCdcContent({ Meta: { Status: 200 }, Results: [{ Id: 2, Name: "Hepatitis A outbreak", SourceUrl: "/hepatitis/outbreaks/x.html", DatePublished: "/Date(1790000000000)/", Status: "Live" }] });
    expect(r.items[0]).toMatchObject({ url: "https://www.cdc.gov/hepatitis/outbreaks/x.html", externalId: "cdc-media-2" });
    expect(r.items[0]!.publishedAt.getTime()).toBe(1790000000000);
  });
  it("accepts a bare array of results", () => {
    expect(parseCdcContent([item]).items).toHaveLength(1);
  });
  it("still skips archived/hidden media", () => {
    expect(parseCdcContent({ results: [{ ...item, status: "Archived" }] }).items).toHaveLength(0);
  });
  it("parses the date formats this API family emits", () => {
    expect(parseCdcDate("2026-10-01T12:00:00")?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
    expect(parseCdcDate("10/01/2026 02:30:00 PM")?.toISOString()).toBe("2026-10-01T14:30:00.000Z");
    expect(parseCdcDate("/Date(1790000000000-0400)/")?.getTime()).toBe(1790000000000);
    expect(parseCdcDate(1790000000)?.getTime()).toBe(1790000000000);
    expect(parseCdcDate("not a date")).toBeNull();
  });
  it("a mismatch reports the ACTUAL shape so the next run identifies the format", () => {
    let msg = "";
    try {
      parseCdcContent({ data: { items: [] }, total: 0 });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/top-level keys: data, total/);
    expect(describeShape({ results: [{ title: "x", publishDate: "2026" }] })).toMatch(/first item keys: title, publishDate/);
  });
  it("JSONP and BOM are tolerated; XML is identified as XML", () => {
    expect(parseJson('﻿cb({"results":[]});', 200, "x")).toEqual({ results: [] });
    expect(() => parseJson('<?xml version="1.0"?><mediaList/>', 200, "CDC")).toThrow(/returned XML instead of JSON/);
  });
});
