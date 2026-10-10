"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Menu, Search, Settings, X } from "lucide-react";
import { cn, relative } from "@/lib/utils";
import { ClassificationDot } from "@/components/ui/badges";

const LINKS = [
  { href: "/", label: "Investigation" },
  { href: "/map", label: "Live Map" },
  { href: "/timeline", label: "Timeline" },
  { href: "/intelligence", label: "Intelligence" },
  { href: "/global", label: "Global watch" },
  { href: "/analytics", label: "Analytics" },
];

const SEEN_KEY = "vigil-outbreak.notifications.seen";

interface StatusResponse {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  live: { state: "LIVE" | "STALE" | "DOWN" | "NOT_CONFIGURED"; label: string; detail: string; lastLiveSuccessAt: string | null };
  scheduler: { running: boolean };
}

/** Live indicator states are derived from real ingestion freshness — never shown as LIVE unless the scheduler
 * is running and an automatic source succeeded within two polling intervals. */
function useStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/status", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => alive && s && setStatus(s))
        .catch(() => undefined);
    void load();
    const t = setInterval(() => {
      setNow(Date.now());
      void load();
    }, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return { status, now };
}

function LiveIndicator() {
  const { status, now } = useStatus();
  // The state is computed server-side (lib/domain/live-status.ts) from real, non-fixture source successes only.
  let state: "live" | "stale" | "down" | "offline" | "loading" = "loading";
  let label = "…";
  let detail = "Checking ingestion status…";
  if (status) {
    state = ({ LIVE: "live", STALE: "stale", DOWN: "down", NOT_CONFIGURED: "offline" } as const)[status.live.state];
    label = status.live.state === "LIVE" ? "Live" : status.live.state === "STALE" && status.live.lastLiveSuccessAt ? "Stale" : "Not live";
    detail = `${status.live.detail}${status.live.lastLiveSuccessAt ? ` Last successful live ingestion ${relative(status.live.lastLiveSuccessAt, now)}.` : " No live ingestion has succeeded yet."}${status.scheduler.running ? "" : " (In-process scheduler not running.)"}`;
  }
  const style = { live: "text-ok", stale: "text-warn", down: "text-danger", offline: "text-ink-faint", loading: "text-ink-faint" }[state];
  return (
    <span data-testid="live-indicator" data-state={state} title={detail} className={cn("flex items-center gap-1.5 rounded-full border border-line px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", style)}>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", state === "live" && "animate-pulse-soft")} />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </span>
  );
}

