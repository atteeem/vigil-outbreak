// WHO Disease Outbreak News — Sitefinity OData endpoint documented at
// https://www.who.int/api/news/diseaseoutbreaknews/sfhelp (fields: Title, PublicationDate, UrlName, Summary,
// Overview, ... ; `DonId` is documented on the sibling /emergencies and /hubs routes). Responses are
// `{ "value": [ ... ] }`. Field access is defensive: anything missing is skipped and logged, never invented.
import { fetchText } from "../http";
import { parseDate, stripHtml } from "../normalize";
import { IngestionError, type AdapterResult, type FetchedItem } from "../types";

const ITEM_BASE = "https://www.who.int/emergencies/disease-outbreak-news/item/";

export function buildWhoDonUrl(base: string, top = 25): string {
  const u = new URL(base);
  if (!u.searchParams.has("$orderby")) u.searchParams.set("$orderby", "PublicationDate desc");
  if (!u.searchParams.has("$top")) u.searchParams.set("$top", String(top));
  return u.toString();
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function parseWhoDon(json: unknown): { items: FetchedItem[]; itemErrors: string[] } {
  const value = (json as { value?: unknown })?.value;
  if (!Array.isArray(value)) throw new IngestionError("WHO DON response has no `value` array — format changed or wrong endpoint");
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
    items.push({ externalId: str(row.DonId) ?? str(row.Id) ?? urlName, url, title, text, publishedAt, language: "en", raw: row });
  }
  return { items, itemErrors };
}

export async function fetchWhoDon(baseUrl: string): Promise<AdapterResult> {
  const { status, body } = await fetchText(buildWhoDonUrl(baseUrl), "application/json");
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new IngestionError("WHO DON endpoint did not return JSON", status);
  }
  return { httpStatus: status, ...parseWhoDon(json) };
}
