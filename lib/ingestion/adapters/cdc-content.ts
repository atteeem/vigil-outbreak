// CDC Content Services API v2 (content syndication) — https://tools.cdc.gov/api/docs/info.aspx.
// Documented shape (CDC docs + the published OpenAPI definition of the "CDC Content Services" connector):
//   GET https://tools.cdc.gov/api/v2/resources/media?q=&mediatypes=&topic=&sort=&order=&max=&pagenum=&offset=
//   200 → { meta: { status, message[], pagination: { total, count, max, offset, pageNum, totalPages, nextUrl } },
//           results: [ { id, name, description, mediaType, language{name,isoCode}, sourceUrl, targetUrl,
//                        persistentUrl, status, datePublished, dateModified, dateContentPublished, ... } ] }
//
// A live run reported SCHEMA_MISMATCH for this source, but the response itself could not be captured (the build
// environment cannot reach tools.cdc.gov). The parser therefore tolerates the variants an ASP.NET-era API of this
// family plausibly returns, and every SCHEMA_MISMATCH now carries a description of the ACTUAL response shape
// (top-level keys, item keys, sample date/URL values) so the next verification run identifies it precisely:
//   - JSON vs XML/HTML (non-JSON bodies retry once with the documented `format=json` query parameter)
//   - JSONP wrapper / BOM                        - camelCase or PascalCase keys ("results" / "Results")
//   - a bare array instead of { results }        - dates as ISO, ISO without zone, "/Date(ms)/", US format, epoch
//   - relative URLs (resolved against https://www.cdc.gov)
//   - status values other than "Published" (only archived/hidden/draft/deleted/retired are skipped)
import { fetchText, parseJson } from "../http";
import { stripHtml } from "../normalize";
import { IngestionError, type AdapterResult, type FetchedItem, type FetchOptions } from "../types";

type Row = Record<string, unknown>;

