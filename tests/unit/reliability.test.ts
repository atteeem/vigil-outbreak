import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classifyFetchError, classifyHttpStatus, isLiveUrl, isPolicyDenial } from "@/lib/ingestion/errors";
import { computeLiveStatus, type SourceHealth } from "@/lib/domain/live-status";
import { parseCdcContent } from "@/lib/ingestion/adapters/cdc-content";
import { parseFeed } from "@/lib/ingestion/adapters/rss";
import { parseWhoDon, buildWhoDonUrl } from "@/lib/ingestion/adapters/who-don";

describe("failure classification", () => {
  it("recognises a sandbox/egress proxy denial as a network-policy block, not a publisher 403", () => {
    expect(isPolicyDenial(403, new Headers({ "x-deny-reason": "host_not_allowed" }), "Host not in allowlist: www.who.int.")).toBe(true);
    expect(isPolicyDenial(403, new Headers(), "Host not in allowlist: www.who.int. Add this host to your network egress settings")).toBe(true);
    expect(isPolicyDenial(403, new Headers({ server: "nginx" }), "<html>Forbidden</html>")).toBe(false);
    expect(isPolicyDenial(404, new Headers(), "not found")).toBe(false);
  });
  it("maps HTTP statuses", () => {
    expect(classifyHttpStatus(403)).toBe("HTTP_AUTH");
    expect(classifyHttpStatus(404)).toBe("HTTP_NOT_FOUND");
    expect(classifyHttpStatus(429)).toBe("HTTP_RATE_LIMITED");
    expect(classifyHttpStatus(503)).toBe("HTTP_SERVER");
    expect(classifyHttpStatus(400)).toBe("HTTP_CLIENT");
  });
  it("maps fetch() system errors", () => {
    const err = (code: string, message = "fetch failed") => Object.assign(new TypeError(message), { cause: { code } });
    expect(classifyFetchError(err("ENOTFOUND")).kind).toBe("DNS");
    expect(classifyFetchError(err("ECONNREFUSED")).kind).toBe("CONNECTION");
    expect(classifyFetchError(err("UND_ERR_CONNECT_TIMEOUT")).kind).toBe("TIMEOUT");
    expect(classifyFetchError(err("UNABLE_TO_VERIFY_LEAF_SIGNATURE")).kind).toBe("TLS");
    expect(classifyFetchError(Object.assign(new Error("x"), { name: "TimeoutError" })).kind).toBe("TIMEOUT");
    expect(classifyFetchError(Object.assign(new TypeError("fetch failed"), { cause: { message: "Proxy response (403) !== 200 when HTTP Tunneling" } })).kind).toBe("NETWORK_POLICY_BLOCKED");
  });
  it("never treats fixture/local URLs as live", () => {
    expect(isLiveUrl("http://localhost:3100/api/test-fixtures/who-don.json")).toBe(false);
    expect(isLiveUrl("http://127.0.0.1:5555/who")).toBe(false);
    expect(isLiveUrl("https://www.who.int/api/news/diseaseoutbreaknews")).toBe(true);
    expect(isLiveUrl(null)).toBe(false);
  });
});

