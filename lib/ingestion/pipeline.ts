// Ingestion pipeline: fetch -> normalize -> extract -> associate -> dedupe -> store -> flag conflicts.
// Failures are recorded on the run and the source; nothing is ever substituted for missing upstream data.
import { hostname } from "node:os";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { canonicalizeUrl, shortSummary, titleHash } from "./normalize";
import { extract, type DiseaseKeywords } from "./extract";
import { matchOutbreak, type OutbreakCandidate } from "./match";
import { fetchWhoDon } from "./adapters/who-don";
import { fetchRss } from "./adapters/rss";
import { fetchCdcContent } from "./adapters/cdc-content";
import { IngestionError, type AdapterResult, type FetchedItem, type FetchOptions } from "./types";
import type { FailureKind } from "./errors";
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
  failureKind: FailureKind | null;
}

const DUPLICATE_TITLE_WINDOW_MS = 3 * 24 * 3600_000;
/** A run holds a per-source lease in the database, so concurrent processes (web + worker, two workers, a cron
 * overlapping a manual Fetch Now) never fetch the same source at once. A crashed holder's lease simply expires. */
export const LEASE_MS = 10 * 60_000;
const OWNER = `${hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;

/** Next poll time after a run. Success: the source's interval. Failure: exponential backoff (×2 per consecutive
 * failure, max ×16, capped at 6 h) with ±10% jitter so many instances don't synchronise. */
export function nextAttemptAfter(now: Date, intervalMinutes: number, consecutiveFailures: number, jitter = Math.random()): Date {
  const factor = consecutiveFailures > 0 ? Math.min(2 ** Math.min(consecutiveFailures, 4), 16) : 1;
  const ms = Math.min(intervalMinutes * 60_000 * factor, 6 * 3600_000) * (0.9 + jitter * 0.2);
  return new Date(now.getTime() + ms);
}

async function acquireLease(sourceId: string, now: Date): Promise<boolean> {
  const r = await prisma.source.updateMany({
    where: { id: sourceId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseOwner: OWNER, leaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (r.count === 0) return false;
  // Runs left RUNNING by a crashed process are closed, not silently counted.
  await prisma.ingestionRun.updateMany({ where: { sourceId, status: "RUNNING", startedAt: { lt: new Date(now.getTime() - LEASE_MS) } }, data: { status: "ABANDONED", finishedAt: now, errorMessage: "Process ended before the run finished (lease expired)." } });
  return true;
}

async function releaseLease(sourceId: string) {
  await prisma.source.updateMany({ where: { id: sourceId, leaseOwner: OWNER }, data: { leaseOwner: null, leaseUntil: null } });
}

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "P2002" || /Unique constraint/i.test((err as Error)?.message ?? "");

export async function runAdapter(adapter: string, url: string | null, opts: FetchOptions = {}): Promise<AdapterResult> {
  if (!url) throw new IngestionError("Source has no URL configured", null, "CONFIG");
  if (adapter === "WHO_DON_API") return fetchWhoDon(url, opts);
  if (adapter === "CDC_CONTENT_API") return fetchCdcContent(url, opts);
  if (adapter === "RSS") return fetchRss(url);
  throw new IngestionError(`Adapter ${adapter} does not fetch automatically`, null, "CONFIG");
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

  // The unique keys (canonicalUrl; sourceId+externalId) make the insert itself idempotent: if another process stored
  // the same item between our checks and this insert, the violation is a duplicate, not an error.
  let article: { id: string };
  try {
    article = await prisma.sourceArticle.create({
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
      origin: "INGESTED",
    },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return "duplicate";
    throw err;
  }
  if (near) return "duplicate";

  const claims: Prisma.EvidenceClaimCreateManyInput[] = x.counts.map((c) => ({
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
  if (x.unknownCause) claims.push({ articleId: article.id, claimType: "PATHOGEN_ID", text: "Publication describes the cause as unknown/undetermined.", metric: null, value: null, attributedTo: null, sourceType, extractedBy: "AUTO", publishedAt: item.publishedAt });
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

export async function runSource(sourceId: string, trigger: Trigger, opts: FetchOptions = {}): Promise<RunSummary> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error(`Unknown source ${sourceId}`);
  const base: RunSummary = { runId: null, sourceId, sourceName: source.name, status: "SKIPPED", itemsFetched: 0, itemsNew: 0, itemsDuplicate: 0, itemsFailed: 0, error: null, failureKind: null };
  if (source.adapter === "MANUAL") return { ...base, error: "Manual source: nothing to fetch" };
  if (!(await acquireLease(sourceId, new Date()))) return { ...base, error: "A fetch for this source is already running (lease held by another process)" };
  const run = await prisma.ingestionRun.create({ data: { sourceId, trigger, status: "RUNNING" } });
  const now = () => new Date();
  try {
    let result: AdapterResult;
    try {
      result = await runAdapter(source.adapter, source.url, opts);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const httpStatus = err instanceof IngestionError ? err.httpStatus : null;
      const failureKind: FailureKind = err instanceof IngestionError ? err.kind : "UNKNOWN";
      await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: now(), errorMessage: message, httpStatus, failureKind } });
      // BLOCKED = our network would not let us reach the publisher; it says nothing about the endpoint itself.
      await prisma.source.update({ where: { id: sourceId }, data: { lastFetchAt: now(), lastError: message, lastErrorKind: failureKind, consecutiveFailures: { increment: 1 }, nextAttemptAt: nextAttemptAfter(now(), source.pollIntervalMinutes, source.consecutiveFailures + 1), endpointStatus: failureKind === "NETWORK_POLICY_BLOCKED" ? "BLOCKED" : "FAILING" } });
      return { ...base, runId: run.id, status: "FAILED", error: message, failureKind };
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
      data: { status, finishedAt: now(), httpStatus: result.httpStatus, itemsFetched: result.items.length, itemsNew, itemsDuplicate, itemsFailed, pagesFetched: result.pages ?? 1, errors: JSON.stringify(errors.slice(0, 50)) },
    });
    await prisma.source.update({ where: { id: sourceId }, data: { lastFetchAt: now(), lastSuccessAt: now(), lastError: null, lastErrorKind: null, consecutiveFailures: 0, nextAttemptAt: nextAttemptAfter(now(), source.pollIntervalMinutes, 0), endpointStatus: "WORKING" } });
    return { ...base, runId: run.id, status, itemsFetched: result.items.length, itemsNew, itemsDuplicate, itemsFailed };
  } finally {
    await releaseLease(sourceId).catch(() => undefined);
  }
}

/** Sources due for polling: enabled, automatic adapter, interval elapsed (with exponential backoff after failures). */
/** Sources due for polling: enabled, automatic adapter, persisted retry time reached, not leased elsewhere. */
export async function dueSources(at = new Date()) {
  return prisma.source.findMany({
    where: {
      enabled: true,
      adapter: { not: "MANUAL" },
      AND: [{ OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: at } }] }, { OR: [{ leaseUntil: null }, { leaseUntil: { lt: at } }] }],
    },
    orderBy: { nextAttemptAt: "asc" },
  });
}

export async function runAll(trigger: Trigger, opts: { onlyDue?: boolean } & FetchOptions = {}): Promise<RunSummary[]> {
  const sources = opts.onlyDue ? await dueSources() : await prisma.source.findMany({ where: { enabled: true, adapter: { not: "MANUAL" } } });
  const results: RunSummary[] = [];
  for (const s of sources) results.push(await runSource(s.id, trigger, { maxPages: opts.maxPages }));
  return results;
}