/** Case-insensitive property access (camelCase vs PascalCase). */
export function pick(obj: unknown, ...names: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Row;
  for (const n of names) if (n in o) return o[n];
  const keys = Object.keys(o);
  for (const n of names) {
    const k = keys.find((x) => x.toLowerCase() === n.toLowerCase());
    if (k) return o[k];
  }
  return undefined;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** Parses the date formats this API family is known to emit. Zone-less timestamps are treated as UTC. */
export function parseCdcDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000);
  const s = String(v).trim();
  const ms = /^\/?Date\((-?\d+)([+-]\d{4})?\)\/?$/.exec(s);
  if (ms) return new Date(Number(ms[1]));
  if (/^\d{10,13}$/.test(s)) return parseCdcDate(Number(s));
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return new Date(`${s}Z`);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(s);
  if (us) {
    let h = Number(us[4] ?? 0);
    if (us[7]) h = (h % 12) + (/pm/i.test(us[7]) ? 12 : 0);
    return new Date(Date.UTC(Number(us[3]), Number(us[1]) - 1, Number(us[2]), h, Number(us[5] ?? 0), Number(us[6] ?? 0)));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Compact description of a response's shape, for SCHEMA_MISMATCH diagnostics. */
export function describeShape(json: unknown): string {
  if (Array.isArray(json)) return `top-level array[${json.length}]; first item keys: ${Object.keys((json[0] as Row) ?? {}).slice(0, 30).join(", ")}`;
  if (!json || typeof json !== "object") return `top-level ${typeof json}`;
  const top = Object.keys(json as Row);
  const results = pick(json, "results");
  const first = Array.isArray(results) ? (results[0] as Row | undefined) : undefined;
  const sample = first
    ? Object.entries(first)
        .filter(([k]) => /date|url|name|title|status|id/i.test(k))
        .slice(0, 12)
        .map(([k, v]) => `${k}=${JSON.stringify(v)?.slice(0, 60)}`)
        .join("; ")
    : "";
  return `top-level keys: ${top.join(", ")}${Array.isArray(results) ? `; results[${results.length}]` : `; results is ${typeof results}`}${first ? `; first item keys: ${Object.keys(first).slice(0, 40).join(", ")}; sample: ${sample}` : ""}`;
}

const SKIP_STATUS = /^(archived?|hidden|draft|deleted|retired|unpublished|inactive)$/i;
const CDC_BASE = "https://www.cdc.gov/";

export function parseCdcContent(json: unknown): { items: FetchedItem[]; itemErrors: string[]; nextUrl: string | null; rawCount: number } {
  const results = Array.isArray(json) ? json : pick(json, "results");
  const meta = pick(json, "meta") as Row | undefined;
  const metaStatus = Number(pick(meta, "status"));
  if (Number.isFinite(metaStatus) && metaStatus >= 400) throw new IngestionError(`CDC Content Services reported status ${metaStatus}: ${JSON.stringify(pick(meta, "message") ?? "").slice(0, 160)}`, metaStatus, "HTTP_CLIENT");
  if (!Array.isArray(results)) {
    const shape = describeShape(json);
    throw new IngestionError(`CDC Content Services response has no results array — ${shape}`, null, "SCHEMA_MISMATCH", null, shape);
  }
  const items: FetchedItem[] = [];
  const itemErrors: string[] = [];
  let missing = 0;
  for (const row of results as Row[]) {
    const title = str(pick(row, "name", "title"));
    const rawUrl = str(pick(row, "sourceUrl", "targetUrl", "persistentUrl", "url", "canonicalUrl"));
    let url: string | null = null;
    if (rawUrl) {
      try {
        url = new URL(rawUrl, CDC_BASE).toString();
      } catch {
        url = null;
      }
    }
    const publishedAt = parseCdcDate(pick(row, "datePublished") ?? pick(row, "dateContentPublished") ?? pick(row, "dateModified") ?? pick(row, "dateContentUpdated") ?? pick(row, "dateSyndicationCaptured"));
    if (!title || !url || !publishedAt) {
      missing++;
      itemErrors.push(`Skipped CDC media ${String(pick(row, "id") ?? "?")}: missing ${[!title && "name", !url && "url", !publishedAt && "date"].filter(Boolean).join(", ")}`);
      continue;
    }
    const status = str(pick(row, "status"));
    if (status && SKIP_STATUS.test(status)) {
      itemErrors.push(`Skipped CDC media ${String(pick(row, "id"))}: status "${status}"`);
      continue;
    }
    const lang = str(pick(pick(row, "language"), "isoCode")) ?? (typeof pick(row, "language") === "string" ? str(pick(row, "language")) : null);
    const mediaType = str(pick(row, "mediaType"));
    const description = stripHtml(str(pick(row, "description")));
    const id = pick(row, "id");
    items.push({ externalId: id !== undefined && id !== null ? `cdc-media-${String(id)}` : null, url, title: stripHtml(title), text: description, publishedAt, language: lang, raw: row, lead: description, hints: mediaType ? [mediaType] : [] });
  }
  if (results.length > 0 && items.length === 0 && missing === results.length) {
    const shape = describeShape(json);
    throw new IngestionError(`CDC returned ${results.length} items but none had name/url/date in a recognised form — ${shape}`, null, "SCHEMA_MISMATCH", null, shape);
  }
  const nextUrl = str(pick(pick(meta, "pagination"), "nextUrl"));
  return { items, itemErrors, nextUrl, rawCount: results.length };
}

/** Adds `format=json` (documented query-string format selector). */
export function withJsonFormat(url: string): string {
  const u = new URL(url);
  if (!u.searchParams.has("format")) u.searchParams.set("format", "json");
  return u.toString();
}

export async function fetchCdcPage(url: string) {
  const res = await fetchText(url, "application/json, text/javascript;q=0.9, */*;q=0.1");
  try {
    return { status: res.status, json: parseJson(res.body, res.status, "CDC Content Services") };
  } catch (err) {
    // Non-JSON (e.g. XML by content negotiation): retry once with the documented format selector.
    if (err instanceof IngestionError && err.kind === "SCHEMA_MISMATCH" && !new URL(url).searchParams.has("format")) {
      const again = await fetchText(withJsonFormat(url), "application/json");
      return { status: again.status, json: parseJson(again.body, again.status, "CDC Content Services (format=json)") };
    }
    throw err;
  }
}

export async function fetchCdcContent(baseUrl: string, opts: FetchOptions = {}): Promise<AdapterResult> {
  const maxPages = Math.max(1, opts.maxPages ?? 1);
  const items: FetchedItem[] = [];
  const itemErrors: string[] = [];
  let url = baseUrl;
  let status = 0;
  let pages = 0;
  const seen = new Set<string>();
  while (pages < maxPages) {
    const res = await fetchCdcPage(url);
    status = res.status;
    pages++;
    const page = parseCdcContent(res.json);
    let fresh = 0;
    for (const it of page.items) {
      if (seen.has(it.externalId ?? it.url)) continue;
      seen.add(it.externalId ?? it.url);
      items.push(it);
      fresh++;
    }
    itemErrors.push(...page.itemErrors);
    if (!page.nextUrl || page.rawCount === 0 || fresh === 0) break;
    url = new URL(page.nextUrl, url).toString();
  }
  return { httpStatus: status, items, itemErrors, pages };
}
