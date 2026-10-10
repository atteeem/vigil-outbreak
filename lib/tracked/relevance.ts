// Decides whether an article is about a tracked event (e.g. the Irkutsk investigation) and what it reports.
//
// Deliberately conservative:
//  - DIRECT needs one of the event's place/institution names AND event-specific context in the title or summary.
//    "Irkutsk" alone (weather, politics) is not enough; "plague" alone (Madagascar, Mongolia) is not enough.
//  - POSSIBLE (wider-area name such as "Siberia" + plague-specific terms) only queues the article for review.
//  - Countries merely mentioned are never evidence of spread; only a reported event location outside the origin
//    country raises the SPREAD topic — and even then only as a flag for analyst review.
// Pure function: no database, deterministic, unit-tested.

export type TrackedLevel = "DIRECT" | "POSSIBLE";
export const TRACKED_TOPICS = ["PATHOGEN", "LAB_RESULTS", "CONTACTS", "TRANSMISSION", "SPREAD", "DEATH", "CASES", "MEASURES", "STATEMENT", "CORRECTION"] as const;
export type TrackedTopic = (typeof TRACKED_TOPICS)[number];
/** Topics the dashboard prioritises: what the pathogen is, test results, exposed people, transmission, spread. */
export const PRIORITY_TOPICS: readonly TrackedTopic[] = ["PATHOGEN", "LAB_RESULTS", "CONTACTS", "TRANSMISSION", "SPREAD"];
/** Topics that make a DIRECT article a potentially material change (queued first for analyst review). */
const MATERIAL_TOPICS: readonly TrackedTopic[] = ["PATHOGEN", "LAB_RESULTS", "TRANSMISSION", "SPREAD", "DEATH", "CASES", "CORRECTION"];

/** Topic labels: what an article is about, not what it asserts ("Spread" can be a report that there is none). */
export const TOPIC_LABEL: Record<TrackedTopic, string> = {
  PATHOGEN: "Pathogen",
  LAB_RESULTS: "Lab results",
  CONTACTS: "Contacts",
  TRANSMISSION: "Transmission",
  SPREAD: "Spread",
  DEATH: "Deaths",
  CASES: "Cases",
  MEASURES: "Measures",
  STATEMENT: "Statement",
  CORRECTION: "Correction / denial",
};

const TOPIC_TERMS: Record<TrackedTopic, string[]> = {
  PATHOGEN: ["plague", "yersinia", "pathogen", "cause of death", "diagnos", "unknown origin", "unknown cause", "undetermined", "чум", "возбудител"],
  LAB_RESULTS: ["test", "laboratory result", "lab result", "pcr", "sequenc", "detected", "negative", "positive", "laboratory-confirmed", "laboratory confirmation", "анализ", "тест"],
  CONTACTS: ["contact", "under observation", "quarantin", "isolat", "контакт", "карантин", "обсерват"],
  TRANSMISSION: ["human-to-human", "person-to-person", "transmission", "secondary case", "transmitted", "передач"],
  SPREAD: ["spread", "another region", "other regions", "outside irkutsk", "new case", "second case", "imported case", "abroad", "распростран"],
  DEATH: ["died", "death", "dead", "fatal", "умер", "смерт", "скончал"],
  CASES: ["case", "infected", "fell ill", "sick", "hospitalis", "hospitaliz", "заболе", "госпитализ"],
  MEASURES: ["quarantin", "mask", "closure", "closed", "restriction", "lockdown", "disinfect", "карантин", "масоч", "ограничен"],
  STATEMENT: ["said", "statement", "announced", "according to", "spokes", "заявил", "сообщ"],
  CORRECTION: ["denied", "denies", "deny", "retract", "correction", "corrected", "deleted", "softened", "refuted", "false", "опроверг"],
};

/** Plague-specific terms that, together with a wider-area name, make an article POSSIBLY about the event. */
const STRONG_TERMS = ["plague", "yersinia", "anti-plague", "чум", "противочум"];

export interface TrackedTerms {
  anchorTerms: readonly string[];
  contextTerms: readonly string[];
  weakAnchorTerms: readonly string[];
  originCountryCode: string;
}

export interface TrackedMatch {
  level: TrackedLevel;
  score: number;
  topics: TrackedTopic[];
  reasons: string[];
  material: boolean;
  /** Event location (not a mention) outside the origin country: needs evidence before any association. */
  possibleSpreadCountries: string[];
}

export function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/ё/g, "е").replace(/[‐-―]/g, "-").replace(/\s+/g, " ");
}

/** Term found at a word start (stems such as "quarantin" or "bacteri" match their inflections). */
export function hasTerm(text: string, term: string): boolean {
  const t = normalize(term);
  let i = text.indexOf(t);
  while (i !== -1) {
    const prev = i === 0 ? "" : text[i - 1]!;
    if (!prev || !/[\p{L}\p{N}]/u.test(prev)) return true;
    i = text.indexOf(t, i + 1);
  }
  return false;
}

const found = (text: string, terms: readonly string[]) => [...new Set(terms.filter((t) => hasTerm(text, t)))];

export function matchTracked(
  article: { title: string; summary?: string | null; locationText?: string | null; countryCodes?: readonly string[] },
  terms: TrackedTerms,
): TrackedMatch | null {
  const title = normalize(article.title ?? "");
  const body = normalize([article.summary ?? "", article.locationText ?? ""].join(" "));
  const all = `${title} ${body}`;

  const anchorsTitle = found(title, terms.anchorTerms);
  const anchors = found(all, terms.anchorTerms);
  const context = found(all, terms.contextTerms);
  const weak = found(all, terms.weakAnchorTerms);
  const strong = found(all, STRONG_TERMS);

  let level: TrackedLevel | null = null;
  if (anchors.length > 0 && context.length > 0) level = "DIRECT";
  else if ((anchors.length > 0 || weak.length > 0) && strong.length > 0) level = "POSSIBLE";
  if (!level) return null;

  const topics = TRACKED_TOPICS.filter((topic) => found(all, TOPIC_TERMS[topic]).length > 0);
  const possibleSpreadCountries = (article.countryCodes ?? []).filter((c) => c !== terms.originCountryCode);
  if (possibleSpreadCountries.length && !topics.includes("SPREAD")) topics.push("SPREAD");

  const reasons = [
    anchors.length ? `place: ${anchors.join(", ")}${anchorsTitle.length ? " (in title)" : ""}` : `wider area: ${weak.join(", ")}`,
    context.length ? `context: ${context.slice(0, 6).join(", ")}` : `plague-specific: ${strong.join(", ")}`,
    ...(possibleSpreadCountries.length ? [`reported event location outside ${terms.originCountryCode}: ${possibleSpreadCountries.join(", ")} (needs evidence)`] : []),
  ];
  const score = (anchorsTitle.length ? 4 : 0) + (anchors.length ? 2 : 0) + Math.min(5, context.length) + (weak.length && !anchors.length ? 1 : 0) + topics.filter((t) => PRIORITY_TOPICS.includes(t)).length;
  const material = level === "DIRECT" ? topics.some((t) => MATERIAL_TOPICS.includes(t)) : topics.includes("SPREAD") || topics.includes("TRANSMISSION");
  return { level, score, topics, reasons, material, possibleSpreadCountries };
}

export function parseTerms(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  } catch {
    return [];
  }
}
