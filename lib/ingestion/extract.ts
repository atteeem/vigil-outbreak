// Deterministic, conservative extraction. Everything produced here is an UNVERIFIED claim; nothing extracted
// automatically becomes an observation or headline figure without an analyst promoting it.
import { findCountries } from "@/lib/geo/countries";
import { findCity } from "@/lib/geo/cities";
import type { Metric } from "@/lib/domain/enums";

export interface DiseaseKeywords {
  slug: string;
  keywords: string[];
}

/** Lower-cases and folds punctuation variants so "West-Nile", "West Nile" and "west nile" match the same keyword,
 * and typographic apostrophes match straight ones. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‐-―−-]/g, " ")
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ");
}

/** A specific disease suppresses a generic one when both match (e.g. "avian influenza" is not also "influenza"). */
const SUPPRESSED_BY: Record<string, string[]> = {
  influenza: ["avian-influenza"],
  "covid-19": ["mers"],
};

export function findDiseases(text: string, diseases: readonly DiseaseKeywords[]): string[] {
  const hay = normalizeForMatch(text);
  const hits: { slug: string; index: number }[] = [];
  for (const d of diseases) {
    let best = -1;
    for (const k of d.keywords) {
      const kw = normalizeForMatch(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = new RegExp(`(?<![a-z0-9])${kw}(?![a-z0-9])`).exec(hay);
      if (m && (best === -1 || m.index < best)) best = m.index;
    }
    if (best >= 0) hits.push({ slug: d.slug, index: best });
  }
  const slugs = hits.sort((a, b) => a.index - b.index).map((h) => h.slug);
  return slugs.filter((s) => !(SUPPRESSED_BY[s] ?? []).some((x) => slugs.includes(x)));
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  dozens: NaN, hundreds: NaN,
};

const NUM = String.raw`(\d{1,3}(?:[,\s]\d{3})+|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)`;
const QUALIFIER = String.raw`(?:(about|around|approximately|nearly|almost|at least|more than|over|up to|some)\s+)?`;

function toNumber(raw: string): number | null {
  const w = NUMBER_WORDS[raw.toLowerCase()];
  if (w !== undefined) return Number.isNaN(w) ? null : w;
  const n = Number(raw.replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export interface ExtractedCount {
  /** null = a count of "cases" with no confirmed/probable/suspected qualifier: kept as a claim, never a headline. */
  metric: Metric | null;
  value: number;
  approximate: boolean;
  text: string;
}

// Order matters: specific observation/contact patterns run first and claim their text span, so "200 people
// under observation" can never also be read as "200 ... cases".
const PATTERNS: { metric: Metric | null; re: RegExp }[] = [
  { metric: "UNDER_OBSERVATION", re: new RegExp(String.raw`${QUALIFIER}${NUM}\s+(?:people|persons|contacts|individuals|residents|staff|employees|close contacts|cases|patients)?\s*(?:who\s+\w+\s+)?(?:were\s+|are\s+|have been\s+|had been\s+)?(?:placed\s+|kept\s+|remain\s+)?(?:under|in)\s+(?:medical\s+)?(?:observation|isolation|quarantine|supervision|monitoring)`, "gi") },
  { metric: "UNDER_OBSERVATION", re: new RegExp(String.raw`${QUALIFIER}${NUM}\s+(?:close\s+)?contacts\s+(?:are\s+being|were|have been)\s+(?:monitored|traced|followed up)`, "gi") },
  { metric: "CONTACTS_TESTED_NEGATIVE", re: new RegExp(String.raw`${QUALIFIER}${NUM}\s+(?:contacts|people|samples|persons)\s+(?:have\s+|had\s+)?tested\s+negative`, "gi") },
  { metric: "HOSPITALIZED", re: new RegExp(String.raw`${QUALIFIER}${NUM}\s+(?:people|persons|patients|contacts)?\s*(?:were\s+|have been\s+)?(?:hospitali[sz]ed|admitted to hospital)`, "gi") },
  { metric: "CONFIRMED_CASES", re: new RegExp(String.raw`${QUALIFIER}${NUM}\s+(?:laboratory[- ])?confirmed\s+(?:human\s+)?cases?`, "gi") },
  { metric: "PROBABLE_CASES", re: new RegExp(String.raw`${QUALIFIER}${NUM}\s+probable\s+(?:human\s+)?cases?`, "gi") },
  { metric: "SUSPECTED_CASES", re: new RegExp(String.raw`${QUALIFIER}${NUM}\s+suspected\s+(?:human\s+)?cases?`, "gi") },
  { metric: "DEATHS", re: new RegExp(String.raw`${QUALIFIER}${NUM}\s+(?:confirmed\s+|reported\s+|associated\s+|related\s+)?deaths?`, "gi") },
  { metric: null, re: new RegExp(String.raw`${QUALIFIER}${NUM}\s+(?:human\s+|new\s+)?cases?\b`, "gi") },
];

export function extractCounts(text: string): ExtractedCount[] {
  let working = text;
  const out: ExtractedCount[] = [];
  for (const { metric, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    const spans: [number, number][] = [];
    while ((m = re.exec(working))) {
      const value = toNumber(m[2]!);
      if (value === null || value > 50_000_000) continue;
      // Years ("2026 cases") are not counts.
      if (/^(19|20)\d\d$/.test(m[2]!) && !m[1]) continue;
      out.push({ metric, value, approximate: Boolean(m[1]), text: m[0].trim() });
      spans.push([m.index, m.index + m[0].length]);
    }
    for (const [a, b] of spans) working = working.slice(0, a) + " ".repeat(b - a) + working.slice(b);
  }
  return out;
}

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
const DATE_RES = [
  new RegExp(String.raw`\b(\d{1,2})\s+(${MONTHS})\s+(\d{4})\b`, "gi"),
  new RegExp(String.raw`\b(${MONTHS})\s+(\d{1,2}),?\s+(\d{4})\b`, "gi"),
];

/** Earliest explicit calendar date in the text that is not after `notAfter` (the publication time). */
export function extractEventDate(text: string, notAfter: Date): Date | null {
  const found: Date[] = [];
  for (const re of DATE_RES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const [day, month, year] = /^\d/.test(m[1]!) ? [m[1]!, m[2]!, m[3]!] : [m[2]!, m[1]!, m[3]!];
      const d = new Date(`${month} ${day}, ${year} 00:00:00 UTC`);
      if (!Number.isNaN(d.getTime()) && d.getTime() <= notAfter.getTime()) found.push(d);
    }
  }
  return found.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}

export interface Extraction {
  /** Where the reported event is (title, else the lead sentence). Used for maps, filters and outbreak matching. */
  countryCodes: string[];
  /** Other countries named anywhere in the text — background, history, comparisons. Kept for context only. */
  mentionedCountryCodes: string[];
  /** Diseases the item is about (title first; body only when the title names none). */
  diseaseSlugs: string[];
  locationText: string | null;
  geoPrecision: "CITY" | "COUNTRY" | "MULTI_COUNTRY" | "UNKNOWN";
  /** Where the location came from. */
  locationScope: "TITLE" | "LEAD" | "NONE";
  lat: number | null;
  lng: number | null;
  eventDate: Date | null;
  counts: ExtractedCount[];
  unknownCause: boolean;
}

/** More countries than this in the deciding text = a multi-country item, not a located event. */
export const MAX_PRIMARY_COUNTRIES = 3;

/** First sentence(s) of the lead, where publishers state what happened and where. */
export function leadSentence(text: string | null | undefined, max = 320): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = /^(.{40,}?[.!?])(\s|$)/.exec(t);
  return (m ? m[1]! : t).slice(0, max);
}

/** Decides the event location. Order of evidence:
 *  1. Title text after the last " – " / " - " separator (WHO DON convention "<Disease> – <Country>").
 *  2. Countries anywhere in the title.
 *  3. The lead sentence.
 * Countries found only elsewhere in the text are "mentioned", never the event location. */
export function locateEvent(title: string, lead: string, fullText: string): { primary: string[]; mentioned: string[]; scope: Extraction["locationScope"]; multi: boolean } {
  const all = findCountries(fullText);
  let primary: string[] = [];
  let scope: Extraction["locationScope"] = "NONE";
  const parts = title.split(/\s+[–—-]\s+/);
  if (parts.length > 1) primary = findCountries(parts[parts.length - 1]!);
  if (primary.length) scope = "TITLE";
  if (!primary.length) {
    primary = findCountries(title);
    if (primary.length) scope = "TITLE";
  }
  if (!primary.length && lead) {
    primary = findCountries(lead);
    if (primary.length) scope = "LEAD";
  }
  const multi = primary.length > MAX_PRIMARY_COUNTRIES || /\bmulti[\s-]?country\b|\bglobal (situation|update)\b/i.test(title);
  if (multi) primary = [];
  return { primary, mentioned: all.filter((c) => !primary.includes(c)), scope: multi ? scope : primary.length ? scope : "NONE", multi };
}

export function extract(title: string, body: string, publishedAt: Date, diseases: readonly DiseaseKeywords[], opts: { lead?: string | null } = {}): Extraction {
  const text = `${title}\n${body}`;
  const lead = leadSentence(opts.lead ?? body);
  const loc = locateEvent(title, lead, text);
  // A city counts only if it is named in the title or lead AND lies in an event country. A known city named there
  // without any country also locates the event in that city's country.
  const city = findCity(`${title}\n${lead}`);
  if (city && !loc.multi && loc.primary.length === 0) {
    loc.primary = [city.country];
    loc.mentioned = loc.mentioned.filter((c) => c !== city.country);
    loc.scope = findCity(title) ? "TITLE" : "LEAD";
  }
  const cityOk = Boolean(city && loc.primary.includes(city.country));
  const titleDiseases = findDiseases(title, diseases);
  const diseaseSlugs = titleDiseases.length ? titleDiseases : findDiseases(`${lead}\n${body}`, diseases).slice(0, 2);
  return {
    countryCodes: loc.primary,
    mentionedCountryCodes: loc.mentioned,
    diseaseSlugs,
    locationText: cityOk ? `${city!.name}${city!.admin1 ? `, ${city!.admin1}` : ""}` : loc.multi ? "Multi-country" : null,
    geoPrecision: cityOk ? "CITY" : loc.multi ? "MULTI_COUNTRY" : loc.primary.length ? "COUNTRY" : "UNKNOWN",
    locationScope: loc.scope,
    lat: cityOk ? city!.lat : null,
    lng: cityOk ? city!.lng : null,
    eventDate: extractEventDate(text, publishedAt),
    counts: extractCounts(text),
    unknownCause: /\b(unknown (origin|cause|aetiology|etiology)|undiagnosed|unexplained|unidentified (illness|disease))\b/i.test(`${title}\n${lead}`),
  };
}
