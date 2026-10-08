import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseFeedLinks } from "@/lib/ingestion/discover";
import { nextAttemptAfter } from "@/lib/ingestion/pipeline";
import { ingestionMode } from "@/lib/ingestion/mode";
import { computeLiveStatus, type SourceHealth } from "@/lib/domain/live-status";
// @ts-expect-error — plain ESM helper without type declarations
import { toPostgres } from "../../scripts/pg-schema.mjs";

describe("feed discovery from an official index page", () => {
  it("finds same-site feed links, resolves relative URLs, dedupes and ignores other links", () => {
    const feeds = parseFeedLinks(readFileSync("tests/fixtures/ecdc-rss-index.html", "utf8"), "https://www.ecdc.europa.eu/en/rss-feeds");
    expect(feeds.map((f) => f.url)).toEqual([
      "https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed",
      "https://www.ecdc.europa.eu/en/taxonomy/term/1313/feed",
      "https://www.ecdc.europa.eu/en/taxonomy/term/1505/feed",
      "https://www.ecdc.europa.eu/en/taxonomy/term/1310/feed",
    ]);
    expect(feeds[2]!.label).toBe("Communicable disease threats report");
  });
});

describe("retry schedule", () => {
  const now = new Date("2026-10-08T00:00:00Z");
  it("polls at the interval after success and backs off exponentially after failures (capped)", () => {
    const m = (d: Date) => (d.getTime() - now.getTime()) / 60_000;
    expect(m(nextAttemptAfter(now, 15, 0, 0.5))).toBeCloseTo(15);
    expect(m(nextAttemptAfter(now, 15, 1, 0.5))).toBeCloseTo(30);
    expect(m(nextAttemptAfter(now, 15, 3, 0.5))).toBeCloseTo(120);
    expect(m(nextAttemptAfter(now, 15, 10, 0.5))).toBeCloseTo(240); // ×16 cap
    expect(m(nextAttemptAfter(now, 60, 10, 0.5))).toBeCloseTo(360); // 6 h cap
    expect(m(nextAttemptAfter(now, 15, 0, 0))).toBeCloseTo(13.5); // jitter −10%
  });
});

describe("ingestion mode", () => {
  it("runs in the web process only in development unless configured", () => {
    expect(ingestionMode({ NODE_ENV: "development" })).toBe("inline");
    expect(ingestionMode({ NODE_ENV: "production" })).toBe("worker");
    expect(ingestionMode({ NODE_ENV: "production", INGESTION_MODE: "inline" })).toBe("inline");
    expect(ingestionMode({ NODE_ENV: "development", DISABLE_INGESTION_SCHEDULER: "1" })).toBe("off");
    expect(ingestionMode({ INGESTION_MODE: "OFF" })).toBe("off");
  });
});

describe("live status requires a running ingestion process", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const src: SourceHealth = { slug: "w", name: "WHO", url: "https://www.who.int/api/news/diseaseoutbreaknews", enabled: true, pollIntervalMinutes: 15, lastSuccessAt: new Date("2026-10-08T11:55:00Z"), lastFetchAt: new Date("2026-10-08T11:55:00Z"), endpointStatus: "WORKING", lastErrorKind: null, lastError: null };
  it("is LIVE with a recent success and a recent heartbeat", () => {
    const s = computeLiveStatus([src], now, { mode: "worker", lastTickAt: new Date("2026-10-08T11:59:00Z"), lastTickStatus: "ok" });
    expect(s.state).toBe("LIVE");
    expect(s.worker?.healthy).toBe(true);
  });
  it("is not LIVE when the worker stopped, even after a recent success", () => {
    const s = computeLiveStatus([src], now, { mode: "worker", lastTickAt: new Date("2026-10-08T10:00:00Z"), lastTickStatus: "ok" });
    expect(s.state).toBe("STALE");
    expect(s.detail).toContain("has not run since");
  });
  it("is not LIVE when no ingestion process ever ran", () => {
    expect(computeLiveStatus([src], now, null).state).toBe("STALE");
  });
});

describe("PostgreSQL schema generation", () => {
  it("only swaps the provider and marks the file as generated", () => {
    const out = toPostgres('datasource db {\n  provider = "sqlite"\n}\nmodel A { id String @id }');
    expect(out).toContain('provider = "postgresql"');
    expect(out).toContain("model A { id String @id }");
    expect(out).toMatch(/GENERATED/);
    expect(() => toPostgres('provider = "mysql"')).toThrow();
  });
  it("committed PostgreSQL schema is in sync with the canonical schema", () => {
    expect(readFileSync("prisma/postgres/schema.prisma", "utf8")).toBe(toPostgres(readFileSync("prisma/schema.prisma", "utf8")));
  });
});
