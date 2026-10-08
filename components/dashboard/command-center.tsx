"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Filter, RotateCcw } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { DashboardDTO, OutbreakDetailDTO, OutbreakSummaryDTO } from "@/lib/server/queries";
import { OutbreakMap } from "@/components/map/outbreak-map";
import { markersFor } from "@/lib/map/markers";
import { DetailPanel } from "@/components/dashboard/detail-panel";
import { TimelineControls } from "@/components/dashboard/timeline-controls";
import { useTimeline } from "@/hooks/use-timeline";
import { ClassificationBadge, ClassificationDot, SourceTypeBadge, VerificationBadge } from "@/components/ui/badges";
import { Time } from "@/components/ui/time";
import { EmptyState } from "@/components/ui/empty-state";
import { CLASSIFICATIONS, CLASSIFICATION_LABEL, UPDATE_KIND_LABEL } from "@/lib/domain/enums";
import { formatCount } from "@/lib/domain/stats";
import { cn, relative } from "@/lib/utils";

export interface DashboardFilters {
  disease: string;
  country: string;
  status: string[];
  since: string;
  q: string;
}

export const EMPTY_FILTERS: DashboardFilters = { disease: "", country: "", status: [], since: "", q: "" };

function filtersToParams(f: DashboardFilters, asOf: Date | null): URLSearchParams {
  const p = new URLSearchParams();
  if (f.disease) p.set("disease", f.disease);
  if (f.country) p.set("country", f.country);
  if (f.status.length) p.set("status", f.status.join(","));
  if (f.since) p.set("since", f.since);
  if (f.q) p.set("q", f.q);
  if (asOf) p.set("asOf", asOf.toISOString());
  return p;
}

function Kpi({ label, value, sub, testId, tone }: { label: string; value: string; sub?: string; testId: string; tone?: "warn" | "ok" | "dim" }) {
  return (
    <div className="min-w-0 bg-panel px-4 py-2.5" data-testid={testId}>
      <p className="eyebrow truncate">{label}</p>
      <p className={cn("num mt-0.5 truncate text-xl font-semibold", tone === "warn" && "text-warn", tone === "dim" && "text-ink-dim text-sm font-medium")}>{value}</p>
      {sub && <p className="truncate text-[10px] text-ink-faint">{sub}</p>}
    </div>
  );
}

