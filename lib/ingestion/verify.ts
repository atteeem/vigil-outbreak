// Live-source verification: checks that an endpoint is reachable, answers in the documented format, is fresh,
// is ordered newest-first and pages correctly. Stores nothing. Used by `npm run verify:sources` and tests.
import { fetchText, parseJson } from "./http";
import { buildWhoDonUrl, parseWhoDon } from "./adapters/who-don";
import { fetchCdcPage, parseCdcContent } from "./adapters/cdc-content";
import { parseFeed } from "./adapters/rss";
import { IngestionError, type FetchedItem } from "./types";
import { FAILURE_HINT, FAILURE_LABEL, type FailureKind } from "./errors";

export type CheckStatus = "PASS" | "FAIL" | "WARN" | "SKIP";

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface VerificationResult {
  slug: string;
  adapter: string;
  url: string;
  verdict: "VERIFIED" | "BLOCKED_BY_NETWORK" | "FAILED" | "DEGRADED";
  failureKind: FailureKind | null;
  hint: string | null;
  httpStatus: number | null;
  itemCount: number;
  newest: string | null;
  checks: Check[];
  sample: { title: string; publishedAt: string; url: string }[];
  /** On format errors: the actual response shape or body excerpt, so the adapter can be fixed from evidence. */
  responseSample: string | null;
  checkedAt: string;
  durationMs: number;
}

/** Freshness threshold: an official outbreak feed with nothing in this many days is suspicious, not fatal. */
export const STALE_AFTER_DAYS = 45;

