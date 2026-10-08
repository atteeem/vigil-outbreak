// WHO Disease Outbreak News — Sitefinity OData endpoint documented at
// https://www.who.int/api/news/diseaseoutbreaknews/sfhelp. Documented fields include Title, PublicationDate
// (DateTimeOffset), UrlName, Summary, Overview, Epidemiology, Assessment, Advice; `DonId` appears on the sibling
// /api/hubs/diseaseoutbreaknews route. Responses are `{ "value": [ ... ] }` (OData v4 collection).
//
// Paging: standard OData `$top`/`$skip`, ordered by `$orderby=PublicationDate desc`. If the server returns an
// `@odata.nextLink`, that link is followed instead of computing `$skip`. Paging behaviour could not be checked live
// from the build environment — `npm run verify:sources` checks it (page 2 must differ from page 1 and be older).
import { fetchText, parseJson } from "../http";
import { parseDate, stripHtml } from "../normalize";
import { IngestionError, type AdapterResult, type FetchedItem, type FetchOptions } from "../types";

const ITEM_BASE = "https://www.who.int/emergencies/disease-outbreak-news/item/";
export const WHO_PAGE_SIZE = 25;

export function buildWhoDonUrl(base: string, top = WHO_PAGE_SIZE, skip = 0): string {
  const u = new URL(base);
  if (!u.searchParams.has("$orderby")) u.searchParams.set("$orderby", "PublicationDate desc");
  if (!u.searchParams.has("$top")) u.searchParams.set("$top", String(top));
  if (skip > 0) u.searchParams.set("$skip", String(skip));
  else u.searchParams.delete("$skip");
  return u.toString();
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function parseWhoDon(json: unknown): { items: FetchedItem[]; itemErrors: string[]; nextLink: string | null; rawCount: number } {
  const value = (json as { value?: unknown })?.value;
  if (!Array.isArray(value)) throw new IngestionError("WHO DON response has no `value` array — format changed or wrong endpoint", null, "SCHEMA_MISMATCH");
  const items: FetchedItem[] = [];
  const itemErrors: string[] = [];
  for (const row of value as Row[]) {
    const title = str(row.Title) ?? str(row.title);
    const publishedAt = parseDate(row.PublicationDateAndTime ?? row.PublicationDate ?? row.DateCreated);
    const urlName = str(row.UrlName);
    const defaultUrl = str(row.ItemDefaultUrl);
    const url = defaultUrl?.startsWith("http") ? defaultUrl : urlName ? ITEM_BASE + urlName : defaultUrl ? ITEM_BASE + defaultUrl.replace(/^\//, "") : null;
    if (!title || !publishedAt || !url) {
      itemErrors.push(`Skipped WHO DON row ${String(row.Id ?? "?")}: missing ${[!title && "title", !publishedAt && "date", !url && "url"].filter(Boolean).join(", ")}`);
      continue;
    }
    const text = [row.Summary, row.Overview, row.Epidemiology, row.Assessment].map((v) => stripHtml(str(v))).filter(Boolean).join("\n\n");
    const lead = stripHtml(str(row.Summary)) || stripHtml(str(row.Overview));
    items.push({ externalId: str(row.DonId) ?? str(row.Id) ?? urlName, url, title, text, publishedAt, language: "en", raw: row, lead });
  }
  // Rows exist but none has the documented fields: the schema changed. Fail loudly instead of storing nothing quietly.
  if (value.length > 0 && items.length === 0) throw new IngestionError(`WHO DON returned ${value.length} rows but none had Title/PublicationDate/UrlName — schema changed`, null, "SCHEMA_MISMATCH");
  const nextLink = str((json as Row)["@odata.nextLink"]) ?? str((json as Row)["odata.nextLink"]);
  return { items, itemErrors, nextLink, rawCount: value.length };
}

export async function fetchWhoDon(baseUrl: string, opts: FetchOptions = {}): Promise<AdapterResult> {
  const maxPages = Math.max(1, opts.maxPages ?? 1);
  const items: FetchedItem[] = [];
  const itemErrors: string[] = [];
  let url = buildWhoDonUrl(baseUrl);
  let status = 0;
  let pages = 0;
  const seen = new Set<string>();
  while (pages < maxPages) {
    const res = await fetchText(url, "application/json");
    status = res.status;
    pages++;
    const page = parseWhoDon(parseJson(res.body, res.status, "WHO DON endpoint"));
    let fresh = 0;
    for (const it of page.items) {
      const key = it.externalId ?? it.url;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(it);
      fresh++;
    }
    itemErrors.push(...page.itemErrors);
    // Stop at the end of the collection, or if the server ignores $skip and repeats the same page.
    if (page.rawCount === 0 || fresh === 0) break;
    if (page.nextLink) url = new URL(page.nextLink, url).toString();
    else if (page.rawCount < WHO_PAGE_SIZE) break;
    else url = buildWhoDonUrl(baseUrl, WHO_PAGE_SIZE, pages * WHO_PAGE_SIZE);
  }
  return { httpStatus: status, items, itemErrors, pages };
}
