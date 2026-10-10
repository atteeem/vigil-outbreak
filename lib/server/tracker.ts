// The focused tracker: everything the main dashboard, map and timeline show about the primary tracked event
// (the Irkutsk investigation). Built on getOutbreakDetail and the same counting rules as the rest of the app:
//  - a headline figure is only ever an OFFICIAL + VERIFIED cumulative observation; anything else is labelled;
//  - unknown stays unknown (null), never zero;
//  - no rates, fatality ratios or projections are computed;
//  - historical views (asOf) only show what had been published by then, with the verdicts known by then.
import { prisma } from "@/lib/db";
import { getOutbreakDetail, listFeed, type OutbreakDetailDTO, type FeedItemDTO } from "@/lib/server/queries";
import { headlineFor, verificationAt, visibleAt } from "@/lib/domain/stats";
import { CLASSIFICATION_LABEL, PATHOGEN_STATUS_LABEL, type Classification, type Metric, type PathogenStatus } from "@/lib/domain/enums";
import { assessSpread, categoryFor, isCaseRole, LOCATION_ROLE_LABEL, type LocationRole, type SpreadAssessment, type TimelineCategory } from "@/lib/tracked/timeline";
import { PRIORITY_TOPICS } from "@/lib/tracked/relevance";
import { countryName } from "@/lib/geo/countries";

export async function getPrimaryTrackedEvent() {
  return prisma.trackedEvent.findFirst({ where: { active: true, outbreak: { published: true, mergedIntoId: null } }, orderBy: [{ primary: "desc" }, { createdAt: "asc" }], include: { outbreak: { select: { id: true, slug: true, title: true } } } });
}

export type MetricState = "VERIFIED_OFFICIAL" | "UNVERIFIED" | "DISPUTED" | "UNKNOWN";
export interface TrackerMetric {
  key: Metric;
  label: string;
  /** What the shown value is: verified official figure, unverified/media report, disputed report, or unknown. */
  state: MetricState;
  value: number | null;
  valueHigh: number | null;
  /** Deaths only: has the cause been laboratory-attributed to the suspected pathogen? */
  deathCauseConfirmed: boolean | null;
  sourceType: string | null;
  attributedTo: string | null;
  reportedAt: string | null;
  asOfDate: string | null;
  scope: string | null;
  notes: string | null;
  source: { url: string; title: string; sourceName: string } | null;
  /** A newer unverified figure that differs from the verified headline (shown beside it, never merged). */
  newerUnverified: { value: number; valueHigh: number | null; attributedTo: string | null; reportedAt: string } | null;
  explanation: string;
}

const METRIC_ROWS: { key: Metric; label: string; unknown: string }[] = [
  { key: "CONFIRMED_CASES", label: "Laboratory-confirmed cases", unknown: "No authority has reported a laboratory-confirmed case." },
  { key: "SUSPECTED_CASES", label: "Suspected cases", unknown: "No suspected-case count has been reported." },
  { key: "DEATHS", label: "Deaths", unknown: "No deaths reported." },
  { key: "UNDER_OBSERVATION", label: "Contacts under observation", unknown: "No contact count reported." },
  { key: "HOSPITALIZED", label: "Hospitalised (incl. for observation)", unknown: "No hospitalisation count reported." },
  { key: "CONTACTS_TESTED_NEGATIVE", label: "Contacts tested negative", unknown: "No test count reported." },
];

export interface TimelineEntry {
  id: string;
  type: "update" | "status";
  category: TimelineCategory;
  kind: string;
  title: string;
  body: string;
  occurredAt: string | null;
  publishedAt: string;
  sourceType: string | null;
  verificationStatus: string;
  attributedTo: string | null;
  source: { url: string; title: string; sourceName: string } | null;
}

export interface TrackerLocation {
  id: string;
  name: string;
  admin1: string | null;
  countryCode: string;
  countryName: string;
  lat: number;
  lng: number;
  precision: string;
  role: LocationRole;
  roleLabel: string;
  isCase: boolean;
  verificationStatus: string;
  notes: string | null;
  evidence: string | null;
  firstReportedAt: string;
  source: { url: string; title: string; sourceName: string } | null;
}

