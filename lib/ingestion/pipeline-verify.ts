// Full-pipeline verification of a real source: an endpoint answering is NOT enough. A source is reported as
// PIPELINE_VERIFIED only when real records were retrieved, parsed in the documented format, stored, extracted
// (disease / geography / dates) and a second run stored nothing new (deduplication). Uses whatever database
// `prisma` points at — the CLI points it at a throwaway database, never at your working data.
import { prisma } from "@/lib/db";
import { runSource } from "./pipeline";
import { verifyEndpoint, type Check, type VerificationResult } from "./verify";
import { safeJson } from "./pipeline";
import type { FailureKind } from "./errors";

export type PipelineVerdict = "PIPELINE_VERIFIED" | "BLOCKED_BY_NETWORK" | "FAILED";

export interface PipelineTarget {
  slug: string;
  adapter: string;
  url: string;
  label?: string;
  /** Official vs media publisher (affects only provenance labels). */
  kind?: "OFFICIAL" | "MEDIA";
}

export interface PipelineVerification {
  slug: string;
  label: string;
  adapter: string;
  url: string;
  verdict: PipelineVerdict;
  failedStage: string | null;
  failureKind: FailureKind | null;
  endpoint: VerificationResult;
  stages: Check[];
  stored: number;
  extraction: { total: number; withCountry: number; withDisease: number; withUnknownCauseFlag: number; withEventDate: number; validPublishedAt: number } | null;
  samples: { title: string; publishedAt: string; url: string; countries: string[]; diseases: string[]; contentType: string; outbreakRelevant: boolean }[];
  /** How the stored records were classified (outbreak reports vs guidance, podcasts, corporate, …). */
  contentTypes: Record<string, number> | null;
  checkedAt: string;
}

/** Minimum extraction rates. WHO DON titles are "<Disease> – <Country>", so low rates mean the extractor (or the
 * format) is wrong. CDC/ECDC items are broader news, so their rates only warn. */
const THRESHOLDS: Record<string, { country: number; disease: number; fail: boolean }> = {
  WHO_DON_API: { country: 0.6, disease: 0.6, fail: true },
  CDC_CONTENT_API: { country: 0.25, disease: 0.25, fail: false },
  RSS: { country: 0.25, disease: 0.25, fail: false },
};

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");