export function CommandCenter({ initial, initialFilters, initialAsOf, variant }: { initial: DashboardDTO; initialFilters: DashboardFilters; initialAsOf: string | null; variant: "overview" | "map" }) {
  const [filters, setFilters] = useState<DashboardFilters>(initialFilters);
  const [data, setData] = useState<DashboardDTO>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tl = useTimeline(initialAsOf ? new Date(initialAsOf) : null);
  const asOf = tl.state.asOf;
  const featured = initial.outbreaks.find((o) => o.featured)?.slug ?? null;
  const [selected, setSelected] = useState<string | null>(variant === "overview" ? featured : null);
  const [detail, setDetail] = useState<OutbreakDetailDTO | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lng: number; lat: number; zoom: number; key: string } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const first = useRef(true);

  const asOfIso = asOf?.toISOString() ?? null;
  const query = useMemo(() => filtersToParams(filters, asOf).toString(), [filters, asOf]);

  useEffect(() => {
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    if (first.current) {
      first.current = false;
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/dashboard?${query}`, { signal: ctl.signal, cache: "no-store" })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          setData(await r.json());
          setError(null);
        })
        .catch((e: Error) => e.name !== "AbortError" && setError(`Could not refresh data (${e.message}). Showing the last loaded view.`))
        .finally(() => setLoading(false));
    }, 120);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query]);

  // Live view refreshes itself every minute so newly ingested reports appear without a reload.
  useEffect(() => {
    if (asOf) return;
    const t = setInterval(() => {
      fetch(`/api/dashboard?${query}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setData(d)).catch(() => undefined);
    }, 60_000);
    return () => clearInterval(t);
  }, [asOf, query]);

  useEffect(() => {
    if (!selected) return;
    const ctl = new AbortController();
    const key = `${selected}|${asOfIso}`;
    fetch(`/api/outbreaks/${selected}${asOfIso ? `?asOf=${encodeURIComponent(asOfIso)}` : ""}`, { signal: ctl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setDetail(d);
        setLoadedKey(key);
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, [selected, asOfIso]);

  const select = useCallback(
    (slug: string, fly = false) => {
      setSelected(slug);
      if (fly) {
        const o = data.outbreaks.find((x) => x.slug === slug);
        const l = o?.locations[0];
        if (l) setFocus({ lng: l.lng, lat: l.lat, zoom: l.precision === "COUNTRY" ? 3.5 : 6, key: `${slug}-${Date.now()}` });
      }
    },
    [data.outbreaks],
  );

  const markers = useMemo(() => markersFor(data.outbreaks), [data.outbreaks]);
  const activeFilterCount = (filters.disease ? 1 : 0) + (filters.country ? 1 : 0) + (filters.status.length ? 1 : 0) + (filters.since ? 1 : 0) + (filters.q ? 1 : 0);
  const k = data.kpis;
  // Relative times are computed against the server's generation time so SSR and hydration render identical text.
  const refNow = Date.parse(data.generatedAt);
  const diseaseOptions = data.diseases;

  const filterPanel = (
    <div className="space-y-3 p-3" data-testid="filter-panel">
      <div>
        <label className="eyebrow mb-1 block" htmlFor="f-q">Search</label>
        <input id="f-q" className="field" placeholder="Title, place, pathogen…" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="eyebrow mb-1 block" htmlFor="f-disease">Disease</label>
          <select id="f-disease" className="field" value={filters.disease} onChange={(e) => setFilters((f) => ({ ...f, disease: e.target.value }))} data-testid="filter-disease">
            <option value="">All diseases</option>
            {diseaseOptions.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="eyebrow mb-1 block" htmlFor="f-country">Country</label>
          <select id="f-country" className="field" value={filters.country} onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))} data-testid="filter-country">
            <option value="">All countries</option>
            {data.countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="eyebrow mb-1 block" htmlFor="f-since">Last activity</label>
        <select id="f-since" className="field" value={filters.since} onChange={(e) => setFilters((f) => ({ ...f, since: e.target.value }))} data-testid="filter-since">
          <option value="">Any time</option>
          <option value="1">Past 24 hours</option>
          <option value="7">Past 7 days</option>
          <option value="30">Past 30 days</option>
          <option value="90">Past 90 days</option>
        </select>
      </div>
      <fieldset>
        <legend className="eyebrow mb-1">Status</legend>
        <div className="flex flex-wrap gap-1.5">
          {CLASSIFICATIONS.map((c) => {
            const on = filters.status.includes(c);
            return (
              <button key={c} type="button" aria-pressed={on} onClick={() => setFilters((f) => ({ ...f, status: on ? f.status.filter((x) => x !== c) : [...f.status, c] }))} className={cn("flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors", on ? "border-line-strong bg-raised text-ink" : "border-line text-ink-dim hover:text-ink")} data-testid={`filter-status-${c}`}>
                <ClassificationDot classification={c} className="h-2 w-2" />
                {CLASSIFICATION_LABEL[c]}
              </button>
            );
          })}
        </div>
      </fieldset>
      {activeFilterCount > 0 && (
        <button className="btn w-full justify-center" onClick={() => setFilters(EMPTY_FILTERS)} data-testid="clear-filters"><RotateCcw className="h-3 w-3" /> Clear filters</button>
      )}
    </div>
  );

  const list = (
    <ul className="divide-y divide-line" data-testid="outbreak-list">
      {data.outbreaks.length === 0 && <li className="p-3"><EmptyState title="No events match" testId="list-empty">Adjust filters or the timeline.</EmptyState></li>}
      {data.outbreaks.map((o) => (
        <li key={o.slug}>
          <button onClick={() => select(o.slug, true)} className={cn("w-full px-3 py-2.5 text-left transition-colors hover:bg-hover", selected === o.slug && "bg-raised")} data-testid={`outbreak-item-${o.slug}`} aria-current={selected === o.slug}>
            <div className="flex items-start gap-2">
              <ClassificationDot classification={o.classification} className="mt-1" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[12.5px] font-medium leading-snug">{o.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                  {o.countryName} · {o.disease ? o.disease.name : o.suspectedDisease ? `${o.suspectedDisease.name}? (unconfirmed)` : "Unknown cause"}
                </p>
                <p className="mt-0.5 text-[10.5px] text-ink-faint">
                  {o.cases.confirmedCases !== null ? <span className="num text-ink-dim">{formatCount(o.cases.confirmedCases)} confirmed · </span> : null}
                  updated {relative(o.lastActivityAt, asOf?.getTime() ?? refNow)}
                </p>
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );

  const developments = (
    <ul className="divide-y divide-line" data-testid="developments">
      {data.developments.length === 0 && <li className="p-3 text-xs text-ink-faint">No verified developments at this time.</li>}
      {data.developments.map((d) => (
        <li key={d.id}>
          <button onClick={() => select(d.outbreakSlug, true)} className="w-full px-3 py-2 text-left hover:bg-hover">
            <p className="text-[10px] text-ink-faint"><Time iso={d.publishedAt} /> · {UPDATE_KIND_LABEL[d.kind] ?? d.kind}</p>
            <p className="line-clamp-2 text-xs leading-snug">{d.title}</p>
            <p className="truncate text-[10.5px] text-ink-faint">{d.attributedTo}</p>
          </button>
        </li>
      ))}
    </ul>
  );

  const feed = (
    <ul className="divide-y divide-line" data-testid="intel-feed">
      {data.feed.length === 0 && <li className="p-3 text-xs text-ink-faint">No reports published at this time.</li>}
      {data.feed.slice(0, 12).map((i) => (
        <li key={i.id} className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-ink-faint">
            <SourceTypeBadge type={i.sourceType} />
            <span>{i.sourceName}</span>·<Time iso={i.publishedAt} />
            {i.reviewStatus === "PENDING" && <span className="text-warn">· awaiting review</span>}
          </div>
          {i.outbreak ? (
            <button onClick={() => select(i.outbreak!.slug, true)} className="mt-0.5 line-clamp-2 text-left text-xs leading-snug hover:text-accent">{i.title}</button>
          ) : (
            <a href={i.url} target="_blank" rel="noreferrer" className="mt-0.5 line-clamp-2 text-xs leading-snug hover:text-accent">{i.title} <ExternalLink className="inline h-3 w-3" /></a>
          )}
          <p className="mt-0.5 text-[10.5px] text-ink-faint">{i.countries.map((c) => c.name).join(", ") || "Location not stated"} · {i.diseases.length ? i.diseases.map((d) => d.name).join(", ") : "Unknown cause / unspecified"}</p>
        </li>
      ))}
    </ul>
  );

  const trend = (
    <div className="h-full min-h-[120px] px-2 pb-2" data-testid="trend-chart">
      {data.trend.every((d) => d.official + d.media === 0) ? (
        <EmptyState title="No reports in the last 30 days" className="h-full py-4" />
      ) : (
        <ResponsiveContainer width="100%" height="100%" minHeight={110}>
          <BarChart data={data.trend} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} tick={{ fill: "#5f6873", fontSize: 9 }} axisLine={false} tickLine={false} interval={6} />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#151a1f", border: "1px solid rgba(255,255,255,0.13)", borderRadius: 6, fontSize: 11 }} labelStyle={{ color: "#98a1ad" }} />
            <Bar dataKey="official" name="Official" stackId="a" fill="#3fd0c9" radius={[0, 0, 0, 0]} />
            <Bar dataKey="media" name="Media" stackId="a" fill="#5f6873" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );

  const timeline = (
    <TimelineControls
      state={tl.state}
      onPreset={tl.selectPreset}
      onCustom={tl.selectCustom}
      onLive={tl.live}
      onPlay={tl.play}
      onPause={tl.pause}
      onStep={tl.step}
      onSpeed={tl.setSpeed}
      onScrub={tl.scrub}
    />
  );

  const mapHeight = variant === "map" ? "h-[60vh] lg:h-[calc(100vh-12.5rem)]" : "h-[52vh] lg:h-full";

  return (
    <main className="mx-auto max-w-[1920px] px-2 pb-6 pt-2 sm:px-3" data-testid={`command-center-${variant}`}>
      {asOf && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-warn/30 bg-warn/[0.06] px-3 py-1.5 text-xs text-warn" role="status" data-testid="historical-banner">
          <span>Historical view — showing only information published by <Time iso={asOfIso} />.</span>
          <button className="btn py-0.5" onClick={tl.live}>Return to live</button>
        </div>
      )}
      {error && <div className="mb-2 rounded-md border border-danger/30 bg-danger/[0.06] px-3 py-1.5 text-xs text-danger" role="alert">{error}</div>}

      {variant === "overview" && (
        <section className="mb-2 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 lg:grid-cols-5" aria-label="Key indicators" data-testid="kpi-strip">
          <Kpi label="Monitored investigations" value={String(k.monitoredInvestigations)} sub="unconfirmed + suspected" testId="kpi-investigations" />
          <Kpi label="Confirmed active outbreaks" value={String(k.confirmedActive)} sub="localized + widespread" testId="kpi-confirmed" />
          <Kpi label="New reports (24h)" value={String(k.newReports24h)} sub="by publication time" testId="kpi-new-reports" />
          <Kpi label="Countries with activity" value={String(k.countriesWithActivity)} sub="excludes resolved" testId="kpi-countries" />
          <Kpi label="Last successful refresh" value={k.lastSuccessfulRefresh ? relative(k.lastSuccessfulRefresh, refNow) : "No successful fetch yet"} sub={k.lastAttempt ? `last attempt ${relative(k.lastAttempt, refNow)}` : "automatic sources have not run"} testId="kpi-refresh" tone={k.lastSuccessfulRefresh ? undefined : "dim"} />
        </section>
      )}

      <div className={cn("grid grid-cols-1 gap-2", "lg:grid-cols-[300px_minmax(0,1fr)_340px]", variant === "overview" && "lg:h-[calc(100vh-17.5rem)] lg:min-h-[560px]")}>
        {/* Left */}
        <aside className="order-2 flex min-h-0 min-w-0 flex-col gap-2 lg:order-1 lg:overflow-y-auto">
          <div className="panel">
            <button className="panel-head w-full lg:cursor-default" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}>
              <span className="eyebrow flex items-center gap-1.5"><Filter className="h-3 w-3" /> Filters{activeFilterCount ? <span className="text-accent">({activeFilterCount})</span> : null}</span>
              <span className="text-[10px] text-ink-faint lg:hidden">{filtersOpen ? "Hide" : "Show"}</span>
            </button>
            <div className={cn(filtersOpen ? "block" : "hidden", "lg:block")}>{filterPanel}</div>
          </div>
          <div className="panel flex min-h-[220px] shrink-0 flex-col lg:min-h-[260px] lg:flex-1">
            <div className="panel-head"><span className="eyebrow">Outbreaks & investigations</span><span className="num text-[11px] text-ink-faint" data-testid="list-count">{data.outbreaks.length}/{data.totalOutbreaks}</span></div>
            <div className="max-h-80 min-h-0 flex-1 overflow-y-auto lg:max-h-none">{list}</div>
          </div>
          {variant === "overview" && (
            <div className="panel flex max-h-72 shrink-0 flex-col">
              <div className="panel-head"><span className="eyebrow">Latest verified developments</span></div>
              <div className="min-h-0 flex-1 overflow-y-auto">{developments}</div>
            </div>
          )}
        </aside>

        {/* Center */}
        <section className="order-1 flex min-h-0 min-w-0 flex-col gap-2 lg:order-2">
          <div className={cn("panel relative min-h-0 flex-none overflow-hidden lg:flex-1", mapHeight)}>
            <OutbreakMap markers={markers} selectedSlug={selected} onSelect={(s) => select(s)} focus={focus} className="absolute inset-0" />
            {loading && <span className="absolute right-12 top-2 z-10 rounded bg-panel/90 px-2 py-1 text-[10px] text-ink-dim">Updating…</span>}
          </div>
          <div className="panel p-3">{timeline}</div>
        </section>

        {/* Right */}
        <aside className="panel order-3 min-h-0 min-w-0 overflow-y-auto lg:max-h-full" aria-label="Selected event details">
          <div className="panel-head"><span className="eyebrow">Selected event</span>{selected && <button className="text-[10px] text-ink-faint hover:text-ink" onClick={() => setSelected(null)}>Clear</button>}</div>
          <DetailPanel detail={selected ? detail : null} loading={!!selected && loadedKey !== `${selected}|${asOfIso}`} asOf={asOfIso} />
        </aside>
      </div>

      {variant === "overview" && (
        <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="panel flex max-h-96 min-h-0 flex-col">
            <div className="panel-head"><span className="eyebrow">Intelligence feed</span><Link href="/intelligence" className="text-[11px] text-ink-dim hover:text-accent">All reports →</Link></div>
            <div className="min-h-0 overflow-y-auto">{feed}</div>
          </div>
          <div className="panel flex flex-col">
            <div className="panel-head"><span className="eyebrow">Reporting volume · 30 days</span><span className="flex items-center gap-2 text-[10px] text-ink-faint"><span className="inline-block h-2 w-2 rounded-sm bg-accent" />Official<span className="inline-block h-2 w-2 rounded-sm bg-ink-faint" />Media</span></div>
            <div className="h-44">{trend}</div>
            <div className="border-t border-line px-3 py-2">
              <p className="eyebrow mb-1">By disease</p>
              <div className="flex flex-wrap gap-1.5">
                {data.diseases.filter((d) => d.count > 0).map((d) => (
                  <button key={d.slug} onClick={() => setFilters((f) => ({ ...f, disease: f.disease === d.slug ? "" : d.slug }))} className={cn("rounded border px-1.5 py-0.5 text-[11px]", filters.disease === d.slug ? "border-accent/40 text-accent" : "border-line text-ink-dim hover:text-ink")}>
                    {d.name} <span className="num text-ink-faint">{d.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {variant === "map" && selected && detail && !detail.notYetReported && detail.slug === selected && (
        <p className="mt-2 text-[11px] text-ink-faint">Selected: <ClassificationBadge classification={detail.classification} /> {detail.title}</p>
      )}
    </main>
  );
}