interface SearchResult {
  outbreaks: { slug: string; title: string; classification: string; countryName: string }[];
  articles: { id: string; title: string; url: string; sourceName: string; publishedAt: string; outbreakSlug: string | null }[];
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then(setRes)
        .catch(() => undefined);
    }, 180);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);
  const shown = q.trim().length >= 2 ? res : null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Search">
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-line-strong bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="h-4 w-4 text-ink-faint" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onClose()} placeholder="Search outbreaks, pathogens, places, reports…" className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint" data-testid="search-input" />
          <kbd className="rounded border border-line px-1.5 text-[10px] text-ink-faint">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2 text-sm">
          {!shown ? (
            <p className="px-2 py-6 text-center text-xs text-ink-faint">Type at least two characters.</p>
          ) : shown.outbreaks.length + shown.articles.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-ink-faint">No matches.</p>
          ) : (
            <>
              {shown.outbreaks.length > 0 && <p className="eyebrow px-2 pb-1 pt-2">Outbreaks & investigations</p>}
              {shown.outbreaks.map((o) => (
                <button key={o.slug} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-hover" onClick={() => { router.push(`/outbreaks/${o.slug}`); onClose(); }}>
                  <ClassificationDot classification={o.classification} />
                  <span className="flex-1 truncate">{o.title}</span>
                  <span className="text-xs text-ink-faint">{o.countryName}</span>
                </button>
              ))}
              {shown.articles.length > 0 && <p className="eyebrow px-2 pb-1 pt-3">Reports</p>}
              {shown.articles.map((a) => (
                <a key={a.id} href={a.outbreakSlug ? `/outbreaks/${a.outbreakSlug}` : a.url} target={a.outbreakSlug ? undefined : "_blank"} rel="noreferrer" className="block rounded-md px-2 py-2 hover:bg-hover" onClick={onClose}>
                  <span className="line-clamp-1">{a.title}</span>
                  <span className="text-xs text-ink-faint">{a.sourceName}</span>
                </a>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface FeedItem { id: string; title: string; url: string; sourceName: string; publishedAt: string; fetchedAt: string; outbreak: { slug: string } | null }

function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [seen, setSeen] = useState<number>(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only preference
      setSeen(Number(localStorage.getItem(SEEN_KEY)) || 0);
    } catch { /* ignore */ }
    fetch("/api/feed?limit=12", { cache: "no-store" }).then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  // "New" = arrived in this system (fetchedAt) since the viewer last opened the panel.
  const unseen = items.filter((i) => new Date(i.fetchedAt).getTime() > seen).length;
  const toggle = useCallback(() => {
    setOpen((v) => {
      if (!v) {
        const t = Date.now();
        try { localStorage.setItem(SEEN_KEY, String(t)); } catch { /* ignore */ }
        setTimeout(() => setSeen(t), 1500);
      }
      return !v;
    });
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} aria-label={`Notifications${unseen ? ` (${unseen} new)` : ""}`} className="relative rounded-md p-2 text-ink-dim hover:bg-hover hover:text-ink" data-testid="notifications-button">
        <Bell className="h-4 w-4" />
        {unseen > 0 && <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-bold text-bg">{unseen > 9 ? "9+" : unseen}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line-strong bg-panel shadow-2xl" data-testid="notifications-panel">
          <div className="panel-head"><span className="eyebrow">Latest reports</span></div>
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 && <li className="px-3 py-6 text-center text-xs text-ink-faint">No reports yet.</li>}
            {items.map((i) => (
              <li key={i.id} className="border-b border-line last:border-0">
                <a href={i.outbreak ? `/outbreaks/${i.outbreak.slug}` : i.url} target={i.outbreak ? undefined : "_blank"} rel="noreferrer" className="block px-3 py-2 hover:bg-hover">
                  <span className="line-clamp-2 text-xs">{new Date(i.fetchedAt).getTime() > seen && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />}{i.title}</span>
                  <span className="text-[10px] text-ink-faint">{i.sourceName} · {relative(i.publishedAt)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const active = (href: string) => (href === "/" ? pathname === "/" : href === "/global" ? pathname.startsWith("/global") || pathname === "/outbreaks" : pathname.startsWith(href));
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-[1920px] items-center gap-2 px-2 sm:gap-3 sm:px-4">
        <button className="rounded-md p-1.5 text-ink-dim hover:bg-hover lg:hidden" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)} data-testid="mobile-menu-button">
          {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="VIGIL OUTBREAK home">
          <svg viewBox="0 0 20 20" className="h-5 w-5 text-accent" aria-hidden>
            <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
            <circle cx="10" cy="10" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="10" cy="10" r="1.6" fill="currentColor" />
          </svg>
          <span className="whitespace-nowrap text-[12px] font-semibold tracking-[0.1em] sm:text-[13px] sm:tracking-[0.18em]">VIGIL <span className="text-accent">OUTBREAK</span></span>
        </Link>
        <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-[13px] transition-colors", active(l.href) ? "bg-raised text-ink" : "text-ink-dim hover:bg-hover hover:text-ink")}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          <LiveIndicator />
          <button onClick={() => setSearchOpen(true)} aria-label="Search" className="flex items-center gap-2 rounded-md p-2 text-ink-dim hover:bg-hover hover:text-ink sm:border sm:border-line sm:px-2.5 sm:py-1.5" data-testid="search-button">
            <Search className="h-4 w-4" />
            <span className="hidden text-xs text-ink-faint xl:inline">Search</span>
            <kbd className="hidden rounded border border-line px-1 text-[10px] text-ink-faint xl:inline">⌘K</kbd>
          </button>
          <Notifications />
          <Link href="/settings" aria-label="Settings" className={cn("rounded-md p-2 hover:bg-hover hover:text-ink", active("/settings") ? "text-ink" : "text-ink-dim")}>
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>
      {menuOpen && (
        <nav className="border-t border-line px-3 py-2 lg:hidden" aria-label="Primary mobile">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className={cn("block rounded-md px-3 py-2 text-sm", active(l.href) ? "bg-raised text-ink" : "text-ink-dim")}>
              {l.label}
            </Link>
          ))}
        </nav>
      )}
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
    </header>
  );
}
