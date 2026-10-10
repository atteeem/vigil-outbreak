// Database side of tracked events: loading their match terms, tagging articles, and the non-destructive
// bootstrap used by `npm run db:seed` / `npm run db:reference` / migrations.
import { prisma } from "@/lib/db";
import { matchTracked, parseTerms, type TrackedMatch, type TrackedTerms } from "./relevance";
import { IRKUTSK_TRACKED } from "./defaults";

const SEEDED_VERDICT_DATES: [string, string][] = [
  ["The worker died from plague.", "2026-10-05T12:00:00Z"],
  ["The woman died from an unspecified form of plague.", "2026-10-05T12:00:00Z"],
  ["The technician broke a test tube", "2026-10-05T12:00:00Z"],
  ["No accident involving pathogenic microorganisms", "2026-10-05T12:00:00Z"],
  ["Nearly 200 people under observation.", "2026-10-06T12:00:00Z"],
  ["The illness was initially described as a typical", "2026-10-06T13:00:00Z"],
];

export interface TrackedContext {
  id: string;
  outbreakId: string;
  terms: TrackedTerms;
}

export async function loadTrackedContext(): Promise<TrackedContext[]> {
  const rows = await prisma.trackedEvent.findMany({ where: { active: true } });
  return rows.map((r) => ({
    id: r.id,
    outbreakId: r.outbreakId,
    terms: { anchorTerms: parseTerms(r.anchorTerms), contextTerms: parseTerms(r.contextTerms), weakAnchorTerms: parseTerms(r.weakAnchorTerms), originCountryCode: r.originCountryCode },
  }));
}

export interface TrackedHit {
  event: TrackedContext;
  match: TrackedMatch;
}

/** The best-matching tracked event for an article, if any (DIRECT beats POSSIBLE, then score). */
export function bestTrackedMatch(article: Parameters<typeof matchTracked>[0], events: readonly TrackedContext[]): TrackedHit | null {
  let best: TrackedHit | null = null;
  for (const event of events) {
    const match = matchTracked(article, event.terms);
    if (!match) continue;
    const rank = (h: TrackedHit) => (h.match.level === "DIRECT" ? 1000 : 0) + h.match.score;
    if (!best || rank({ event, match }) > rank(best)) best = { event, match };
  }
  return best;
}

export function trackedFields(hit: TrackedHit | null) {
  return {
    trackedEventId: hit?.event.id ?? null,
    trackedLevel: hit?.match.level ?? null,
    trackedScore: hit?.match.score ?? null,
    trackedTopics: JSON.stringify(hit?.match.topics ?? []),
    trackedReasons: hit ? hit.match.reasons.join("; ") : null,
    materialChange: hit?.match.material ?? false,
  };
}

/**
 * Non-destructive bootstrap: makes sure the Irkutsk investigation is the primary tracked event (if that record
 * exists and nothing is tracked yet), records the precautionary-measure location reported for Irkutsk, adds the
 * Rospotrebnadzor source (disabled until its feed URL is confirmed), and tags untagged articles. It never deletes
 * or overwrites analyst data. Returns what it changed.
 */
