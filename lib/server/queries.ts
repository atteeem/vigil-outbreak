// Read model for the public UI. Every query takes `asOf` (null = live). Historical views only include rows
// whose PUBLICATION time is <= asOf, and verdicts (verification, reclassification) reached later are hidden.
import { prisma, containsCI } from "@/lib/db";
import { summarizeCases, seriesFor, verificationAt, type CaseSummary } from "@/lib/domain/stats";
import { isConfirmedActive, isInvestigation, CLASSIFICATIONS, type Metric } from "@/lib/domain/enums";
import { countryName } from "@/lib/geo/countries";
import { safeJson } from "@/lib/ingestion/pipeline";
import { computeLiveStatus, type LiveStatus } from "@/lib/domain/live-status";
import type { Prisma } from "@prisma/client";

export interface OutbreakFilters {
  disease?: string | null;
  country?: string | null;
  classification?: string[] | null;
  q?: string | null;
  /** Only outbreaks with activity in the last N days (relative to asOf / now). */
  sinceDays?: number | null;
}

export function parseFilters(sp: URLSearchParams): OutbreakFilters {
  const cls = sp.get("status")?.split(",").filter((c) => (CLASSIFICATIONS as readonly string[]).includes(c)) ?? null;
  const since = Number(sp.get("since"));
  return {
    disease: sp.get("disease") || null,
    country: sp.get("country")?.toUpperCase() || null,
    classification: cls && cls.length ? cls : null,
    q: sp.get("q")?.trim() || null,
    sinceDays: Number.isFinite(since) && since > 0 ? since : null,
  };
}

const lte = (asOf: Date | null) => (asOf ? { lte: asOf } : undefined);

const outbreakInclude = (asOf: Date | null) =>
  ({
    disease: true,
    suspectedDisease: true,
    locations: { where: asOf ? { firstReportedAt: { lte: asOf } } : undefined },
    observations: { where: asOf ? { reportedAt: { lte: asOf } } : undefined },
    statusHistory: { where: asOf ? { effectiveAt: { lte: asOf } } : undefined, orderBy: { effectiveAt: "asc" } },
    updates: { where: asOf ? { publishedAt: { lte: asOf } } : undefined, orderBy: { publishedAt: "desc" } },
    _count: { select: { articles: asOf ? { where: { publishedAt: { lte: asOf } } } : true } },
  }) satisfies Prisma.OutbreakInclude;

type OutbreakRow = Prisma.OutbreakGetPayload<{ include: ReturnType<typeof outbreakInclude> }>;

export interface DiseaseDTO {
  slug: string;
  name: string;
  pathogen: string | null;
  pathogenType: string;
  category: string;
}

export interface OutbreakSummaryDTO {
  id: string;
  slug: string;
  title: string;
  summary: string;
  classification: string;
  pathogenStatus: string;
  disease: DiseaseDTO | null;
  suspectedDisease: DiseaseDTO | null;
  countryCode: string;
  countryName: string;
  firstReportedAt: string;
  lastActivityAt: string;
  featured: boolean;
  locations: { name: string; admin1: string | null; lat: number; lng: number; precision: string; role: string; notes: string | null }[];
  cases: CaseSummary;
  latestUpdate: { title: string; publishedAt: string; verificationStatus: string } | null;
  articleCount: number;
}

const diseaseDto = (d: { slug: string; name: string; pathogen: string | null; pathogenType: string; category: string } | null): DiseaseDTO | null =>
  d ? { slug: d.slug, name: d.name, pathogen: d.pathogen, pathogenType: d.pathogenType, category: d.category } : null;

