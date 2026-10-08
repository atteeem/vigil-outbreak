// Ingestion pipeline: fetch -> normalize -> extract -> associate -> dedupe -> store -> flag conflicts.
// Failures are recorded on the run and the source; nothing is ever substituted for missing upstream data.
import { prisma } from "@/lib/db";
import { canonicalizeUrl, shortSummary, titleHash } from "./normalize";
import { extract, type DiseaseKeywords } from "./extract";
import { matchOutbreak, type OutbreakCandidate } from "./match";
import { fetchWhoDon } from "./adapters/who-don";
import { fetchRss } from "./adapters/rss";
import { IngestionError, type AdapterResult, type FetchedItem } from "./types";
import { METRIC_LABEL, type Metric } from "@/lib/domain/enums";

export type Trigger = "SCHEDULED" | "MANUAL" | "CLI" | "TEST";

export interface RunSummary {
  runId: string | null;
  sourceId: string;
  sourceName: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";
  itemsFetched: number;
  itemsNew: number;
  itemsDuplicate: number;
  itemsFailed: number;
  error: string | null;
}

const DUPLICATE_TITLE_WINDOW_MS = 3 * 24 * 3600_000;
const g = globalThis as unknown as { __outbreakRunning?: Set<string> };
const running = (g.__outbreakRunning ??= new Set<string>());

async function runAdapter(adapter: string, url: string | null): Promise<AdapterResult> {
  if (!url) throw new IngestionError("Source has no URL configured");
  if (adapter === "WHO_DON_API") return fetchWhoDon(url);
  if (adapter === "RSS") return fetchRss(url);
  throw new IngestionError(`Adapter ${adapter} does not fetch automatically`);
}

const claimTypeFor = (metric: Metric | null) =>
  metric === "DEATHS" ? "DEATH" : metric === "UNDER_OBSERVATION" || metric === "HOSPITALIZED" || metric === "CONTACTS_TESTED_NEGATIVE" ? "OBSERVATION_COUNT" : "CASE_COUNT";

async function loadContext() {
  const [diseases, outbreaks] = await Promise.all([
    prisma.disease.findMany({ select: { slug: true, keywords: true } }),
    prisma.outbreak.findMany({
      where: { mergedIntoId: null },
      select: { id: true, countryCode: true, pathogenStatus: true, classification: true, disease: { select: { slug: true } }, suspectedDisease: { select: { slug: true } }, locations: { select: { lat: true, lng: true } } },
    }),
  ]);
  const keywords: DiseaseKeywords[] = diseases.map((d) => ({ slug: d.slug, keywords: safeJson<string[]>(d.keywords, []) }));
  const candidates: OutbreakCandidate[] = outbreaks.map((o) => ({
    id: o.id,
    countryCode: o.countryCode,
    diseaseSlug: o.disease?.slug ?? null,
    suspectedDiseaseSlug: o.suspectedDisease?.slug ?? null,
    pathogenStatus: o.pathogenStatus,
    classification: o.classification,
    locations: o.locations,
  }));
  return { keywords, candidates };
}

export function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** Stores one fetched item. Returns "new" | "duplicate". Exported for tests. */
export async function storeItem(
  item: FetchedItem,
  source: { id: string; kind: string },
  runId: string | null,
  ctx: { keywords: DiseaseKeywords[]; candidates: OutbreakCandidate[] },
): Promise<"new" | "duplicate"> {
  const canonicalUrl = canonicalizeUrl(item.url);
  const existing = await prisma.sourceArticle.findUnique({ where: { canonicalUrl }, select: { id: true } });
  if (existing) return "duplicate";
  if (item.externalId) {
    const sameId = await prisma.sourceArticle.findFirst({ where: { sourceId: source.id, externalId: item.externalId }, select: { id: true } });
    if (sameId) return "duplicate";
  }
  const hash = titleHash(item.title);
  const near = await prisma.sourceArticle.findFirst({
    where: {
      titleHash: hash,
      duplicateOfId: null,
      publishedAt: { gte: new Date(item.publishedAt.getTime() - DUPLICATE_TITLE_WINDOW_MS), lte: new Date(item.publishedAt.getTime() + DUPLICATE_TITLE_WINDOW_MS) },
    },
    select: { id: true },
  });

  const x = extract(item.title, item.text, item.publishedAt, ctx.keywords);
  const sourceType = source.kind === "OFFICIAL" ? "OFFICIAL" : "MEDIA";
  const suggestedOutbreakId = matchOutbreak(x, ctx.candidates);
  const summary = item.text ? shortSummary(item.text) : null;

  const article = await prisma.sourceArticle.create({
    data: {
      sourceId: source.id,
      url: item.url,
      canonicalUrl,
      externalId: item.externalId,
      title: item.title,
      summary,
      titleHash: hash,
      language: item.language,
      publishedAt: item.publishedAt,
      eventDate: x.eventDate,
      ingestionRunId: runId,
      countryCodes: JSON.stringify(x.countryCodes),
      diseaseSlugs: JSON.stringify(x.diseaseSlugs),
      locationText: x.locationText,
      geoPrecision: x.geoPrecision,
      sourceType,
      // Same story under a different URL: kept for provenance, hidden from the feed, linked to the original.
      reviewStatus: near ? "DUPLICATE" : "PENDING",
      duplicateOfId: near?.id ?? null,
      suggestedOutbreakId,
      raw: JSON.stringify(item.raw).slice(0, 100_000),
    },
  });
  if (near) return "duplicate";

  const claims = x.counts.map((c) => ({
    articleId: article.id,
    claimType: claimTypeFor(c.metric),
    text: c.metric ? `${c.text} (${METRIC_LABEL[c.metric]})` : `${c.text} (unqualified case count — not classified as confirmed, probable or suspected)`,
    metric: c.metric,
    value: c.value,
    attributedTo: null,
    sourceType,
    extractedBy: "AUTO",
    publishedAt: item.publishedAt,
  }));
  if (x.unknownCause) claims.push({ articleId: article.id, claimType: "PATHOGEN_ID", text: "Publication describes the cause as unknown/undetermined.", metric: null, value: null as unknown as number, attributedTo: null, sourceType, extractedBy: "AUTO", publishedAt: item.publishedAt });
  if (claims.length) await prisma.evidenceClaim.createMany({ data: claims });
  if (suggestedOutbreakId) await flagConflicts(article.id, suggestedOutbreakId);
  return "new";
}

