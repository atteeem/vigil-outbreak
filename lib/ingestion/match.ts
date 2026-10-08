// Outbreak association: SUGGESTS which existing outbreak an incoming article belongs to. A suggestion is never
// an accepted link — an analyst confirms it in /admin/review.
import type { Extraction } from "./extract";

export interface OutbreakCandidate {
  id: string;
  countryCode: string;
  diseaseSlug: string | null;
  suspectedDiseaseSlug: string | null;
  pathogenStatus: string;
  classification: string;
  locations: { lat: number; lng: number }[];
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(bLat - aLat);
  const dLng = r(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function scoreMatch(x: Extraction, o: OutbreakCandidate): number {
  let score = 0;
  if (x.countryCodes.includes(o.countryCode)) score += 2;
  if (o.diseaseSlug && x.diseaseSlugs.includes(o.diseaseSlug)) score += 3;
  else if (o.suspectedDiseaseSlug && x.diseaseSlugs.includes(o.suspectedDiseaseSlug)) score += 3;
  if (x.unknownCause && o.pathogenStatus !== "CONFIRMED") score += 1;
  if (x.lat !== null && x.lng !== null && o.locations.some((l) => haversineKm(x.lat!, x.lng!, l.lat, l.lng) <= 150)) score += 2;
  if (o.classification === "RESOLVED") score -= 1;
  return score;
}

export const MATCH_THRESHOLD = 4;

export function matchOutbreak(x: Extraction, candidates: readonly OutbreakCandidate[]): string | null {
  let best: { id: string; score: number } | null = null;
  for (const o of candidates) {
    const s = scoreMatch(x, o);
    if (s >= MATCH_THRESHOLD && (!best || s > best.score)) best = { id: o.id, score: s };
  }
  return best?.id ?? null;
}
