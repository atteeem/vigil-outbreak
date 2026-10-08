// CDC Content Services API v2 (content syndication) — https://tools.cdc.gov/api/docs/info.aspx.
// Schema established from the published OpenAPI/Swagger definition (Microsoft Power Platform connector
// "CDC Content Services", independent-publisher-connectors/CDC Content Services/apiDefinition.swagger.json):
//   GET https://tools.cdc.gov/api/v2/resources/media?q=&mediatypes=&topic=&sort=&order=ASC|DESC&max=&pagenum=&offset=
//   200 → { meta: { status, message[], pagination: { total, count, max, offset, pageNum, totalPages, nextUrl, ... } },
//           results: [ { id, name, description, mediaType, language{name,isoCode}, source{name,acronym},
//                        sourceUrl, targetUrl, persistentUrl, status, datePublished, dateModified,
//                        dateContentPublished, dateContentUpdated, ... } ] }
// No credentials. Dates are ISO 8601. The live endpoint could not be reached from the build environment;
// `npm run verify:sources` confirms it before the source is enabled.
import { fetchText, parseJson } from "../http";
import { parseDate, stripHtml } from "../normalize";
import { IngestionError, type AdapterResult, type FetchedItem, type FetchOptions } from "../types";

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function parseCdcContent(json: unknown): { items: FetchedItem[]; itemErrors: string[]; nextUrl: string | null; rawCount: number } {
  const root = json as { results?: unknown; meta?: { status?: number; message?: unknown; pagination?: Row } };
  if (!Array.isArray(root?.results)) throw new IngestionError("CDC Content Services response has no `results` array — format changed or wrong endpoint", null, "SCHEMA_MISMATCH");
  if (root.meta?.status && root.meta.status >= 400) throw new IngestionError(`CDC Content Services reported status ${root.meta.status}: ${JSON.stringify(root.meta.message ?? "").slice(0, 160)}`, root.meta.status, "HTTP_CLIENT");
  const items: FetchedItem[] = [];
  const itemErrors: string[] = [];
  for (const row of root.results as Row[]) {
    const title = str(row.name);
    const url = str(row.sourceUrl) ?? str(row.persistentUrl) ?? str(row.targetUrl);
    // Publication time = when CDC published the content; fall back through the documented date fields.
    const publishedAt = parseDate(row.datePublished ?? row.dateContentPublished ?? row.dateModified);
    if (!title || !url || !publishedAt) {
      itemErrors.push(`Skipped CDC media ${String(row.id ?? "?")}: missing ${[!title && "name", !url && "url", !publishedAt && "date"].filter(Boolean).join(", ")}`);
      continue;
    }
    const status = str(row.status);
    if (status && !/^published$/i.test(status)) {
      itemErrors.push(`Skipped CDC media ${String(row.id)}: status "${status}"`);
      continue;
    }
    const lang = (row.language as { isoCode?: string } | undefined)?.isoCode ?? null;
    items.push({ externalId: row.id !== undefined ? `cdc-media-${String(row.id)}` : null, url, title: stripHtml(title), text: stripHtml(str(row.description)), publishedAt, language: lang, raw: row });
  }
  if (root.results.length > 0 && items.length === 0 && itemErrors.every((e) => /missing/.test(e))) throw new IngestionError(`CDC returned ${root.results.length} items but none had name/sourceUrl/datePublished — schema changed`, null, "SCHEMA_MISMATCH");
  const nextUrl = str(root.meta?.pagination?.nextUrl);
  return { items, itemErrors, nextUrl, rawCount: root.results.length };
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
    const res = await fetchText(url, "application/json");
    status = res.status;
    pages++;
    const page = parseCdcContent(parseJson(res.body, res.status, "CDC Content Services"));
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