describe("live status (what the UI may claim)", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const src = (o: Partial<SourceHealth>): SourceHealth => ({ slug: "s", name: "S", url: "https://www.who.int/api/news/diseaseoutbreaknews", enabled: true, pollIntervalMinutes: 15, lastSuccessAt: null, lastFetchAt: null, endpointStatus: "UNTESTED", lastErrorKind: null, lastError: null, ...o });
  it("is LIVE only with a recent real success", () => {
    expect(computeLiveStatus([src({ lastSuccessAt: new Date("2026-10-08T11:50:00Z"), lastFetchAt: new Date("2026-10-08T11:50:00Z") })], now).state).toBe("LIVE");
    expect(computeLiveStatus([src({ lastSuccessAt: new Date("2026-10-08T10:00:00Z"), lastFetchAt: new Date("2026-10-08T10:00:00Z") })], now).state).toBe("STALE");
  });
  it("is DOWN when every enabled source is failing, and names the cause", () => {
    const s = computeLiveStatus([src({ lastFetchAt: new Date("2026-10-08T11:59:00Z"), lastErrorKind: "NETWORK_POLICY_BLOCKED", lastError: "blocked" })], now);
    expect(s.state).toBe("DOWN");
    expect(s.label).toBe("Not live");
    expect(s.detail).toContain("Blocked by local network policy");
  });
  it("ignores fixture sources entirely", () => {
    const s = computeLiveStatus([src({ url: "http://localhost:3100/x", lastSuccessAt: new Date("2026-10-08T11:59:00Z"), lastFetchAt: new Date("2026-10-08T11:59:00Z") })], now);
    expect(s.state).toBe("NOT_CONFIGURED");
    expect(s.lastLiveSuccessAt).toBeNull();
  });
  it("is NOT_CONFIGURED with nothing enabled", () => {
    expect(computeLiveStatus([src({ enabled: false })], now).state).toBe("NOT_CONFIGURED");
  });
});

describe("CDC Content Services adapter", () => {
  it("parses documented fields, skips non-published media, exposes nextUrl", () => {
    const r = parseCdcContent(JSON.parse(readFileSync("tests/fixtures/cdc-content-p1.json", "utf8")));
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ externalId: "cdc-media-900001", url: "https://www.cdc.gov/fixture/measles-travel.html", language: "en" });
    expect(r.items[0]!.text).not.toContain("<p>");
    expect(r.items[0]!.publishedAt.toISOString()).toBe("2026-10-05T14:00:00.000Z");
    expect(r.itemErrors[0]).toMatch(/Archived/);
    expect(r.nextUrl).toBe("/cdc-content?pagenum=2");
  });
  it("fails loudly on a different schema", () => {
    expect(() => parseCdcContent({ data: [] })).toThrow(/results/);
    expect(() => parseCdcContent({ results: [{ foo: 1 }, { bar: 2 }] })).toThrow(/none had name\/url\/date in a recognised form.*first item keys: foo/);
    expect(() => parseCdcContent({ meta: { status: 400, message: ["bad"] }, results: [] })).toThrow(/400/);
  });
});

describe("ECDC (Drupal RSS) and WHO paging", () => {
  it("parses Drupal RSS with non-permalink guids and relative links", () => {
    const r = parseFeed(readFileSync("tests/fixtures/ecdc-drupal.xml", "utf8"), "https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed");
    expect(r.items).toHaveLength(2);
    expect(r.items[0]!.externalId).toBe("90001 at https://www.ecdc.europa.eu");
    expect(r.items[0]!.text).toContain("no reports of secondary cases");
    expect(r.items[1]!.url).toBe("https://www.ecdc.europa.eu/en/news-events/fixture-respiratory-update");
    expect(r.items[0]!.publishedAt.toISOString()).toBe("2026-10-06T10:15:00.000Z");
  });
  it("rejects an HTML page served at a feed URL", () => {
    expect(() => parseFeed("<!doctype html><html><body>Page moved</body></html>", "https://x.org")).toThrow(/not an RSS/);
  });
  it("builds paged OData URLs and reads nextLink", () => {
    const u = new URL(buildWhoDonUrl("https://www.who.int/api/news/diseaseoutbreaknews", 25, 50));
    expect(u.searchParams.get("$skip")).toBe("50");
    const p = parseWhoDon(JSON.parse(readFileSync("tests/fixtures/who-don-paged-1.json", "utf8")));
    expect(p.items).toHaveLength(25);
    expect(p.nextLink).toBe("/who-paged?page=2");
  });
  it("treats rows without documented fields as a schema change", () => {
    expect(() => parseWhoDon({ value: [{ Foo: 1 }] })).toThrow(/schema changed/);
  });
});