/** Applies "what was known at asOf" to an outbreak row. */
function resolveOutbreak(o: OutbreakRow, asOf: Date | null): OutbreakSummaryDTO {
  const lastStatus = o.statusHistory.at(-1);
  const classification = asOf ? (lastStatus?.toClassification ?? o.statusHistory[0]?.toClassification ?? o.classification) : o.classification;
  const pathogenStatus = asOf ? (lastStatus?.toPathogenStatus ?? o.pathogenStatus) : o.pathogenStatus;
  const latestUpdate = o.updates[0] ?? null;
  // Current narrative text may contain facts reported after asOf, so a historical view shows the latest update
  // that was public at the time instead.
  const summary = asOf ? (latestUpdate ? `${latestUpdate.title}. ${latestUpdate.body}` : "No public developments recorded at this time.") : o.summary;
  const activity = [o.firstReportedAt, ...o.updates.map((u) => u.publishedAt), ...o.observations.map((x) => x.reportedAt), ...o.statusHistory.map((s) => s.effectiveAt)];
  const lastActivity = new Date(Math.max(...activity.map((d) => d.getTime())));
  return {
    id: o.id,
    slug: o.slug,
    title: o.title,
    summary,
    classification,
    pathogenStatus,
    disease: pathogenStatus === "CONFIRMED" ? diseaseDto(o.disease) : null,
    suspectedDisease: pathogenStatus !== "CONFIRMED" ? diseaseDto(o.suspectedDisease) : null,
    countryCode: o.countryCode,
    countryName: o.countryName,
    firstReportedAt: o.firstReportedAt.toISOString(),
    lastActivityAt: lastActivity.toISOString(),
    featured: o.featured,
    locations: o.locations.map((l) => ({ name: l.name, admin1: l.admin1, lat: l.lat, lng: l.lng, precision: l.precision, role: l.role, notes: l.notes })),
    cases: summarizeCases(o.observations, asOf),
    latestUpdate: latestUpdate ? { title: latestUpdate.title, publishedAt: latestUpdate.publishedAt.toISOString(), verificationStatus: verificationAt(latestUpdate.verificationStatus, latestUpdate.verifiedAt, asOf) } : null,
    articleCount: o._count.articles,
  };
}

function matchesFilters(o: OutbreakSummaryDTO, f: OutbreakFilters, ref: Date): boolean {
  if (f.disease) {
    const slugs = [o.disease?.slug, o.suspectedDisease?.slug];
    if (f.disease === "unknown") {
      if (o.disease) return false;
    } else if (!slugs.includes(f.disease)) return false;
  }
  if (f.country && o.countryCode !== f.country) return false;
  if (f.classification && !f.classification.includes(o.classification)) return false;
  if (f.sinceDays && ref.getTime() - new Date(o.lastActivityAt).getTime() > f.sinceDays * 86400_000) return false;
  if (f.q) {
    const hay = `${o.title} ${o.summary} ${o.countryName} ${o.disease?.name ?? ""} ${o.suspectedDisease?.name ?? ""} ${o.locations.map((l) => l.name).join(" ")}`.toLowerCase();
    if (!f.q.toLowerCase().split(/\s+/).every((t) => hay.includes(t))) return false;
  }
  return true;
}

