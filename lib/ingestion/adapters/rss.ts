// RSS 2.0 / Atom adapter (ECDC, CDC and other official feeds; optional media feeds).
import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../http";
import { parseDate, stripHtml } from "../normalize";
import { IngestionError, type AdapterResult, type FetchedItem } from "../types";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", cdataPropName: "#cdata" });

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number") return String(v).trim() || null;
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return text(o["#cdata"] ?? o["#text"]);
  }
  return null;
}

function atomLink(v: unknown): string | null {
  const links = Array.isArray(v) ? v : [v];
  for (const l of links) {
    if (typeof l === "string") return l;
    const o = l as Record<string, unknown> | undefined;
    if (o && (o["@_rel"] === undefined || o["@_rel"] === "alternate") && typeof o["@_href"] === "string") return o["@_href"] as string;
  }
  return null;
}

const asArray = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function parseFeed(xml: string, feedUrl: string): { items: FetchedItem[]; itemErrors: string[] } {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch (err) {
    throw new IngestionError(`Feed is not valid XML: ${(err as Error).message}`);
  }
  const rss = doc.rss as { channel?: { item?: unknown } } | undefined;
  const feed = doc.feed as { entry?: unknown } | undefined;
  const rdf = doc["rdf:RDF"] as { item?: unknown } | undefined;
  const rows = (rss?.channel ? asArray(rss.channel.item) : feed ? asArray(feed.entry) : rdf ? asArray(rdf.item) : null) as Record<string, unknown>[] | null;
  if (!rows) throw new IngestionError("Response is XML but not an RSS/Atom feed");
  const items: FetchedItem[] = [];
  const itemErrors: string[] = [];
  for (const row of rows) {
    const title = stripHtml(text(row.title));
    const link = text(row.link) && typeof row.link !== "object" ? text(row.link) : atomLink(row.link) ?? text(row.guid);
    const publishedAt = parseDate(text(row.pubDate) ?? text(row.published) ?? text(row.updated) ?? text(row["dc:date"]));
    if (!title || !link || !publishedAt) {
      itemErrors.push(`Skipped feed item "${title || "(untitled)"}": missing ${[!title && "title", !link && "link", !publishedAt && "date"].filter(Boolean).join(", ")}`);
      continue;
    }
    let url = link;
    try {
      url = new URL(link, feedUrl).toString();
    } catch {
      /* keep as is */
    }
    const body = stripHtml(text(row.description) ?? text(row.summary) ?? text(row.content) ?? text(row["content:encoded"]));
    items.push({ externalId: text(row.guid) ?? text(row.id), url, title, text: body, publishedAt, language: null, raw: row });
  }
  return { items, itemErrors };
}

export async function fetchRss(url: string): Promise<AdapterResult> {
  const { status, body } = await fetchText(url, "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9");
  return { httpStatus: status, ...parseFeed(body, url) };
}
