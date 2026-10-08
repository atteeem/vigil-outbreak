// Feed discovery from an official index page (e.g. https://www.ecdc.europa.eu/en/rss-feeds), so verification
// tests the feeds the publisher itself lists instead of URLs guessed from third-party directories.
import { decodeEntities, stripHtml } from "./normalize";

export interface DiscoveredFeed {
  url: string;
  label: string;
}

/** Extracts links that look like feeds (…/feed, .rss, .xml, rss in the path) from an HTML page. Same-site only. */
export function parseFeedLinks(html: string, pageUrl: string): DiscoveredFeed[] {
  const page = new URL(pageUrl);
  const out = new Map<string, DiscoveredFeed>();
  const re = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[2]!.trim());
    let url: URL;
    try {
      url = new URL(href, page);
    } catch {
      continue;
    }
    if (url.host !== page.host || !/^https?:$/.test(url.protocol)) continue;
    const pathAndQuery = `${url.pathname}${url.search}`;
    if (!/\/feed\/?$|\.rss$|\.xml$|[/=]rss(\b|\/|$)|format=rss/i.test(pathAndQuery)) continue;
    if (url.href === page.href) continue;
    url.hash = "";
    const label = stripHtml(m[3]).replace(/\s+/g, " ").trim() || url.pathname;
    if (!out.has(url.href)) out.set(url.href, { url: url.href, label });
  }
  return [...out.values()];
}
