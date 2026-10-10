// Timeline categories and location roles for a tracked investigation. Pure helpers.

export const TIMELINE_CATEGORIES = ["DEATH", "SYMPTOMS", "TESTING", "QUARANTINE", "STATEMENT", "CORRECTION", "EVIDENCE", "CASES", "SPREAD", "STATUS"] as const;
export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number];
export const TIMELINE_CATEGORY_LABEL: Record<TimelineCategory, string> = {
  DEATH: "Death",
  SYMPTOMS: "Symptoms / illness",
  TESTING: "Testing",
  QUARANTINE: "Quarantine / observation",
  STATEMENT: "Official statement",
  CORRECTION: "Correction / denial",
  EVIDENCE: "New evidence / report",
  CASES: "Cases",
  SPREAD: "Geographic spread",
  STATUS: "Status change",
};

const has = (text: string, re: RegExp) => re.test(text);

/** Category for an update: the analyst's override, otherwise derived from its kind and (mainly) its title. The
 * body is only consulted for plain developments, so an incidental word ("testing was underway") in a statement
 * does not turn it into a test result. */
export function categoryFor(u: { kind: string; title: string; body: string; category?: string | null }): TimelineCategory {
  if (u.category && (TIMELINE_CATEGORIES as readonly string[]).includes(u.category)) return u.category as TimelineCategory;
  const title = u.title.toLowerCase();
  const body = u.body.toLowerCase();
  if (u.kind === "CORRECTION" || has(title, /\b(corrected|correction|softened|deleted|retract\w*|denies|denied)\b/)) return "CORRECTION";
  if (u.kind === "RECLASSIFICATION") return "STATUS";
  if (has(title, /\b(spread|imported case|another region|outside irkutsk)\b/)) return "SPREAD";
  if (has(title, /\b(test(s|ed|ing)?(?! tube)|pcr|negative|positive|detected|laboratory results?)\b/)) return "TESTING";
  if (has(title, /\b(died|death|dies|fatal)\b/)) return "DEATH";
  if (u.kind === "MEASURE" || has(title, /\b(quarantin\w*|isolat\w*|under observation|mask)\b/)) return "QUARANTINE";
  if (has(title, /\b(hospitalis\w*|hospitaliz\w*|symptoms?|fever|ill)\b/)) return "SYMPTOMS";
  if (has(title, /\b(new|confirmed|suspected) cases?\b/)) return "CASES";
  if (u.kind === "OFFICIAL_STATEMENT") return "STATEMENT";
  if (u.kind === "DEVELOPMENT" && has(body, /\b(test(s|ed|ing)? (of|among|found|showed|returned)|pcr|tested negative|tested positive)\b/)) return "TESTING";
  return "EVIDENCE";
}

// ------------------------------------------------------------------------------------------- location roles
export const LOCATION_ROLES = ["INVESTIGATION_SITE", "CONFIRMED_CASE", "SUSPECTED_CASE", "PRECAUTIONARY_MEASURE", "CASE_LOCATION", "AFFECTED_AREA"] as const;
export type LocationRole = (typeof LOCATION_ROLES)[number];
export const LOCATION_ROLE_LABEL: Record<LocationRole, string> = {
  INVESTIGATION_SITE: "Investigation site",
  CONFIRMED_CASE: "Laboratory-confirmed case",
  SUSPECTED_CASE: "Suspected case",
  PRECAUTIONARY_MEASURE: "Precautionary measure (not an infection)",
  CASE_LOCATION: "Case location",
  AFFECTED_AREA: "Affected area",
};
/** Roles that assert an infection somewhere. A precautionary measure (quarantined contact, closure) never does. */
export const CASE_ROLES: readonly LocationRole[] = ["CONFIRMED_CASE", "SUSPECTED_CASE", "CASE_LOCATION", "AFFECTED_AREA"];
export const isCaseRole = (role: string) => (CASE_ROLES as readonly string[]).includes(role);

// ------------------------------------------------------------------------------------------- spread
export interface SpreadLocation {
  name: string;
  countryCode: string;
  admin1: string | null;
  role: string;
  verificationStatus: string;
}

/** A case location outside the origin country, or outside the origin first-level region when both are known. */
export function isOutsideOrigin(l: { countryCode: string; admin1: string | null }, origin: { countryCode: string; admin1: string | null }): boolean {
  return l.countryCode !== origin.countryCode || (origin.admin1 !== null && l.admin1 !== null && l.admin1 !== origin.admin1);
}

/** Admin rule for locations: associating cases outside the origin with the event needs evidence, and such a
 * location starts UNVERIFIED (not mapped) unless an analyst verifies it with evidence. Returns an error or the
 * verification status to store. */
export function locationVerdict(
  l: { role: string; countryCode: string; admin1?: string | null; verificationStatus?: string | null; evidence?: string | null; sourceArticleId?: string | null },
  origin: { countryCode: string; admin1: string | null },
): { ok: true; verificationStatus: string } | { ok: false; error: string } {
  const outside = isCaseRole(l.role) && isOutsideOrigin({ countryCode: l.countryCode, admin1: l.admin1 ?? null }, origin);
  const hasEvidence = !!(l.evidence?.trim() || l.sourceArticleId);
  const status = l.verificationStatus ?? (outside ? "UNVERIFIED" : "VERIFIED");
  if (outside && status === "VERIFIED" && !hasEvidence) return { ok: false, error: "A case location outside the event's origin can only be verified with evidence (a source article or an evidence note)." };
  return { ok: true, verificationStatus: status };
}

export type SpreadState = "NO_EVIDENCE" | "WITHIN_ORIGIN" | "SPREAD_VERIFIED";
export interface SpreadAssessment {
  state: SpreadState;
  /** Verified case locations outside the origin region (country or first-level region). */
  outsideOrigin: SpreadLocation[];
  /** Case locations still awaiting verification (never mapped, never counted). */
  unverified: SpreadLocation[];
  headline: string;
}

/** Whether evidence of geographic spread exists, from analyst-verified case locations only. Precautionary
 * measures and mentioned countries never count. No rates or projections are derived. */
export function assessSpread(locations: readonly SpreadLocation[], origin: { countryCode: string; admin1: string | null }, originLabel: string): SpreadAssessment {
  const cases = locations.filter((l) => isCaseRole(l.role));
  const verified = cases.filter((l) => l.verificationStatus === "VERIFIED");
  const unverified = cases.filter((l) => l.verificationStatus === "UNVERIFIED");
  const outside = verified.filter((l) => isOutsideOrigin(l, origin));
  if (outside.length) {
    const places = [...new Set(outside.map((l) => l.name))].join(", ");
    return { state: "SPREAD_VERIFIED", outsideOrigin: outside, unverified, headline: `Verified case location(s) outside ${originLabel}: ${places}.` };
  }
  if (verified.length) return { state: "WITHIN_ORIGIN", outsideOrigin: [], unverified, headline: `Verified case locations are confined to ${originLabel}. No verified cases elsewhere.` };
  return { state: "NO_EVIDENCE", outsideOrigin: [], unverified, headline: `No verified evidence of spread beyond ${originLabel}.` };
}
