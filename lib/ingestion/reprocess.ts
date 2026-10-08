// Re-derives extraction + classification for automatically ingested articles with the current rules.
// Preserves records: nothing is deleted; review status, verification, analyst outbreak links (outbreakId), claims,
// seeded and manual articles are never modified. Only derived fields of INGESTED rows change.
import { prisma } from "@/lib/db";
import { deriveItem, safeJson } from "./pipeline";
import { CLASSIFIER_VERSION } from "./classify";
import { matchOutbreak, type OutbreakCandidate } from "./match";
import { parseWhoDon } from "./adapters/who-don";
import { parseCdcContent } from "./adapters/cdc-content";
import { rssRowToItem } from "./adapters/rss";
import type { FetchedItem } from "./types";

function rebuild(adapter: string, raw: unknown, sourceUrl: string | null): FetchedItem | null {
  try {
    if (adapter === "WHO_DON_API") return parseWhoDon({ value: [raw] }).items[0] ?? null;
    if (adapter === "CDC_CONTENT_API") return parseCdcContent({ results: [raw] }).items[0] ?? null;
    if (adapter === "RSS") {
      const r = rssRowToItem(raw as Record<string, unknown>, sourceUrl ?? "https://invalid.local/");
      return typeof r === "string" ? null : r;
    }
  } catch {
    return null;
  }
  return null;
}

export interface ReprocessResult { examined: number; changed: number; skipped: number; byType: Record<string, number>; examples: string[] }

/** See scripts/reprocess.ts. Never deletes; only derived fields of INGESTED rows; never touches outbreakId. */
export async function reprocessArticles(opts: { apply: boolean; all?: boolean; log?: (line: string) => void } = { apply: false }): Promise<ReprocessResult> {
  const { apply, all = false } = opts;
  const examples: string[] = [];
  const [diseases, outbreaks] = await Promise.all([
    prisma.disease.findMany({ select: { slug: true, keywords: true } }),
    prisma.outbreak.findMany({ where: { mergedIntoId: null }, select: { id: true, countryCode: true, pathogenStatus: true, classification: true, disease: { select: { slug: true } }, suspectedDisease: { select: { slug: true } }, locations: { select: { lat: true, lng: true } } } }),
  ]);
  const keywords = diseases.map((d) => ({ slug: d.slug, keywords: safeJson<string[]>(d.keywords, []) }));
  const candidates: OutbreakCandidate[] = outbreaks.map((o) => ({ id: o.id, countryCode: o.countryCode, diseaseSlug: o.disease?.slug ?? null, suspectedDiseaseSlug: o.suspectedDisease?.slug ?? null, pathogenStatus: o.pathogenStatus, classification: o.classification, locations: o.locations }));

  const rows = await prisma.sourceArticle.findMany({ where: { origin: "INGESTED", ...(all ? {} : { classifierVersion: { lt: CLASSIFIER_VERSION } }) }, include: { source: { select: { adapter: true, url: true } } } });
  let changed = 0;
  let skipped = 0;
  const byType: Record<string, number> = {};
  for (const r of rows) {
    const item = rebuild(r.source.adapter, safeJson<unknown>(r.raw, null), r.source.url);
    if (!item) {
      skipped++;
      continue;
    }
    const { x, c } = deriveItem({ ...item, title: r.title, publishedAt: r.publishedAt }, r.source.adapter, keywords);
    byType[c.contentType] = (byType[c.contentType] ?? 0) + 1;
    const next = {
      countryCodes: JSON.stringify(x.countryCodes),
      mentionedCountryCodes: JSON.stringify(x.mentionedCountryCodes),
      diseaseSlugs: JSON.stringify(x.diseaseSlugs),
      locationText: x.locationText,
      geoPrecision: x.geoPrecision,
      contentType: c.contentType,
      outbreakRelevant: c.outbreakRelevant,
      classifierVersion: CLASSIFIER_VERSION,
      // Only the SUGGESTION is recomputed; an analyst-accepted link (outbreakId) is never touched.
      suggestedOutbreakId: c.outbreakRelevant ? matchOutbreak(x, candidates) : null,
    };
    const diff = (Object.keys(next) as (keyof typeof next)[]).filter((k) => k !== "classifierVersion" && String(r[k]) !== String(next[k]));
    if (diff.length) {
      changed++;
      const line = `${apply ? "UPDATE" : "would update"} ${r.id} "${r.title.slice(0, 70)}": ${diff.map((k) => `${k} ${String(r[k])} → ${String(next[k])}`).join("; ")}`;
      if (examples.length < 25) examples.push(line);
      opts.log?.(line);
    }
    if (apply) await prisma.sourceArticle.update({ where: { id: r.id }, data: next });
  }
  if (apply) await prisma.adminAuditLog.create({ data: { action: "articles.reprocess", entityType: "system", details: JSON.stringify({ classifierVersion: CLASSIFIER_VERSION, examined: rows.length, changed, skipped, byType }), actor: "cli" } });
  return { examined: rows.length, changed, skipped, byType, examples };
}