export async function verifyPipeline(t: PipelineTarget, opts: { now?: Date; maxPages?: number } = {}): Promise<PipelineVerification> {
  const now = opts.now ?? new Date();
  const stages: Check[] = [];
  const base = { slug: t.slug, label: t.label ?? t.slug, adapter: t.adapter, url: t.url, stages, stored: 0, extraction: null, samples: [], contentTypes: null, checkedAt: now.toISOString() };

  // 1. Endpoint: reachable, documented schema, freshness, ordering, paging.
  const endpoint = await verifyEndpoint(t.slug, t.adapter, t.url, now);
  stages.push({ name: "endpoint", status: endpoint.verdict === "VERIFIED" ? "PASS" : endpoint.verdict === "DEGRADED" ? "WARN" : "FAIL", detail: `${endpoint.verdict}${endpoint.failureKind ? ` (${endpoint.failureKind})` : ""}: ${endpoint.checks.map((c) => `${c.name} ${c.status}`).join(", ")}` });
  if (endpoint.verdict === "BLOCKED_BY_NETWORK" || endpoint.verdict === "FAILED") {
    return { ...base, verdict: endpoint.verdict === "BLOCKED_BY_NETWORK" ? "BLOCKED_BY_NETWORK" : "FAILED", failedStage: "endpoint", failureKind: endpoint.failureKind, endpoint };
  }
  const fail = (stage: string, detail: string, kind: FailureKind | null = null, extra: Partial<PipelineVerification> = {}): PipelineVerification => {
    stages.push({ name: stage, status: "FAIL", detail });
    return { ...base, ...extra, verdict: "FAILED", failedStage: stage, failureKind: kind, endpoint };
  };

  // 2. Real ingestion through the production pipeline into the (throwaway) database.
  const source = await prisma.source.create({
    data: { slug: `verify-${t.slug}-${now.getTime().toString(36)}`, name: `Verification: ${t.label ?? t.slug}`, organization: "verification run", kind: t.kind ?? "OFFICIAL", adapter: t.adapter, url: t.url, enabled: false, notes: "Created by npm run verify:sources" },
  });
  const first = await runSource(source.id, "TEST", { maxPages: opts.maxPages ?? 1 });
  if (first.status === "FAILED") return fail("ingest", `run failed: ${first.failureKind}: ${first.error}`, first.failureKind);
  if (first.itemsNew < 1) return fail("ingest", `run ${first.status} but stored 0 records (fetched ${first.itemsFetched}, duplicates ${first.itemsDuplicate}, item errors ${first.itemsFailed}) — reachable is not enough`);
  stages.push({ name: "ingest", status: first.itemsFailed ? "WARN" : "PASS", detail: `${first.status}: fetched ${first.itemsFetched}, stored ${first.itemsNew}, item errors ${first.itemsFailed}` });

  // 3. Persistence: rows really exist with provenance and timestamps.
  const rows = await prisma.sourceArticle.findMany({ where: { sourceId: source.id }, include: { claims: { select: { claimType: true } } } });
  const badRows = rows.filter((r) => !r.title || !/^https?:\/\//.test(r.url) || r.origin !== "INGESTED" || r.sourceType !== (t.kind ?? "OFFICIAL") || !r.ingestionRunId);
  if (rows.length !== first.itemsNew) return fail("persistence", `run reported ${first.itemsNew} new records but ${rows.length} rows are in the database`);
  if (badRows.length) return fail("persistence", `${badRows.length} stored rows lack title/url/origin/provenance (e.g. ${badRows[0]!.id})`);
  stages.push({ name: "persistence", status: "PASS", detail: `${rows.length} rows stored with URL, publisher type, origin=INGESTED, run id, publication + retrieval times` });

  // 4. Extraction quality.
  const tol = now.getTime() + 86400_000;
  const extraction = {
    total: rows.length,
    withCountry: rows.filter((r) => safeJson<string[]>(r.countryCodes, []).length > 0).length,
    withDisease: rows.filter((r) => safeJson<string[]>(r.diseaseSlugs, []).length > 0).length,
    withUnknownCauseFlag: rows.filter((r) => r.claims.some((c) => c.claimType === "PATHOGEN_ID")).length,
    withEventDate: rows.filter((r) => r.eventDate).length,
    validPublishedAt: rows.filter((r) => !Number.isNaN(r.publishedAt.getTime()) && r.publishedAt.getTime() <= tol && r.publishedAt.getFullYear() >= 1990).length,
  };
  const samples = rows.slice(0, 5).map((r) => ({ title: r.title, publishedAt: r.publishedAt.toISOString(), url: r.url, countries: safeJson<string[]>(r.countryCodes, []), diseases: safeJson<string[]>(r.diseaseSlugs, []), contentType: r.contentType, outbreakRelevant: r.outbreakRelevant }));
  const contentTypes: Record<string, number> = {};
  for (const r of rows) contentTypes[r.contentType] = (contentTypes[r.contentType] ?? 0) + 1;
  base.contentTypes = contentTypes as never;
  const th = THRESHOLDS[t.adapter] ?? THRESHOLDS.RSS!;
  const dates = extraction.validPublishedAt === extraction.total;
  stages.push({ name: "dates", status: dates ? "PASS" : "FAIL", detail: `${pct(extraction.validPublishedAt, extraction.total)} valid publication dates; ${pct(extraction.withEventDate, extraction.total)} with an explicit event date in text` });
  if (!dates) return fail("dates", `${extraction.total - extraction.validPublishedAt} records have invalid or future publication dates`, "SCHEMA_MISMATCH", { extraction, samples, stored: rows.length });
  // Extraction quality is judged on outbreak-relevant records: guidance, podcasts and corporate items legitimately
  // name no outbreak location.
  const relevant = rows.filter((r) => r.outbreakRelevant);
  const relCountry = relevant.filter((r) => safeJson<string[]>(r.countryCodes, []).length > 0).length;
  const relDisease = relevant.filter((r) => safeJson<string[]>(r.diseaseSlugs, []).length > 0 || r.claims.some((c) => c.claimType === "PATHOGEN_ID")).length;
  const denom = Math.max(1, relevant.length);
  const geoOk = relevant.length === 0 ? !th.fail : relCountry / denom >= th.country;
  const disOk = relevant.length === 0 ? !th.fail : relDisease / denom >= th.disease;
  stages.push({ name: "classification", status: relevant.length || !th.fail ? "PASS" : "FAIL", detail: `${relevant.length} of ${rows.length} records outbreak-relevant; ${Object.entries(contentTypes).map(([k, v]) => `${k} ${v}`).join(", ")}` });
  const missingGeo = rows.filter((r) => r.outbreakRelevant && safeJson<string[]>(r.countryCodes, []).length === 0).slice(0, 3).map((r) => `"${r.title.slice(0, 70)}"`);
  stages.push({ name: "geography", status: geoOk ? "PASS" : th.fail ? "FAIL" : "WARN", detail: `${pct(relCountry, relevant.length)} of outbreak-relevant records with an event country (threshold ${Math.round(th.country * 100)}%); ${pct(extraction.withCountry, extraction.total)} of all records${!geoOk && missingGeo.length ? `; e.g. no country in ${missingGeo.join(", ")}` : ""}` });
  stages.push({ name: "disease", status: disOk ? "PASS" : th.fail ? "FAIL" : "WARN", detail: `${pct(relDisease, relevant.length)} of outbreak-relevant records with a recognised disease or unknown-cause flag (threshold ${Math.round(th.disease * 100)}%); ${pct(extraction.withDisease, extraction.total)} of all records` });
  if (th.fail && (!geoOk || !disOk)) {
    return { ...base, stored: rows.length, extraction, samples, verdict: "FAILED", failedStage: !geoOk ? "geography" : "disease", failureKind: null, endpoint };
  }

  // 5. Deduplication: an immediate second run must store nothing new.
  const second = await runSource(source.id, "TEST", { maxPages: opts.maxPages ?? 1 });
  const after = await prisma.sourceArticle.count({ where: { sourceId: source.id } });
  if (second.status === "FAILED") return fail("dedupe", `second run failed: ${second.failureKind}: ${second.error}`, second.failureKind, { extraction, samples, stored: rows.length });
  if (second.itemsNew !== 0 || after !== rows.length) return fail("dedupe", `second run stored ${second.itemsNew} new records (rows ${rows.length} → ${after})`, null, { extraction, samples, stored: rows.length });
  stages.push({ name: "dedupe", status: "PASS", detail: `second run: ${second.itemsFetched} fetched, 0 new, ${second.itemsDuplicate} duplicates; row count unchanged (${after})` });

  return { ...base, stored: rows.length, extraction, samples, contentTypes, verdict: "PIPELINE_VERIFIED", failedStage: null, failureKind: null, endpoint };
}
