// Focused-tracker rules: which articles are about the Irkutsk investigation, timeline categories, spread and the
// evidence rule for locations. Pure functions — no database.
import { describe, expect, it } from "vitest";
import { matchTracked, hasTerm, normalize } from "@/lib/tracked/relevance";
import { assessSpread, categoryFor, isCaseRole, locationVerdict } from "@/lib/tracked/timeline";
import { IRKUTSK_TRACKED } from "@/lib/tracked/defaults";

const terms = { ...IRKUTSK_TRACKED };
const origin = { countryCode: "RU", admin1: "Irkutsk Oblast" };

describe("relevance to the tracked investigation", () => {
  it("DIRECT: names the event's places plus event-specific context", () => {
    const m = matchTracked({ title: "Russian lab worker dies of suspected plague in Siberia", summary: "A technician at the Irkutsk Anti-Plague Research Institute died of pneumonia in Shelekhov." }, terms)!;
    expect(m.level).toBe("DIRECT");
    expect(m.topics).toEqual(expect.arrayContaining(["PATHOGEN", "DEATH"]));
    expect(m.reasons.join(" ")).toMatch(/irkutsk/);
    expect(m.material).toBe(true);
  });

  it("matches Russian-language reports (Cyrillic, ё/е-insensitive)", () => {
    const m = matchTracked({ title: "В Иркутске продлили карантин для контактных лиц", summary: "Сообщил Роспотребнадзор." }, terms)!;
    expect(m.level).toBe("DIRECT");
    expect(m.topics).toEqual(expect.arrayContaining(["CONTACTS", "MEASURES"]));
    expect(normalize("Ёлка")).toBe("елка");
  });

  it("a place name alone is not enough (Irkutsk weather/transport news is unrelated)", () => {
    expect(matchTracked({ title: "Irkutsk airport reopens after heavy snowfall", summary: "Flights resumed." }, terms)).toBeNull();
  });

  it("plague elsewhere is not this investigation", () => {
    expect(matchTracked({ title: "Plague case confirmed in Madagascar", summary: "Bubonic plague in the central highlands." }, terms)).toBeNull();
    expect(matchTracked({ title: "Mongolia closes border region after marmot plague death", summary: "Yersinia pestis confirmed." }, terms)).toBeNull();
  });

  it("wider-area names with plague-specific terms are only POSSIBLE (review), never DIRECT", () => {
    const m = matchTracked({ title: "Plague concerns grow across Siberia", summary: "Preparedness discussed." }, terms)!;
    expect(m.level).toBe("POSSIBLE");
    expect(m.material).toBe(false);
  });

  it("countries merely mentioned are never spread; a reported event location elsewhere is flagged for review only", () => {
    const mentionOnly = matchTracked({ title: "US monitoring Irkutsk plague case", summary: "Officials in Washington said the incident is not cause for alarm.", countryCodes: ["RU"] }, terms)!;
    expect(mentionOnly.possibleSpreadCountries).toEqual([]);
    expect(mentionOnly.topics).not.toContain("SPREAD");
    const elsewhere = matchTracked({ title: "Kazakhstan investigates suspected case in traveller from Irkutsk", summary: "Traveller developed pneumonia.", countryCodes: ["KZ"] }, terms)!;
    expect(elsewhere.level).toBe("DIRECT");
    expect(elsewhere.possibleSpreadCountries).toEqual(["KZ"]);
    expect(elsewhere.topics).toContain("SPREAD");
    expect(elsewhere.material).toBe(true);
    expect(elsewhere.reasons.join(" ")).toMatch(/needs evidence/);
  });

  it("measures-only updates are relevant but not a material change", () => {
    const m = matchTracked({ title: "Shelekhov hospital extends quarantine", summary: "Mask mandate remains in place in Irkutsk." }, terms)!;
    expect(m.level).toBe("DIRECT");
    expect(m.material).toBe(false);
  });

  it("matches at word starts only", () => {
    expect(hasTerm(normalize("the irkutsk region"), "irkutsk")).toBe(true);
    expect(hasTerm(normalize("quarantined contacts"), "quarantin")).toBe(true);
    expect(hasTerm(normalize("epidemiology"), "demiolog")).toBe(false);
  });
});

