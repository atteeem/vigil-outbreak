// Feed discovery from an official index page (e.g. https://www.ecdc.europa.eu/en/rss-feeds), so verification
// tests the feeds the publisher itself lists instead of URLs guessed from third-party directories.
import { decodeEntities, stripHtml } from "./normalize";

export interface DiscoveredFeed {
  url: string;
  label: string;
}

/** Navigation/accessibility links that are never feeds even when their URL resembles one. */
const NON_FEED_LABEL = /^(skip to|jump to|back to top|go to|main content|menu|search|home|share|print)\b/i;

/** A URL path/query that denotes a feed document: …/feed, …/rss, *.rss, *.xml, *.atom, or ?format=rss/atom. A path
 * segment merely starting with "rss" (e.g. the index page /en/rss-feeds) is NOT a feed. */
export function looksLikeFeedUrl(url: URL): boolean {
  const p = url.pathname.toLowerCase().replace(/\/+$/, "");
  return /\/(feed|rss|atom)$/.test(p) || /\.(rss|xml|atom)$/.test(p) || /(^|&)(format|type)=(rss|atom)\b/i.test(url.search.slice(1));
}

/** Extracts same-site links that point at feed documents, excluding in-page anchors (e.g. "Skip to main content",
 * whose `#main-content` href resolves to the index page itself), the index page, and navigation links. */
export function parseFeedLinks(html: string, pageUrl: string): DiscoveredFeed[] {
  const page = new URL(pageUrl);
  page.hash = "";
  const out = new Map<string, DiscoveredFeed>();
  const re = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[2]!.trim());
    if (!href || href.startsWith("#") || /^(javascript|mailto|tel):/i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, page);
    } catch {
      continue;
    }
    url.hash = "";
    if (url.host !== page.host || !/^https?:$/.test(url.protocol)) continue;
    if (url.href === page.href || url.pathname.replace(/\/+$/, "") === page.pathname.replace(/\/+$/, "")) continue;
    if (!looksLikeFeedUrl(url)) continue;
    const label = stripHtml(m[3]).replace(/\s+/g, " ").trim() || url.pathname;
    if (NON_FEED_LABEL.test(label)) continue;
    if (!out.has(url.href)) out.set(url.href, { url: url.href, label });
  }
  return [...out.values()];
}
