import { describe, expect, it } from "vitest";
import { extract, extractCounts, extractEventDate, findDiseases } from "@/lib/ingestion/extract";
import { findCountries } from "@/lib/geo/countries";

const DISEASES = [
  { slug: "plague", keywords: ["plague", "yersinia pestis"] },
  { slug: "cholera", keywords: ["cholera"] },
  { slug: "avian-influenza", keywords: ["avian influenza", "h5n1"] },
];

describe("count extraction", () => {
  it("classifies '200 people under observation' as observation, not infection", () => {
    const c = extractCounts("Nearly 200 people were placed under observation after the death.");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ metric: "UNDER_OBSERVATION", value: 200, approximate: true });
  });

  it("does not double-count an observation span as cases", () => {
    const c = extractCounts("197 contacts placed under observation; 189 cases under observation in hospital");
    expect(c.every((x) => x.metric === "UNDER_OBSERVATION")).toBe(true);
  });

  it("extracts qualified case categories and deaths separately", () => {
    const c = extractCounts("Sudan reported 1,234 suspected cases of cholera and 12 confirmed cases, including 3 deaths.");
    expect(c).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: "SUSPECTED_CASES", value: 1234 }),
      expect.objectContaining({ metric: "CONFIRMED_CASES", value: 12 }),
      expect.objectContaining({ metric: "DEATHS", value: 3 }),
    ]));
    expect(c).toHaveLength(3);
  });

  it("keeps unqualified 'cases' unclassified", () => {
    const c = extractCounts("Officials reported 40 new cases this week.");
    expect(c[0]).toMatchObject({ metric: null, value: 40 });
  });

  it("reads number words and negative tests", () => {
    expect(extractCounts("two deaths were reported")[0]).toMatchObject({ metric: "DEATHS", value: 2 });
    expect(extractCounts("150 contacts have tested negative")[0]).toMatchObject({ metric: "CONTACTS_TESTED_NEGATIVE", value: 150 });
  });

  it("ignores negations and years", () => {
    expect(extractCounts("No confirmed cases of plague have been reported.")).toHaveLength(0);
    expect(extractCounts("the 2026 cases review")).toHaveLength(0);
  });
});

describe("entity extraction", () => {
  it("finds diseases and countries", () => {
    expect(findDiseases("Suspected pneumonic plague (Yersinia pestis) in Russia", DISEASES)).toEqual(["plague"]);
    expect(findCountries("Russian authorities in the Russian Federation")).toEqual(["RU"]);
    expect(findCountries("Outbreak in the Democratic Republic of the Congo and Papua New Guinea")).toEqual(["CD", "PG"]);
    expect(findCountries("Papua New Guinea")).not.toContain("GN");
  });

  it("resolves city-level location and unknown-cause flag", () => {
    const x = extract("Pneumonia of unknown origin", "A worker died in Shelekhov, Irkutsk Oblast.", new Date("2026-10-07"), DISEASES);
    expect(x.geoPrecision).toBe("CITY");
    expect(x.countryCodes).toContain("RU");
    expect(x.unknownCause).toBe(true);
    expect(x.lat).toBeCloseTo(52.21, 1);
  });

  it("extracts the earliest stated date not after publication", () => {
    const d = extractEventDate("On 25 September 2026 a tube broke; by October 2, 2026 she had died; review on 1 December 2026", new Date("2026-10-07"));
    expect(d?.toISOString().slice(0, 10)).toBe("2026-09-25");
  });
});