describe("timeline categories", () => {
  it("derives categories mainly from the title", () => {
    expect(categoryFor({ kind: "DEVELOPMENT", title: "Death in Shelekhov; nearly 200 placed under observation", body: "" })).toBe("DEATH");
    expect(categoryFor({ kind: "DEVELOPMENT", title: "Contact testing: 2 COVID-19, 2 rhinovirus, no plague", body: "" })).toBe("TESTING");
    expect(categoryFor({ kind: "MEDIA_REPORT", title: "Alleged laboratory accident (broken test tube)", body: "tests" })).toBe("EVIDENCE");
    expect(categoryFor({ kind: "OFFICIAL_STATEMENT", title: "WHO: no confirmed cause", body: "testing was reportedly underway" })).toBe("STATEMENT");
    expect(categoryFor({ kind: "OFFICIAL_STATEMENT", title: "Regional statements referencing plague later softened or deleted", body: "" })).toBe("CORRECTION");
    expect(categoryFor({ kind: "MEASURE", title: "Hospital closed to admissions", body: "" })).toBe("QUARANTINE");
    expect(categoryFor({ kind: "DEVELOPMENT", title: "Patient hospitalised", body: "" })).toBe("SYMPTOMS");
  });
  it("an analyst's category wins", () => {
    expect(categoryFor({ kind: "DEVELOPMENT", title: "Patient hospitalised", body: "", category: "EVIDENCE" })).toBe("EVIDENCE");
  });
});

describe("spread assessment", () => {
  const loc = (name: string, countryCode: string, admin1: string | null, role: string, verificationStatus = "VERIFIED") => ({ name, countryCode, admin1, role, verificationStatus });
  it("investigation sites and precautionary measures are not evidence of spread", () => {
    const s = assessSpread([loc("Shelekhov", "RU", "Irkutsk Oblast", "INVESTIGATION_SITE"), loc("Moscow quarantine", "RU", "Moscow", "PRECAUTIONARY_MEASURE")], origin, "Irkutsk Oblast");
    expect(s.state).toBe("NO_EVIDENCE");
    expect(s.headline).toBe("No verified evidence of spread beyond Irkutsk Oblast.");
    expect(isCaseRole("PRECAUTIONARY_MEASURE")).toBe(false);
  });
  it("unverified case locations are listed but never counted", () => {
    const s = assessSpread([loc("Almaty", "KZ", null, "SUSPECTED_CASE", "UNVERIFIED")], origin, "Irkutsk Oblast");
    expect(s.state).toBe("NO_EVIDENCE");
    expect(s.unverified.map((l) => l.name)).toEqual(["Almaty"]);
  });
  it("verified cases inside the origin region vs outside it", () => {
    expect(assessSpread([loc("Irkutsk", "RU", "Irkutsk Oblast", "SUSPECTED_CASE")], origin, "Irkutsk Oblast").state).toBe("WITHIN_ORIGIN");
    const s = assessSpread([loc("Moscow", "RU", "Moscow", "CONFIRMED_CASE")], origin, "Irkutsk Oblast");
    expect(s.state).toBe("SPREAD_VERIFIED");
    expect(s.headline).toMatch(/Moscow/);
  });
});

describe("location evidence rule", () => {
  it("case locations outside the origin start unverified and need evidence to be verified", () => {
    expect(locationVerdict({ role: "SUSPECTED_CASE", countryCode: "KZ" }, origin)).toEqual({ ok: true, verificationStatus: "UNVERIFIED" });
    expect(locationVerdict({ role: "SUSPECTED_CASE", countryCode: "KZ", verificationStatus: "VERIFIED" }, origin).ok).toBe(false);
    expect(locationVerdict({ role: "SUSPECTED_CASE", countryCode: "KZ", verificationStatus: "VERIFIED", evidence: "Kazakh MoH statement, 8 Oct" }, origin)).toEqual({ ok: true, verificationStatus: "VERIFIED" });
  });
  it("sites, precautionary measures and in-origin locations are verified by default (analyst-entered)", () => {
    expect(locationVerdict({ role: "PRECAUTIONARY_MEASURE", countryCode: "MN" }, origin)).toEqual({ ok: true, verificationStatus: "VERIFIED" });
    expect(locationVerdict({ role: "SUSPECTED_CASE", countryCode: "RU", admin1: "Irkutsk Oblast" }, origin)).toEqual({ ok: true, verificationStatus: "VERIFIED" });
  });
});

describe("historical views show only verdicts known at the time", () => {
  it("hides a dispute (and its note) before it was reached, and undated verdicts in the past", async () => {
    const { claimVerdictAt } = await import("@/lib/domain/stats");
    const at = new Date("2026-10-05T12:00:00Z");
    expect(claimVerdictAt("DISPUTED", at, null)).toEqual({ status: "DISPUTED", showConflict: true });
    expect(claimVerdictAt("DISPUTED", at, new Date("2026-10-03T00:00:00Z"))).toEqual({ status: "UNVERIFIED", showConflict: false });
    expect(claimVerdictAt("DISPUTED", at, new Date("2026-10-06T00:00:00Z"))).toEqual({ status: "DISPUTED", showConflict: true });
    expect(claimVerdictAt("DISPUTED", null, new Date("2026-10-06T00:00:00Z"))).toEqual({ status: "UNVERIFIED", showConflict: false });
  });
});