export interface Finding {
  id: string;
  text: string;
  verificationStatus: string;
  sourceType: string;
  attributedTo: string | null;
  publishedAt: string;
  conflictNote: string | null;
  source: { url: string; title: string; sourceName: string } | null;
}

export interface TrackerDTO {
  generatedAt: string;
  asOf: string | null;
  event: { id: string; name: string; slug: string; originLabel: string; map: { lat: number; lng: number; zoom: number } };
  notYetReported: boolean;
  status: {
    title: string;
    summary: string;
    classification: string;
    classificationLabel: string;
    pathogenStatus: string;
    pathogenStatusLabel: string;
    suspectedDisease: { name: string; pathogen: string | null; pathogenType: string | null } | null;
    confirmedDisease: { name: string; pathogen: string | null } | null;
    pathogenStatement: string;
    firstReportedAt: string;
    eventStartDate: string | null;
    lastVerifiedAt: string | null;
    lastVerifiedUpdate: TimelineEntry | null;
    lastStatusChange: { effectiveAt: string; reason: string } | null;
  } | null;
  metrics: TrackerMetric[];
  labFindings: Finding[];
  hypotheses: Finding[];
  alternatives: Finding[];
  contradictions: Finding[];
  last24h: { since: string; entries: { type: string; title: string; at: string; verificationStatus: string | null; sourceType: string | null; href: string | null }[] };
  developments: TimelineEntry[];
  timeline: TimelineEntry[];
  locations: TrackerLocation[];
  spread: SpreadAssessment;
  intel: FeedItemDTO[];
  pendingReview: { tracked: number; material: number; possible: number };
  riskAssessments: OutbreakDetailDTO["riskAssessments"];
}

const ref = (a: { url: string; title: string; source: { name: string } } | null | undefined) => (a ? { url: a.url, title: a.title, sourceName: a.source.name } : null);
/** Laboratory findings: test results, not every mention of a laboratory. */
const LAB_RE = /\b(test(s|ed|ing)?(?! tube)|pcr|detected|negative|positive|samples?)\b/i;