export async function ensureTrackedEvents(): Promise<string[]> {
  const changes: string[] = [];
  const outbreak = await prisma.outbreak.findUnique({ where: { slug: IRKUTSK_TRACKED.outbreakSlug }, include: { locations: true } });
  if (outbreak && (await prisma.trackedEvent.count()) === 0) {
    const { outbreakSlug: _slug, anchorTerms, contextTerms, weakAnchorTerms, ...rest } = IRKUTSK_TRACKED;
    await prisma.trackedEvent.create({ data: { ...rest, outbreakId: outbreak.id, primary: true, anchorTerms: JSON.stringify(anchorTerms), contextTerms: JSON.stringify(contextTerms), weakAnchorTerms: JSON.stringify(weakAnchorTerms) } });
    changes.push("tracked event: Irkutsk investigation (primary)");
  }
  if (outbreak && !outbreak.locations.some((l) => l.role === "PRECAUTIONARY_MEASURE")) {
    const meduza = await prisma.sourceArticle.findFirst({ where: { canonicalUrl: { contains: "meduza.io/en/feature/2026/10/05/hospitals-in-irkutsk" } }, select: { id: true } });
    await prisma.outbreakLocation.create({
      data: {
        outbreakId: outbreak.id, name: "Irkutsk (contacts under observation)", admin1: "Irkutsk Oblast", countryCode: "RU", lat: 52.2869, lng: 104.305, precision: "CITY",
        role: "PRECAUTIONARY_MEASURE", verificationStatus: "VERIFIED", verifiedAt: new Date("2026-10-06T12:00:00Z"), firstReportedAt: new Date("2026-10-05T12:00:00Z"), sourceArticleId: meduza?.id ?? null,
        notes: "Contacts of the deceased placed under observation / quarantine in Irkutsk hospitals (reported 189–197 people). Precautionary: observation is not infection. City-level coordinates.",
        evidence: "Meduza (5 Oct) and Euronews (6 Oct) report hospital quarantines and contacts under observation in Irkutsk.",
      },
    });
    changes.push("location: Irkutsk (contacts under observation), precautionary");
  }
  if (!(await prisma.source.findUnique({ where: { slug: "rospotrebnadzor-news" } }))) {
    await prisma.source.create({
      data: {
        slug: "rospotrebnadzor-news", name: "Rospotrebnadzor — news (RSS)", organization: "Rospotrebnadzor (Russian Federal Service for Surveillance on Consumer Rights Protection and Human Wellbeing)",
        kind: "OFFICIAL", adapter: "RSS", url: null, homepage: "https://www.rospotrebnadzor.ru/", enabled: false, pollIntervalMinutes: 30,
        notes: "Russia's federal health authority and the main official source on the Irkutsk investigation. Feed URL not confirmed from the build environment: paste the news RSS URL from rospotrebnadzor.ru, Save, Test endpoint, then Enable.",
      },
    });
    changes.push("source: Rospotrebnadzor news (disabled until its URL is confirmed)");
  }
  // Seeded contradictions without a verdict date would be invisible in historical views; record when each became
  // public (only where no date was recorded — analyst-set dates are never changed).
  if (outbreak) {
    let dated = 0;
    for (const [prefix, at] of SEEDED_VERDICT_DATES) {
      dated += (await prisma.evidenceClaim.updateMany({ where: { outbreakId: outbreak.id, extractedBy: "SEED", reviewedAt: null, text: { startsWith: prefix } }, data: { reviewedAt: new Date(at) } })).count;
    }
    if (dated) changes.push(`dated ${dated} seeded verdict(s) for historical views`);
  }
  const tagged = await tagUntrackedArticles();
  if (tagged) changes.push(`tagged ${tagged} article(s) as about a tracked event`);
  return changes;
}

/** Tags articles that have no tracked event yet. Only fills the tracked* fields; never changes review status,
 * verification, outbreak links or claims. Articles an analyst linked to a tracked outbreak are DIRECT. */
export async function tagUntrackedArticles(): Promise<number> {
  const events = await loadTrackedContext();
  if (!events.length) return 0;
  const byOutbreak = new Map(events.map((e) => [e.outbreakId, e]));
  const rows = await prisma.sourceArticle.findMany({
    // Untagged articles, plus tracked ones that were tagged without topics (e.g. by the migration).
    where: { outbreakRelevant: true, OR: [{ trackedEventId: null }, { trackedTopics: "[]", trackedReasons: null }] },
    select: { id: true, title: true, summary: true, locationText: true, countryCodes: true, outbreakId: true },
  });
  let n = 0;
  for (const a of rows) {
    const countryCodes = (() => { try { return JSON.parse(a.countryCodes) as string[]; } catch { return []; } })();
    const linked = a.outbreakId ? byOutbreak.get(a.outbreakId) : undefined;
    // An analyst already placed linked articles; their country tags are not a spread signal.
    const hit = bestTrackedMatch({ title: a.title, summary: a.summary, locationText: a.locationText, countryCodes: linked ? [] : countryCodes }, events);
    if (!hit && !linked) continue;
    const fields = trackedFields(hit);
    // Already linked by an analyst: about the event by definition, and already reviewed (not a pending change).
    const data = linked ? { ...fields, trackedEventId: linked.id, trackedLevel: "DIRECT", trackedReasons: fields.trackedReasons ?? "linked to the tracked outbreak by an analyst", materialChange: false } : fields;
    await prisma.sourceArticle.update({ where: { id: a.id }, data });
    n++;
  }
  return n;
}
