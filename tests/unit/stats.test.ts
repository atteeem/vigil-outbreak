import { describe, expect, it } from "vitest";
import { headlineFor, latest, seriesFor, summarizeCases, verificationAt, formatCount, type ObservationLike } from "@/lib/domain/stats";

let n = 0;
const obs = (o: Partial<ObservationLike>): ObservationLike => ({
  id: `o${n++}`, metric: "CONFIRMED_CASES", value: 10, isCumulative: true, asOfDate: new Date("2026-09-01"), reportedAt: new Date("2026-09-02"), sourceType: "OFFICIAL", verificationStatus: "VERIFIED", ...o,
});

describe("case statistics integrity", () => {
  it("never promotes media or unverified figures into the confirmed headline", () => {
    const rows = [
      obs({ value: 5 }),
      obs({ value: 900, sourceType: "MEDIA", verificationStatus: "UNVERIFIED", asOfDate: new Date("2026-09-10"), reportedAt: new Date("2026-09-10") }),
      obs({ value: 700, sourceType: "OFFICIAL", verificationStatus: "UNVERIFIED", asOfDate: new Date("2026-09-11"), reportedAt: new Date("2026-09-11") }),
    ];
    const s = summarizeCases(rows, null);
    expect(s.confirmedCases).toBe(5);
    expect(s.reportedUnverified.CONFIRMED_CASES?.value).toBe(700);
  });

  it("does not turn people under observation into infections", () => {
    const rows = [obs({ metric: "UNDER_OBSERVATION", value: 200, sourceType: "MEDIA", verificationStatus: "UNVERIFIED" })];
    const s = summarizeCases(rows, null);
    expect(s.confirmedCases).toBeNull();
    expect(s.suspectedCases).toBeNull();
    expect(s.underObservation).toBeNull();
    expect(s.reportedUnverified.UNDER_OBSERVATION?.value).toBe(200);
  });

  it("keeps unknown as null, never 0", () => {
    const s = summarizeCases([], null);
    expect(s.confirmedCases).toBeNull();
    expect(s.deaths).toBeNull();
    expect(formatCount(null)).toBe("Not reported");
    expect(formatCount(0)).toBe("0");
  });

  it("does not sum overlapping sources or cumulative periods", () => {
    const rows = [
      obs({ value: 6757, asOfDate: new Date("2026-09-07"), reportedAt: new Date("2026-09-10") }),
      obs({ value: 7773, asOfDate: new Date("2026-09-21"), reportedAt: new Date("2026-09-24") }),
      obs({ value: 7000, asOfDate: new Date("2026-09-15"), reportedAt: new Date("2026-09-16") }),
    ];
    expect(summarizeCases(rows, null).confirmedCases).toBe(7773);
    expect(headlineFor(rows, "CONFIRMED_CASES", null).confirmed?.value).toBe(7773);
  });

  it("ignores period (non-cumulative) counts for the headline", () => {
    const rows = [obs({ value: 40, isCumulative: false })];
    expect(summarizeCases(rows, null).confirmedCases).toBeNull();
  });

  it("historical views only see what was published by asOf", () => {
    const rows = [
      obs({ value: 6757, asOfDate: new Date("2026-09-07"), reportedAt: new Date("2026-09-10") }),
      obs({ value: 7773, asOfDate: new Date("2026-09-21"), reportedAt: new Date("2026-09-24") }),
    ];
    expect(summarizeCases(rows, new Date("2026-09-15")).confirmedCases).toBe(6757);
    expect(summarizeCases(rows, new Date("2026-09-01")).confirmedCases).toBeNull();
  });

  it("hides verification verdicts reached after asOf", () => {
    expect(verificationAt("VERIFIED", new Date("2026-10-06"), new Date("2026-10-03"))).toBe("UNVERIFIED");
    expect(verificationAt("VERIFIED", new Date("2026-10-06"), new Date("2026-10-07"))).toBe("VERIFIED");
    expect(verificationAt("REFUTED", new Date("2026-10-06"), null)).toBe("REFUTED");
    const rows = [obs({ value: 50, verifiedAt: new Date("2026-09-20") })];
    expect(summarizeCases(rows, new Date("2026-09-10")).confirmedCases).toBeNull();
    expect(summarizeCases(rows, new Date("2026-09-25")).confirmedCases).toBe(50);
  });

  it("excludes refuted figures entirely", () => {
    const rows = [obs({ value: 999, sourceType: "MEDIA", verificationStatus: "REFUTED" })];
    expect(summarizeCases(rows, null).reportedUnverified.CONFIRMED_CASES).toBeUndefined();
  });

  it("charts need two compatible points and never accumulate", () => {
    expect(seriesFor([obs({ value: 1 })], "CONFIRMED_CASES", null)).toHaveLength(1);
    const twice = [obs({ value: 10, reportedAt: new Date("2026-09-02") }), obs({ value: 12, reportedAt: new Date("2026-09-03") })];
    const s = seriesFor(twice, "CONFIRMED_CASES", null);
    expect(s).toHaveLength(1);
    expect(s[0]!.value).toBe(12);
  });

  it("latest prefers the most recent reference date", () => {
    const a = obs({ asOfDate: new Date("2026-01-02"), value: 1 });
    const b = obs({ asOfDate: new Date("2026-01-01"), reportedAt: new Date("2026-02-01"), value: 2 });
    expect(latest([a, b])?.value).toBe(1);
  });
});