export async function getTracker(asOf: Date | null, now = new Date()): Promise<TrackerDTO | null> {
  const ev = await getPrimaryTrackedEvent();
  if (!ev) return null;
  const detail = await getOutbreakDetail(ev.outbreak.slug, asOf);
  if (!detail) return null;
  const originLabel = [ev.originAdmin1, countryName(ev.originCountryCode)].filter(Boolean).join(", ");
  const event = { id: ev.id, name: ev.name, slug: ev.outbreak.slug, originLabel, map: { lat: ev.mapCenterLat, lng: ev.mapCenterLng, zoom: ev.mapZoom } };
  const emptySpread = assessSpread([], { countryCode: ev.originCountryCode, admin1: ev.originAdmin1 }, ev.originAdmin1 ?? countryName(ev.originCountryCode));
  const base: TrackerDTO = { generatedAt: now.toISOString(), asOf: asOf?.toISOString() ?? null, event, notYetReported: false, status: null, metrics: [], labFindings: [], hypotheses: [], alternatives: [], contradictions: [], last24h: { since: new Date((asOf ?? now).getTime() - 86400_000).toISOString(), entries: [] }, developments: [], timeline: [], locations: [], spread: emptySpread, intel: [], pendingReview: { tracked: 0, material: 0, possible: 0 }, riskAssessments: [] };
  if (detail.notYetReported) return { ...base, notYetReported: true };
  const d = detail;

  const [observations, locations, updatesRaw, pending] = await Promise.all([
    prisma.outbreakObservation.findMany({ where: { outbreakId: ev.outbreakId }, include: { sourceArticle: { include: { source: true } } } }),
    prisma.outbreakLocation.findMany({ where: { outbreakId: ev.outbreakId, ...(asOf ? { firstReportedAt: { lte: asOf } } : {}) }, include: { sourceArticle: { include: { source: true } } }, orderBy: { firstReportedAt: "asc" } }),
    prisma.outbreakUpdate.findMany({ where: { outbreakId: ev.outbreakId }, select: { id: true, category: true } }),
    asOf
      ? Promise.resolve([0, 0, 0])
      : Promise.all([
          prisma.sourceArticle.count({ where: { trackedEventId: ev.id, trackedLevel: "DIRECT", reviewStatus: "PENDING" } }),
          prisma.sourceArticle.count({ where: { trackedEventId: ev.id, materialChange: true, reviewStatus: "PENDING" } }),
          prisma.sourceArticle.count({ where: { trackedEventId: ev.id, trackedLevel: "POSSIBLE", reviewStatus: "PENDING" } }),
        ]),
  ]);
  const categoryOverride = new Map(updatesRaw.map((u) => [u.id, u.category]));

  // ---------------------------------------------------------------- metrics (each with source + timestamp)
  const visibleObs = visibleAt(observations, asOf);
  const metrics: TrackerMetric[] = METRIC_ROWS.map(({ key, label, unknown }) => {
    const h = headlineFor(visibleObs, key, asOf);
    const shown = h.confirmed ?? h.reported;
    if (!shown) return { key, label, state: "UNKNOWN", value: null, valueHigh: null, deathCauseConfirmed: null, sourceType: null, attributedTo: null, reportedAt: null, asOfDate: null, scope: null, notes: null, source: null, newerUnverified: null, explanation: unknown };
    const status = verificationAt(shown.verificationStatus, shown.verifiedAt, asOf);
    const state: MetricState = h.confirmed ? "VERIFIED_OFFICIAL" : status === "DISPUTED" ? "DISPUTED" : "UNVERIFIED";
    const newer = h.confirmed && h.reported && h.reported.value !== null && h.reported.reportedAt > h.confirmed.reportedAt ? h.reported : null;
    const explanation =
      state === "VERIFIED_OFFICIAL"
        ? key === "DEATHS" && shown.deathCauseConfirmed !== true
          ? "Official, verified. The cause of death has not been laboratory-confirmed."
          : "Official figure, verified by an analyst against the publication."
        : state === "DISPUTED"
          ? "Reported figure that is disputed by other sources."
          : `${shown.sourceType === "MEDIA" ? "Media" : "Official"} report, not verified. Shown for context only; not an official count.`;
    return {
      key, label, state, value: shown.value, valueHigh: shown.valueHigh ?? null, deathCauseConfirmed: key === "DEATHS" ? (shown.deathCauseConfirmed ?? null) : null,
      sourceType: shown.sourceType, attributedTo: shown.attributedTo, reportedAt: shown.reportedAt.toISOString(), asOfDate: shown.asOfDate?.toISOString() ?? null, scope: shown.scope, notes: shown.notes,
      source: ref(shown.sourceArticle),
      newerUnverified: newer ? { value: newer.value!, valueHigh: newer.valueHigh ?? null, attributedTo: newer.attributedTo, reportedAt: newer.reportedAt.toISOString() } : null,
      explanation,
    };
  });

  // ---------------------------------------------------------------- timeline (occurred vs reported, as known at asOf)
  const updates: TimelineEntry[] = d.updates.map((u) => ({
    id: u.id, type: "update", kind: u.kind, category: categoryFor({ kind: u.kind, title: u.title, body: u.body, category: categoryOverride.get(u.id) ?? null }),
    title: u.title, body: u.body, occurredAt: u.occurredAt, publishedAt: u.publishedAt, sourceType: u.sourceType, verificationStatus: u.verificationStatus, attributedTo: u.attributedTo,
    source: u.source ? { url: u.source.url, title: u.source.title, sourceName: u.source.sourceName } : null,
  }));
  const statusEntries: TimelineEntry[] = d.statusHistory.map((s) => ({
    id: s.id, type: "status", kind: "RECLASSIFICATION", category: "STATUS",
    title: s.from ? `Status: ${CLASSIFICATION_LABEL[s.from as Classification] ?? s.from} → ${CLASSIFICATION_LABEL[s.to as Classification] ?? s.to}${s.fromPathogen !== s.toPathogen ? ` · pathogen ${PATHOGEN_STATUS_LABEL[s.toPathogen as PathogenStatus] ?? s.toPathogen}` : ""}` : `Investigation opened: ${CLASSIFICATION_LABEL[s.to as Classification] ?? s.to}`,
    body: s.reason, occurredAt: s.effectiveAt, publishedAt: s.effectiveAt, sourceType: null, verificationStatus: "VERIFIED", attributedTo: "Analyst status record", source: null,
  }));
  const timeline = [...updates, ...statusEntries].sort((a, b) => (a.occurredAt ?? a.publishedAt).localeCompare(b.occurredAt ?? b.publishedAt) || a.publishedAt.localeCompare(b.publishedAt));
  const developments = [...updates].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 6);
  const lastVerifiedUpdate = [...updates].filter((u) => u.verificationStatus === "VERIFIED").sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0] ?? null;

  // ---------------------------------------------------------------- findings, kept apart on purpose
  const claimToFinding = (c: OutbreakDetailDTO["confirmedFacts"][number]): Finding => ({ id: c.id, text: c.text, verificationStatus: c.verificationStatus, sourceType: c.sourceType, attributedTo: c.attributedTo, publishedAt: c.publishedAt, conflictNote: c.conflictNote, source: c.source ? { url: c.source.url, title: c.source.title, sourceName: c.source.sourceName } : null });
  const allClaims = [...d.confirmedFacts, ...d.unverifiedReports, ...d.contradictions].filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const hypotheses = allClaims.filter((c) => c.claimType === "PATHOGEN_ID").map(claimToFinding);
  const labFindings = [
    ...allClaims.filter((c) => c.claimType !== "PATHOGEN_ID" && c.claimType !== "OTHER" && LAB_RE.test(c.text)).map(claimToFinding),
    ...updates.filter((u) => u.category === "TESTING").map((u): Finding => ({ id: u.id, text: `${u.title}. ${u.body}`, verificationStatus: u.verificationStatus, sourceType: u.sourceType ?? "OFFICIAL", attributedTo: u.attributedTo, publishedAt: u.publishedAt, conflictNote: null, source: u.source })),
  ].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const alternatives = allClaims.filter((c) => c.claimType === "OTHER").map(claimToFinding);
  const contradictions = d.contradictions.map(claimToFinding);

  const sd = d.suspectedDiseaseFull;
  const cd = d.diseaseFull;
  const pathogenStatement = cd && d.pathogenStatus === "CONFIRMED"
    ? `${cd.name}${cd.pathogen ? ` (${cd.pathogen})` : ""} has been laboratory-confirmed.`
    : `No pathogen has been laboratory-confirmed.${sd ? ` ${sd.name}${sd.pathogen ? ` (${sd.pathogen}${sd.pathogenType ? `, a ${sd.pathogenType.toLowerCase()}${sd.pathogenType === "BACTERIUM" ? ", not a virus" : ""}` : ""})` : ""} is under consideration but not confirmed.` : ""}`;

  // ---------------------------------------------------------------- map locations and spread
  const trackerLocations: TrackerLocation[] = locations.map((l) => ({
    id: l.id, name: l.name, admin1: l.admin1, countryCode: l.countryCode, countryName: countryName(l.countryCode), lat: l.lat, lng: l.lng, precision: l.precision,
    role: l.role as LocationRole, roleLabel: LOCATION_ROLE_LABEL[l.role as LocationRole] ?? l.role, isCase: isCaseRole(l.role),
    verificationStatus: verificationAt(l.verificationStatus, l.verifiedAt, asOf), notes: l.notes, evidence: l.evidence, firstReportedAt: l.firstReportedAt.toISOString(), source: ref(l.sourceArticle),
  }));
  const spread = assessSpread(trackerLocations, { countryCode: ev.originCountryCode, admin1: ev.originAdmin1 }, ev.originAdmin1 ?? countryName(ev.originCountryCode));

  // ---------------------------------------------------------------- targeted intelligence (priority topics first)
  const intelAll = await listFeed(asOf, { tracked: { mode: "only", eventId: ev.id } }, 60);
  const isPriority = (i: FeedItemDTO) => i.trackedTopics.some((t) => (PRIORITY_TOPICS as readonly string[]).includes(t));
  const intel = [...intelAll.filter(isPriority), ...intelAll.filter((i) => !isPriority(i))].slice(0, 10);

  // ---------------------------------------------------------------- what changed in the last 24 hours
  const ref24 = asOf ?? now;
  const since = new Date(ref24.getTime() - 86400_000);
  const inWindow = (iso: string | null) => !!iso && Date.parse(iso) > since.getTime() && Date.parse(iso) <= ref24.getTime();
  const last24 = [
    ...updates.filter((u) => inWindow(u.publishedAt)).map((u) => ({ type: "Development", title: u.title, at: u.publishedAt, verificationStatus: u.verificationStatus, sourceType: u.sourceType, href: `/timeline#${u.id}` })),
    ...statusEntries.filter((s) => inWindow(s.publishedAt)).map((s) => ({ type: "Status change", title: s.title, at: s.publishedAt, verificationStatus: "VERIFIED", sourceType: null, href: `/timeline#${s.id}` })),
    ...visibleObs.filter((o) => inWindow(o.reportedAt.toISOString())).map((o) => ({ type: "Figure", title: `${METRIC_ROWS.find((m) => m.key === o.metric)?.label ?? o.metric}: ${o.value ?? "not reported"}${o.valueHigh ? `–${o.valueHigh}` : ""} (${o.attributedTo ?? "unattributed"})`, at: o.reportedAt.toISOString(), verificationStatus: verificationAt(o.verificationStatus, o.verifiedAt, asOf), sourceType: o.sourceType, href: null })),
    ...trackerLocations.filter((l) => inWindow(l.firstReportedAt)).map((l) => ({ type: "Location", title: `${l.roleLabel}: ${l.name}`, at: l.firstReportedAt, verificationStatus: l.verificationStatus, sourceType: null, href: "/map" })),
    ...intelAll.filter((i) => inWindow(i.publishedAt)).map((i) => ({ type: "Publication", title: i.title, at: i.publishedAt, verificationStatus: i.verificationStatus, sourceType: i.sourceType, href: i.url })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return {
    ...base,
    status: {
      title: d.title,
      summary: d.summary,
      classification: d.classification,
      classificationLabel: CLASSIFICATION_LABEL[d.classification as Classification] ?? d.classification,
      pathogenStatus: d.pathogenStatus,
      pathogenStatusLabel: PATHOGEN_STATUS_LABEL[d.pathogenStatus as PathogenStatus] ?? d.pathogenStatus,
      suspectedDisease: sd ? { name: sd.name, pathogen: sd.pathogen ?? null, pathogenType: sd.pathogenType ?? null } : null,
      confirmedDisease: cd && d.pathogenStatus === "CONFIRMED" ? { name: cd.name, pathogen: cd.pathogen ?? null } : null,
      pathogenStatement,
      firstReportedAt: d.firstReportedAt,
      eventStartDate: d.eventStartDate,
      lastVerifiedAt: d.lastVerifiedAt,
      lastVerifiedUpdate,
      lastStatusChange: d.statusHistory.length ? (() => { const s = [...d.statusHistory].sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0]!; return { effectiveAt: s.effectiveAt, reason: s.reason }; })() : null,
    },
    metrics,
    labFindings,
    hypotheses,
    alternatives,
    contradictions,
    last24h: { since: since.toISOString(), entries: last24 },
    developments,
    timeline,
    locations: trackerLocations,
    spread,
    intel,
    pendingReview: { tracked: pending[0]!, material: pending[1]!, possible: pending[2]! },
    riskAssessments: d.riskAssessments,
  };
}