function withParams(base: string, params: Record<string, string>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

async function fetchPage(adapter: string, url: string): Promise<{ status: number; items: FetchedItem[]; itemErrors: string[] }> {
  if (adapter === "WHO_DON_API") {
    const r = await fetchText(url, "application/json");
    const p = parseWhoDon(parseJson(r.body, r.status, "WHO DON endpoint"));
    return { status: r.status, items: p.items, itemErrors: p.itemErrors };
  }
  if (adapter === "CDC_CONTENT_API") {
    const r = await fetchCdcPage(url);
    const p = parseCdcContent(r.json);
    return { status: r.status, items: p.items, itemErrors: p.itemErrors };
  }
  if (adapter === "RSS") {
    const r = await fetchText(url, "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9");
    const p = parseFeed(r.body, url);
    return { status: r.status, items: p.items, itemErrors: p.itemErrors };
  }
  throw new IngestionError(`Adapter ${adapter} cannot be verified`, null, "CONFIG");
}

const keyOf = (i: FetchedItem) => i.externalId ?? i.url;

export async function verifyEndpoint(slug: string, adapter: string, url: string, now = new Date()): Promise<VerificationResult> {
  const started = Date.now();
  const checks: Check[] = [];
  const base: VerificationResult = { slug, adapter, url, verdict: "FAILED", failureKind: null, hint: null, httpStatus: null, itemCount: 0, newest: null, checks, sample: [], responseSample: null, checkedAt: now.toISOString(), durationMs: 0 };
  const firstUrl = adapter === "WHO_DON_API" ? buildWhoDonUrl(url, 10, 0) : adapter === "CDC_CONTENT_API" ? withParams(url, { max: "10", pagenum: "1" }) : url;

  let page1: Awaited<ReturnType<typeof fetchPage>>;
  try {
    page1 = await fetchPage(adapter, firstUrl);
  } catch (err) {
    const kind: FailureKind = err instanceof IngestionError ? err.kind : "UNKNOWN";
    checks.push({ name: "reachable", status: "FAIL", detail: `${FAILURE_LABEL[kind]} — ${(err as Error).message}` });
    return { ...base, verdict: kind === "NETWORK_POLICY_BLOCKED" ? "BLOCKED_BY_NETWORK" : "FAILED", failureKind: kind, hint: FAILURE_HINT[kind], httpStatus: err instanceof IngestionError ? err.httpStatus : null, responseSample: err instanceof IngestionError ? err.detail : null, durationMs: Date.now() - started };
  }
  checks.push({ name: "reachable", status: "PASS", detail: `HTTP ${page1.status}` });
  checks.push({
    name: "schema",
    status: page1.items.length > 0 ? (page1.itemErrors.length ? "WARN" : "PASS") : "FAIL",
    detail: `${page1.items.length} items parsed in the documented format${page1.itemErrors.length ? `; ${page1.itemErrors.length} skipped (${page1.itemErrors[0]})` : ""}`,
  });
  const dates = page1.items.map((i) => i.publishedAt.getTime());
  const newest = dates.length ? new Date(Math.max(...dates)) : null;
  if (newest) {
    const ageDays = (now.getTime() - newest.getTime()) / 86400_000;
    checks.push({ name: "freshness", status: ageDays <= STALE_AFTER_DAYS ? "PASS" : "WARN", detail: `newest item ${newest.toISOString()} (${ageDays.toFixed(1)} days old)` });
    checks.push({ name: "timestamps", status: newest.getTime() <= now.getTime() + 86400_000 ? "PASS" : "WARN", detail: "publication times parse and are not in the future" });
  }
  if (adapter !== "RSS" && dates.length > 1) {
    const sorted = dates.every((d, i) => i === 0 || d <= dates[i - 1]!);
    checks.push({ name: "ordering", status: sorted ? "PASS" : "WARN", detail: sorted ? "newest first" : "not newest-first; ingestion still dedupes, but the newest items may not be on page 1" });
  }

  if (adapter === "WHO_DON_API" || adapter === "CDC_CONTENT_API") {
    const page2Url = adapter === "WHO_DON_API" ? buildWhoDonUrl(url, 10, 10) : withParams(url, { max: "10", pagenum: "2" });
    try {
      const page2 = await fetchPage(adapter, page2Url);
      const overlap = page2.items.filter((i) => page1.items.some((j) => keyOf(j) === keyOf(i))).length;
      const older = page2.items.length === 0 || Math.max(...page2.items.map((i) => i.publishedAt.getTime())) <= Math.min(...dates);
      const status: CheckStatus = page2.items.length === 0 ? "WARN" : overlap === 0 ? (older ? "PASS" : "WARN") : "FAIL";
      checks.push({ name: "pagination", status, detail: page2.items.length === 0 ? "page 2 is empty (collection smaller than one page, or paging unsupported)" : `page 2: ${page2.items.length} items, ${overlap} repeated from page 1${older ? ", all older" : ", not strictly older"}` });
    } catch (err) {
      checks.push({ name: "pagination", status: "WARN", detail: `page 2 request failed: ${(err as Error).message}` });
    }
  }

  const fails = checks.filter((c) => c.status === "FAIL").length;
  const warns = checks.filter((c) => c.status === "WARN").length;
  return {
    ...base,
    verdict: fails ? (page1.items.length === 0 ? "FAILED" : "DEGRADED") : warns ? "DEGRADED" : "VERIFIED",
    failureKind: fails && page1.items.length === 0 ? "SCHEMA_MISMATCH" : null,
    hint: fails && page1.items.length === 0 ? FAILURE_HINT.SCHEMA_MISMATCH : null,
    httpStatus: page1.status,
    itemCount: page1.items.length,
    newest: newest?.toISOString() ?? null,
    sample: page1.items.slice(0, 3).map((i) => ({ title: i.title, publishedAt: i.publishedAt.toISOString(), url: i.url })),
    durationMs: Date.now() - started,
  };
}

/** Endpoints probed in addition to configured sources: documented alternates that help diagnose path problems. */
export const EXTRA_PROBES: { slug: string; adapter: string; url: string; note: string }[] = [
  { slug: "who-don-hubs-route", adapter: "WHO_DON_API", url: "https://www.who.int/api/hubs/diseaseoutbreaknews", note: "Sibling route documented at /api/hubs/diseaseoutbreaknews/sfhelp (exposes DonId)." },
  { slug: "who-don-emergencies-route", adapter: "WHO_DON_API", url: "https://www.who.int/api/emergencies/diseaseoutbreaknews", note: "Sibling route documented at /api/emergencies/diseaseoutbreaknews/sfhelp." },
];
