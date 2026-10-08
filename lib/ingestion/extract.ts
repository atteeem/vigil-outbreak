// Deterministic, conservative extraction. Everything produced here is an UNVERIFIED claim; nothing extracted
// automatically becomes an observation or headline figure without an analyst promoting it.
import { findCountries } from "@/lib/geo/countries";
import { findCity } from "@/lib/geo/cities";
import type { Metric } from "@/lib/domain/enums";

export interface DiseaseKeywords {
  slug: string;
  keywords: string[];
}

export function findDiseases(text: string, diseases: readonly DiseaseKeywords[]): string[] {
  const lower = text.toLowerCase();
  const hits: { slug: string; index: number }[] = [];
  for (const d of diseases) {
    let best = -1;
    for (const k of d.keywords) {
      const re = new RegExp(`(?<![a-z])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`);
      const m = re.exec(lower);
      if (m && (best === -1 || m.index < best)) best = m.index;
    }
    if (best >= 0) hits.push({ slug: d.slug, index: best });
  }
  return hits.sort((a, b) => a.index - b.index).map((h) => h.slug);
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
  { metric: "UNDER_OBSERVATION", re: new RegExp(String.raw`${QUALIFIER}${NUM}\s+(?:people|persons|contacts|individuals|residents|staff|employees|close contacts)?\s*(?:who\s+\w+\s+)?(?:were\s+|are\s+|have been\s+|had been\s+)?(?:placed\s+|kept\s+|remain\s+)?(?:under|in)\s+(?:medical\s+)?(?:observation|isolation|quarantine|supervision|monitoring)`, "gi") },
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
  countryCodes: string[];
  diseaseSlugs: string[];
  locationText: string | null;
  geoPrecision: "CITY" | "COUNTRY" | "UNKNOWN";
  lat: number | null;
  lng: number | null;
  eventDate: Date | null;
  counts: ExtractedCount[];
  unknownCause: boolean;
}

export function extract(title: string, body: string, publishedAt: Date, diseases: readonly DiseaseKeywords[]): Extraction {
  const text = `${title}\n${body}`;
  const countryCodes = findCountries(text);
  const city = findCity(text);
  const cityOk = city && (countryCodes.length === 0 || countryCodes.includes(city.country));
  return {
    countryCodes: cityOk && !countryCodes.includes(city.country) ? [city.country, ...countryCodes] : countryCodes,
    diseaseSlugs: findDiseases(text, diseases),
    locationText: cityOk ? `${city.name}${city.admin1 ? `, ${city.admin1}` : ""}` : null,
    geoPrecision: cityOk ? "CITY" : countryCodes.length ? "COUNTRY" : "UNKNOWN",
    lat: cityOk ? city.lat : null,
    lng: cityOk ? city.lng : null,
    eventDate: extractEventDate(text, publishedAt),
    counts: extractCounts(text),
    unknownCause: /\b(unknown (origin|cause|aetiology|etiology)|undiagnosed|unexplained|unidentified (illness|disease))\b/i.test(text),
  };
}