export async function listOutbreaks(asOf: Date | null, filters: OutbreakFilters = {}): Promise<OutbreakSummaryDTO[]> {
  const rows = await prisma.outbreak.findMany({
    where: { published: true, mergedIntoId: null, firstReportedAt: lte(asOf) },
    include: outbreakInclude(asOf),
  });
  const ref = asOf ?? new Date();
  const order = (o: OutbreakSummaryDTO) => (o.featured ? 0 : 1);
  return rows
    .map((r) => resolveOutbreak(r, asOf))
    .filter((o) => matchesFilters(o, filters, ref))
    .sort((a, b) => order(a) - order(b) || b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export interface FeedItemDTO {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  organization: string;
  sourceType: string;
  publishedAt: string;
  fetchedAt: string;
  countries: { code: string; name: string }[];
  diseases: { slug: string; name: string }[];
  unknownCause: boolean;
  summary: string | null;
  verificationStatus: string;
  reviewStatus: string;
  /** SEED | INGESTED | MANUAL — distinguishes hand-compiled seed data from automatically retrieved items. */
  origin: string;
  outbreak: { slug: string; title: string } | null;
}

export async function listFeed(asOf: Date | null, filters: OutbreakFilters & { sourceType?: string | null } = {}, limit = 40): Promise<FeedItemDTO[]> {
  const where: Prisma.SourceArticleWhereInput = {
    publishedAt: lte(asOf),
    // Public feed: analyst-accepted items, plus official publications awaiting review (labelled as such).
    // Media items are not shown until accepted; rejected and duplicate items never.
    OR: [{ reviewStatus: "ACCEPTED" }, { reviewStatus: "PENDING", sourceType: "OFFICIAL" }],
    ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
  };
  const [rows, diseases] = await Promise.all([
    prisma.sourceArticle.findMany({ where, orderBy: { publishedAt: "desc" }, take: 400, include: { source: true, outbreak: { select: { slug: true, title: true, published: true, firstReportedAt: true } }, claims: { where: { claimType: "PATHOGEN_ID" }, select: { id: true } } } }),
    prisma.disease.findMany({ select: { slug: true, name: true } }),
  ]);
  const dName = new Map(diseases.map((d) => [d.slug, d.name]));
  const items: FeedItemDTO[] = [];
  for (const r of rows) {
    const cc = safeJson<string[]>(r.countryCodes, []);
    const ds = safeJson<string[]>(r.diseaseSlugs, []);
    if (filters.country && !cc.includes(filters.country)) continue;
    if (filters.disease && filters.disease !== "unknown" && !ds.includes(filters.disease)) continue;
    if (filters.disease === "unknown" && ds.length) continue;
    if (filters.q && !`${r.title} ${r.summary ?? ""}`.toLowerCase().includes(filters.q.toLowerCase())) continue;
    const outbreakVisible = r.outbreak && r.outbreak.published && (!asOf || r.outbreak.firstReportedAt <= asOf);
    items.push({
      id: r.id,
      title: r.title,
      url: r.url,
      sourceName: r.source.name,
      organization: r.source.organization,
      sourceType: r.sourceType,
      publishedAt: r.publishedAt.toISOString(),
      fetchedAt: r.fetchedAt.toISOString(),
      countries: cc.map((code) => ({ code, name: countryName(code) })),
      diseases: ds.map((slug) => ({ slug, name: dName.get(slug) ?? slug })),
      unknownCause: r.claims.length > 0 || ds.length === 0,
      summary: r.summary,
      verificationStatus: r.verificationStatus,
      reviewStatus: r.reviewStatus,
      origin: r.origin,
      outbreak: outbreakVisible ? { slug: r.outbreak!.slug, title: r.outbreak!.title } : null,
    });
    if (items.length >= limit) break;
  }
  return items;
}

export interface FreshnessDTO {
  /** Last success of a REAL automatic source (fixture/localhost sources never count). */
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  live: LiveStatus;
  sources: { slug: string; name: string; url: string | null; adapter: string; enabled: boolean; endpointStatus: string; lastSuccessAt: string | null; lastFetchAt: string | null; lastError: string | null; lastErrorKind: string | null; lastVerifiedAt: string | null; pollIntervalMinutes: number }[];
}

export async function getFreshness(now = new Date()): Promise<FreshnessDTO> {
  const [sources, beat] = await Promise.all([
    prisma.source.findMany({ where: { adapter: { not: "MANUAL" } }, orderBy: { name: "asc" } }),
    prisma.workerHeartbeat.findFirst({ orderBy: { lastTickAt: "desc" } }),
  ]);
  const live = computeLiveStatus(sources, now, beat);
  return {
    lastSuccessAt: live.lastLiveSuccessAt,
    lastAttemptAt: live.lastLiveAttemptAt,
    live,
    sources: sources.map((s) => ({ slug: s.slug, name: s.name, url: s.url, adapter: s.adapter, enabled: s.enabled, endpointStatus: s.endpointStatus, lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null, lastFetchAt: s.lastFetchAt?.toISOString() ?? null, lastError: s.lastError, lastErrorKind: s.lastErrorKind, lastVerifiedAt: s.lastVerifiedAt?.toISOString() ?? null, pollIntervalMinutes: s.pollIntervalMinutes })),
  };
}

export interface DashboardDTO {
  asOf: string | null;
  generatedAt: string;
  kpis: { monitoredInvestigations: number; confirmedActive: number; newReports24h: number; countriesWithActivity: number; lastSuccessfulRefresh: string | null; lastAttempt: string | null };
  live: LiveStatus;
  /** Share of visible source articles by origin (seeded vs automatically ingested vs manual). */
  origins: { SEED: number; INGESTED: number; MANUAL: number };
  outbreaks: OutbreakSummaryDTO[];
  totalOutbreaks: number;
  feed: FeedItemDTO[];
  developments: { id: string; outbreakSlug: string; outbreakTitle: string; title: string; kind: string; publishedAt: string; sourceType: string; attributedTo: string | null }[];
  trend: { day: string; official: number; media: number }[];
  diseases: { slug: string; name: string; count: number }[];
  countries: { code: string; name: string }[];
}

export async function getDashboard(asOf: Date | null, filters: OutbreakFilters = {}): Promise<DashboardDTO> {
  const ref = asOf ?? new Date();
  const [all, filtered, feed, freshness, recentArticles, updates, originCounts] = await Promise.all([
    listOutbreaks(asOf, {}),
    listOutbreaks(asOf, filters),
    listFeed(asOf, filters, 25),
    getFreshness(),
    prisma.sourceArticle.findMany({
      where: { publishedAt: { gte: new Date(ref.getTime() - 30 * 86400_000), lte: ref }, reviewStatus: { in: ["ACCEPTED", "PENDING"] } },
      select: { publishedAt: true, sourceType: true },
    }),
    prisma.outbreakUpdate.findMany({
      where: { publishedAt: lte(asOf), outbreak: { published: true, mergedIntoId: null } },
      orderBy: { publishedAt: "desc" },
      take: 40,
      include: { outbreak: { select: { slug: true, title: true } } },
    }),
    prisma.sourceArticle.groupBy({ by: ["origin"], where: { publishedAt: lte(asOf), reviewStatus: { in: ["ACCEPTED", "PENDING"] } }, _count: true }),
  ]);
  const active = all.filter((o) => o.classification !== "RESOLVED");
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const days: DashboardDTO["trend"] = [];
  for (let i = 29; i >= 0; i--) days.push({ day: dayKey(new Date(ref.getTime() - i * 86400_000)), official: 0, media: 0 });
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const a of recentArticles) {
    const b = byDay.get(dayKey(a.publishedAt));
    if (b) b[a.sourceType === "OFFICIAL" ? "official" : "media"]++;
  }
  const diseaseCounts = new Map<string, { slug: string; name: string; count: number }>();
  for (const o of all) {
    const d = o.disease ?? o.suspectedDisease;
    const key = o.disease ? o.disease.slug : "unknown";
    const name = o.disease ? o.disease.name : "Unconfirmed / unknown cause";
    const cur = diseaseCounts.get(key) ?? { slug: key, name, count: 0 };
    cur.count++;
    diseaseCounts.set(key, cur);
    if (!o.disease && d) {
      const s = diseaseCounts.get(d.slug) ?? { slug: d.slug, name: `${d.name} (suspected)`, count: 0 };
      diseaseCounts.set(d.slug, s);
    }
  }
  const verifiedDevelopments = updates
    .filter((u) => verificationAt(u.verificationStatus, u.verifiedAt, asOf) === "VERIFIED")
    .slice(0, 8)
    .map((u) => ({ id: u.id, outbreakSlug: u.outbreak.slug, outbreakTitle: u.outbreak.title, title: u.title, kind: u.kind, publishedAt: u.publishedAt.toISOString(), sourceType: u.sourceType, attributedTo: u.attributedTo }));
  return {
    asOf: asOf?.toISOString() ?? null,
    generatedAt: new Date().toISOString(),
    kpis: {
      monitoredInvestigations: all.filter((o) => isInvestigation(o.classification)).length,
      confirmedActive: all.filter((o) => isConfirmedActive(o.classification)).length,
      newReports24h: recentArticles.filter((a) => a.publishedAt.getTime() > ref.getTime() - 86400_000).length,
      countriesWithActivity: new Set(active.map((o) => o.countryCode)).size,
      // A historical view still shows the real ingestion freshness — it describes the system, not the past.
      lastSuccessfulRefresh: freshness.lastSuccessAt,
      lastAttempt: freshness.lastAttemptAt,
    },
    live: freshness.live,
    origins: { SEED: 0, INGESTED: 0, MANUAL: 0, ...Object.fromEntries(originCounts.map((o) => [o.origin, o._count])) },
    outbreaks: filtered,
    totalOutbreaks: all.length,
    feed,
    developments: verifiedDevelopments,
    trend: days,
    diseases: [...diseaseCounts.values()].sort((a, b) => b.count - a.count),
    countries: [...new Map(all.map((o) => [o.countryCode, { code: o.countryCode, name: o.countryName }])).values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function getOutbreakDetail(slug: string, asOf: Date | null) {
  const o = await prisma.outbreak.findFirst({
    where: { slug, published: true },
    include: {
      ...outbreakInclude(asOf),
      mergedInto: { select: { slug: true, title: true } },
      mergedFrom: { select: { slug: true, title: true } },
      riskAssessments: { where: asOf ? { publishedAt: { lte: asOf } } : undefined, orderBy: { publishedAt: "desc" }, include: { sourceArticle: { include: { source: true } } } },
      claims: { where: asOf ? { publishedAt: { lte: asOf } } : undefined, orderBy: { publishedAt: "asc" }, include: { article: { include: { source: true } } } },
      articles: { where: { publishedAt: lte(asOf), reviewStatus: { in: ["ACCEPTED", "PENDING"] } }, orderBy: { publishedAt: "desc" }, include: { source: true } },
    },
  });
  if (!o) return null;
  if (asOf && o.firstReportedAt > asOf) return { notYetReported: true as const, slug, title: o.title, firstReportedAt: o.firstReportedAt.toISOString() };
  const base = resolveOutbreak(o, asOf);
  const articleRef = (a: { url: string; title: string; publishedAt: Date; source: { name: string } } | null | undefined) => (a ? { url: a.url, title: a.title, sourceName: a.source.name, publishedAt: a.publishedAt.toISOString() } : null);
  const articlesById = new Map(o.articles.map((a) => [a.id, a]));
  const observations = o.observations
    .sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime())
    .map((x) => ({ id: x.id, metric: x.metric, value: x.value, valueHigh: x.valueHigh, isCumulative: x.isCumulative, deathCauseConfirmed: x.deathCauseConfirmed, scope: x.scope, asOfDate: x.asOfDate?.toISOString() ?? null, reportedAt: x.reportedAt.toISOString(), sourceType: x.sourceType, verificationStatus: verificationAt(x.verificationStatus, x.verifiedAt, asOf), attributedTo: x.attributedTo, notes: x.notes, source: articleRef(x.sourceArticleId ? articlesById.get(x.sourceArticleId) : null) }));
  const updates = o.updates.map((u) => ({ id: u.id, kind: u.kind, title: u.title, body: u.body, occurredAt: u.occurredAt?.toISOString() ?? null, publishedAt: u.publishedAt.toISOString(), sourceType: u.sourceType, verificationStatus: verificationAt(u.verificationStatus, u.verifiedAt, asOf), attributedTo: u.attributedTo, source: articleRef(u.sourceArticleId ? articlesById.get(u.sourceArticleId) : null) }));
  const chronology = [...updates].sort((a, b) => (a.occurredAt ?? a.publishedAt).localeCompare(b.occurredAt ?? b.publishedAt));
  const claims = o.claims.map((c) => ({ id: c.id, claimType: c.claimType, text: c.text, metric: c.metric, value: c.value, attributedTo: c.attributedTo, sourceType: c.sourceType, verificationStatus: verificationAt(c.verificationStatus, c.reviewedAt, asOf), conflictNote: c.conflictNote, publishedAt: c.publishedAt.toISOString(), source: articleRef(c.article) }));
  const series = (m: Metric) => seriesFor(o.observations, m, asOf).map((p) => ({ t: new Date(p.t).toISOString(), value: p.value }));
  return {
    notYetReported: false as const,
    ...base,
    eventStartDate: o.eventStartDate?.toISOString() ?? null,
    lastVerifiedAt: asOf ? null : (o.lastVerifiedAt?.toISOString() ?? null),
    resolvedAt: o.resolvedAt && (!asOf || o.resolvedAt <= asOf) ? o.resolvedAt.toISOString() : null,
    diseaseFull: o.disease ? { ...diseaseDto(o.disease)!, description: o.disease.description } : null,
    suspectedDiseaseFull: o.suspectedDisease ? { ...diseaseDto(o.suspectedDisease)!, description: o.suspectedDisease.description } : null,
    mergedInto: o.mergedInto,
    mergedFrom: o.mergedFrom,
    statusHistory: o.statusHistory.map((s) => ({ id: s.id, from: s.fromClassification, to: s.toClassification, fromPathogen: s.fromPathogenStatus, toPathogen: s.toPathogenStatus, reason: s.reason, effectiveAt: s.effectiveAt.toISOString() })),
    observations,
    updates,
    chronology,
    confirmedFacts: claims.filter((c) => c.verificationStatus === "VERIFIED"),
    unverifiedReports: claims.filter((c) => c.verificationStatus === "UNVERIFIED"),
    contradictions: claims.filter((c) => c.verificationStatus === "DISPUTED" || c.verificationStatus === "REFUTED" || c.conflictNote),
    officialStatements: updates.filter((u) => u.kind === "OFFICIAL_STATEMENT" && u.sourceType === "OFFICIAL"),
    measures: updates.filter((u) => u.kind === "MEASURE"),
    riskAssessments: o.riskAssessments.map((r) => ({ id: r.id, organization: r.organization, scope: r.scope, level: r.level, statement: r.statement, publishedAt: r.publishedAt.toISOString(), verificationStatus: r.verificationStatus, source: articleRef(r.sourceArticle) })),
    sources: o.articles.map((a) => ({ id: a.id, url: a.url, title: a.title, sourceName: a.source.name, organization: a.source.organization, sourceType: a.sourceType, publishedAt: a.publishedAt.toISOString(), fetchedAt: a.fetchedAt.toISOString(), verificationStatus: a.verificationStatus, origin: a.origin, primaryValidatedAt: a.primaryValidatedAt?.toISOString() ?? null })),
    series: { CONFIRMED_CASES: series("CONFIRMED_CASES"), SUSPECTED_CASES: series("SUSPECTED_CASES"), DEATHS: series("DEATHS") },
    validation: (() => {
      // Facts resting on hand-compiled (seed/manual) articles that nobody has yet checked against the primary
      // publication. They stay labelled until an analyst marks the article validated.
      const pending = o.articles.filter((a) => a.origin !== "INGESTED" && !a.primaryValidatedAt);
      const deps = (id: string) => [
        ...o.observations.filter((x) => x.sourceArticleId === id).map((x) => `Figure: ${x.metric.replace(/_/g, " ").toLowerCase()} ${x.value ?? "n/r"}${x.valueHigh ? `–${x.valueHigh}` : ""} (${x.attributedTo ?? "unattributed"})`),
        ...o.updates.filter((u) => u.sourceArticleId === id).map((u) => `Chronology: ${u.title}`),
        ...o.claims.filter((c) => c.articleId === id).map((c) => `Claim: ${c.text}`),
        ...o.riskAssessments.filter((r) => r.sourceArticleId === id).map((r) => `Risk assessment: ${r.organization} — ${r.scope}`),
      ];
      return {
        pending: pending.map((a) => ({ articleId: a.id, title: a.title, url: a.url, sourceName: a.source.name, sourceType: a.sourceType, origin: a.origin, dependents: deps(a.id) })),
        unsourcedRiskAssessments: o.riskAssessments.filter((r) => !r.sourceArticleId).map((r) => `${r.organization} — ${r.scope}: no publication linked`),
        validatedCount: o.articles.filter((a) => a.origin !== "INGESTED" && a.primaryValidatedAt).length,
        ingestedCount: o.articles.filter((a) => a.origin === "INGESTED").length,
      };
    })(),
  };
}

export type OutbreakDetailResult = Exclude<Awaited<ReturnType<typeof getOutbreakDetail>>, null>;
export type OutbreakDetailDTO = Extract<OutbreakDetailResult, { notYetReported: false }>;

export async function getAnalytics() {
  const outbreaks = await prisma.outbreak.findMany({ where: { published: true, mergedIntoId: null }, include: { observations: true, disease: true, suspectedDisease: true } });
  const metricSeries = (m: Metric) =>
    outbreaks
      .map((o) => ({ slug: o.slug, title: o.title, points: seriesFor(o.observations, m, null).map((p) => ({ t: p.t, value: p.value })) }))
      .filter((s) => s.points.length >= 2);
  const count = <K extends string>(keys: K[]) => {
    const m = new Map<K, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
  };
  const articles = await prisma.sourceArticle.findMany({ where: { reviewStatus: { in: ["ACCEPTED", "PENDING"] } }, select: { publishedAt: true, sourceType: true } });
  const weekKey = (d: Date) => {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
    return t.toISOString().slice(0, 10);
  };
  const weeks = new Map<string, { week: string; official: number; media: number }>();
  for (const a of articles) {
    const k = weekKey(a.publishedAt);
    const w = weeks.get(k) ?? { week: k, official: 0, media: 0 };
    w[a.sourceType === "OFFICIAL" ? "official" : "media"]++;
    weeks.set(k, w);
  }
  return {
    confirmed: metricSeries("CONFIRMED_CASES"),
    suspected: metricSeries("SUSPECTED_CASES"),
    deaths: metricSeries("DEATHS"),
    status: count(outbreaks.map((o) => o.classification)),
    categories: count(outbreaks.map((o) => (o.pathogenStatus === "CONFIRMED" && o.disease ? o.disease.category : "UNCONFIRMED"))),
    pathogenTypes: count(outbreaks.map((o) => (o.pathogenStatus === "CONFIRMED" && o.disease ? o.disease.pathogenType : "UNKNOWN"))),
    geography: count(outbreaks.map((o) => o.countryName)),
    reporting: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
    outbreakCount: outbreaks.length,
  };
}

export async function search(q: string) {
  const term = q.trim();
  if (term.length < 2) return { outbreaks: [], articles: [] };
  const [outbreaks, articles] = await Promise.all([
    listOutbreaks(null, { q: term }),
    prisma.sourceArticle.findMany({ where: { OR: [{ title: containsCI(term) }, { summary: containsCI(term) }], reviewStatus: { in: ["ACCEPTED", "PENDING"] } }, orderBy: { publishedAt: "desc" }, take: 8, include: { source: true, outbreak: { select: { slug: true } } } }),
  ]);
  return {
    outbreaks: outbreaks.slice(0, 8).map((o) => ({ slug: o.slug, title: o.title, classification: o.classification, countryName: o.countryName })),
    articles: articles.filter((a) => a.reviewStatus === "ACCEPTED" || a.sourceType === "OFFICIAL").map((a) => ({ id: a.id, title: a.title, url: a.url, sourceName: a.source.name, publishedAt: a.publishedAt.toISOString(), outbreakSlug: a.outbreak?.slug ?? null })),
  };
}