/** Marks auto-extracted numeric claims that disagree with the outbreak's latest verified official figure for
 * the same metric. Disagreement is recorded, never resolved automatically. */
export async function flagConflicts(articleId: string, outbreakId: string): Promise<number> {
  const claims = await prisma.evidenceClaim.findMany({ where: { articleId, metric: { not: null }, value: { not: null } } });
  let flagged = 0;
  for (const c of claims) {
    const official = await prisma.outbreakObservation.findFirst({
      where: { outbreakId, metric: c.metric!, sourceType: "OFFICIAL", verificationStatus: "VERIFIED", value: { not: null } },
      orderBy: [{ asOfDate: "desc" }, { reportedAt: "desc" }],
    });
    if (official && official.value !== c.value && Math.abs(official.reportedAt.getTime() - c.publishedAt.getTime()) < 14 * 24 * 3600_000) {
      await prisma.evidenceClaim.update({
        where: { id: c.id },
        data: { conflictNote: `Differs from verified official figure ${official.value} (${official.attributedTo ?? "official source"}, reported ${official.reportedAt.toISOString().slice(0, 10)}).` },
      });
      flagged++;
    }
  }
  return flagged;
}

export async function runSource(sourceId: string, trigger: Trigger): Promise<RunSummary> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error(`Unknown source ${sourceId}`);
  const base: RunSummary = { runId: null, sourceId, sourceName: source.name, status: "SKIPPED", itemsFetched: 0, itemsNew: 0, itemsDuplicate: 0, itemsFailed: 0, error: null };
  if (source.adapter === "MANUAL") return { ...base, error: "Manual source: nothing to fetch" };
  if (running.has(sourceId)) return { ...base, error: "A fetch for this source is already running" };
  running.add(sourceId);
  const run = await prisma.ingestionRun.create({ data: { sourceId, trigger, status: "RUNNING" } });
  const now = () => new Date();
  try {
    let result: AdapterResult;
    try {
      result = await runAdapter(source.adapter, source.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const httpStatus = err instanceof IngestionError ? err.httpStatus : null;
      await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: now(), errorMessage: message, httpStatus } });
      await prisma.source.update({ where: { id: sourceId }, data: { lastFetchAt: now(), lastError: message, consecutiveFailures: { increment: 1 }, endpointStatus: "FAILING" } });
      return { ...base, runId: run.id, status: "FAILED", error: message };
    }
    const ctx = await loadContext();
    const errors = [...result.itemErrors];
    let itemsNew = 0;
    let itemsDuplicate = 0;
    for (const item of result.items) {
      try {
        const r = await storeItem(item, source, run.id, ctx);
        if (r === "new") itemsNew++;
        else itemsDuplicate++;
      } catch (err) {
        errors.push(`${item.title.slice(0, 80)}: ${(err as Error).message}`);
      }
    }
    const itemsFailed = errors.length;
    const status = itemsFailed > 0 ? "PARTIAL" : "SUCCESS";
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status, finishedAt: now(), httpStatus: result.httpStatus, itemsFetched: result.items.length, itemsNew, itemsDuplicate, itemsFailed, errors: JSON.stringify(errors.slice(0, 50)) },
    });
    await prisma.source.update({ where: { id: sourceId }, data: { lastFetchAt: now(), lastSuccessAt: now(), lastError: null, consecutiveFailures: 0, endpointStatus: "WORKING" } });
    return { ...base, runId: run.id, status, itemsFetched: result.items.length, itemsNew, itemsDuplicate, itemsFailed };
  } finally {
    running.delete(sourceId);
  }
}

/** Sources due for polling: enabled, automatic adapter, interval elapsed (with exponential backoff after failures). */
export async function dueSources(at = new Date()) {
  const sources = await prisma.source.findMany({ where: { enabled: true, adapter: { not: "MANUAL" } } });
  return sources.filter((s) => {
    if (!s.lastFetchAt) return true;
    const backoff = Math.min(2 ** Math.min(s.consecutiveFailures, 4), 16);
    const intervalMs = s.pollIntervalMinutes * 60_000 * backoff;
    return at.getTime() - s.lastFetchAt.getTime() >= Math.min(intervalMs, 6 * 3600_000);
  });
}

export async function runAll(trigger: Trigger, opts: { onlyDue?: boolean } = {}): Promise<RunSummary[]> {
  const sources = opts.onlyDue ? await dueSources() : await prisma.source.findMany({ where: { enabled: true, adapter: { not: "MANUAL" } } });
  const results: RunSummary[] = [];
  for (const s of sources) results.push(await runSource(s.id, trigger));
  return results;
}
