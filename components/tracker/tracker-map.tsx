"use client";

// Live Map for the tracked investigation: starts on Irkutsk / Shelekhov, draws only analyst-verified locations by
// role (investigation site, suspected case, confirmed case, precautionary measure), and widens to the world when
// verified case locations exist elsewhere. Unrelated outbreaks are off by default and drawn faded when shown.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Globe2 } from "lucide-react";
import { OutbreakMap, type MapMarker } from "@/components/map/outbreak-map";
import { TimelineControls } from "@/components/dashboard/timeline-controls";
import { useTimeline } from "@/hooks/use-timeline";
import { VerificationBadge } from "@/components/ui/badges";
import { markersFor } from "@/lib/map/markers";
import { cn, fmtUtc } from "@/lib/utils";
import { LOCATION_ROLE_LABEL, type LocationRole } from "@/lib/tracked/timeline";
import type { TrackerDTO, TrackerLocation } from "@/lib/server/tracker";
import type { DashboardDTO } from "@/lib/server/queries";
import { InvestigationLegend, SourceLink, SpreadBanner } from "./parts";
import { locationMarkers, mappable } from "./markers";
import { HistoricalBanner } from "./as-of-control";

const ROLE_ORDER: LocationRole[] = ["CONFIRMED_CASE", "SUSPECTED_CASE", "CASE_LOCATION", "AFFECTED_AREA", "INVESTIGATION_SITE", "PRECAUTIONARY_MEASURE"];

export function TrackerMap({ initial }: { initial: TrackerDTO }) {
  const tl = useTimeline(initial.asOf ? new Date(initial.asOf) : null);
  const asOfIso = tl.state.asOf?.toISOString() ?? null;
  const [t, setT] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [others, setOthers] = useState<MapMarker[]>([]);
  const [focus, setFocus] = useState<{ lng: number; lat: number; zoom: number; key: string } | null>(null);
  const first = useRef(true);
  const focusSeq = useRef(0);
  const flyTo = (lng: number, lat: number, zoom: number) => setFocus({ lng, lat, zoom, key: String(++focusSeq.current) });

  // Reload the investigation as known at the playback time (or live).
  useEffect(() => {
    window.history.replaceState(null, "", asOfIso ? `?asOf=${encodeURIComponent(asOfIso)}` : window.location.pathname);
    if (first.current) {
      first.current = false;
      return;
    }
    const ctl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/tracker${asOfIso ? `?asOf=${encodeURIComponent(asOfIso)}` : ""}`, { signal: ctl.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d: TrackerDTO) => { setT(d); setError(null); })
        .catch((e: Error) => e.name !== "AbortError" && setError(`Could not refresh (${e.message}).`));
    }, 120);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [asOfIso]);

  // Live view refreshes every minute.
  useEffect(() => {
    if (asOfIso) return;
    const id = setInterval(() => {
      fetch("/api/tracker", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d: TrackerDTO | null) => d && setT(d)).catch(() => undefined);
    }, 60_000);
    return () => clearInterval(id);
  }, [asOfIso]);

  // Other (unrelated) outbreaks: only fetched when the user asks for them.
  useEffect(() => {
    if (!showOthers) return;
    let alive = true;
    fetch(`/api/dashboard${asOfIso ? `?asOf=${encodeURIComponent(asOfIso)}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DashboardDTO | null) => {
        if (!alive || !d) return;
        setOthers(markersFor(d.outbreaks.filter((o) => o.slug !== initial.event.slug)).map((m) => ({ ...m, id: `other-${m.id}`, muted: true })));
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [showOthers, asOfIso, initial.event.slug]);

  const own = useMemo(() => locationMarkers(t), [t]);
  const markers = useMemo(() => (showOthers ? [...others, ...own] : own), [showOthers, others, own]);
  const spreadOutside = t.spread.state === "SPREAD_VERIFIED";
  // Start on the origin; when verified cases exist elsewhere, start on the world view instead.
  const initialView = useMemo(
    () => (spreadOutside ? { center: [t.event.map.lng, 35] as [number, number], zoom: 1.3 } : { center: [t.event.map.lng, t.event.map.lat] as [number, number], zoom: t.event.map.zoom }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once at mount
    [],
  );
  const selected = t.locations.find((l) => l.id === selectedId) ?? null;
  const mapped = t.locations.filter(mappable).sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const unmapped = t.locations.filter((l) => !mappable(l));

  const select = (l: TrackerLocation) => {
    setSelectedId(l.id);
    flyTo(l.lng, l.lat, Math.max(9, t.event.map.zoom));
  };

  return (
    <main className="mx-auto max-w-[1920px] space-y-2 px-2 pb-6 pt-2 sm:px-3" data-testid="tracker-map-page">
      {asOfIso && <HistoricalBanner asOf={asOfIso} />}
      {error && <p className="rounded-md border border-warn/30 bg-warn/[0.06] px-3 py-2 text-xs text-warn" role="alert">{error}</p>}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-2">
          <div className="panel relative h-[62vh] overflow-hidden lg:h-[calc(100vh-14rem)]">
            <OutbreakMap
              markers={markers}
              selectedId={selectedId}
              onSelectMarker={(id) => { if (!id.startsWith("other-")) setSelectedId(id); }}
              initialView={initialView}
              focus={focus}
              className="absolute inset-0"
              legend={<InvestigationLegend showOthers={showOthers} />}
            />
            <div className="absolute right-12 top-2 z-10 flex flex-col items-end gap-1 text-[11px]">
              <div className="flex overflow-hidden rounded-md border border-line-strong bg-panel/90 backdrop-blur">
                <button className="flex items-center gap-1 px-2 py-1 text-ink-dim hover:text-ink" onClick={() => flyTo(t.event.map.lng, t.event.map.lat, t.event.map.zoom)} data-testid="focus-origin"><Crosshair className="h-3 w-3" />Irkutsk area</button>
                <button className="flex items-center gap-1 border-l border-line px-2 py-1 text-ink-dim hover:text-ink" onClick={() => flyTo(t.event.map.lng, 35, 1.3)} data-testid="focus-world"><Globe2 className="h-3 w-3" />World</button>
              </div>
              <label className="flex items-center gap-1.5 rounded-md border border-line-strong bg-panel/90 px-2 py-1 text-ink-dim backdrop-blur">
                <input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} data-testid="toggle-other-outbreaks" />
                Show unrelated outbreaks
              </label>
            </div>
          </div>
          <div className="panel p-3">
            <TimelineControls state={tl.state} onPreset={tl.selectPreset} onCustom={tl.selectCustom} onLive={tl.live} onPlay={tl.play} onPause={tl.pause} onStep={tl.step} onSpeed={tl.setSpeed} onScrub={tl.scrub} />
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-2" aria-label="Investigation locations">
          <SpreadBanner spread={t.spread} originLabel={t.event.originLabel} />
          {selected && (
            <section className="panel p-3 text-xs" data-testid="location-detail">
              <div className="mb-1 flex items-center justify-between gap-2"><p className="eyebrow">{selected.roleLabel}</p><button className="text-[10px] text-ink-faint hover:text-ink" onClick={() => setSelectedId(null)}>Clear</button></div>
              <p className="text-sm font-medium" data-testid="location-detail-name">{selected.name}</p>
              <p className="text-ink-faint">{[selected.admin1, selected.countryName].filter(Boolean).join(", ")} · {selected.precision.toLowerCase()}-level coordinates</p>
              {selected.role === "PRECAUTIONARY_MEASURE" && <p className="mt-1 text-[11px] text-ink-dim">A precautionary measure (quarantine, observation, closure). It does not mean anyone here is infected.</p>}
              {selected.notes && <p className="mt-1.5 leading-snug text-ink-dim">{selected.notes}</p>}
              {selected.evidence && <p className="mt-1 leading-snug text-ink-faint">Evidence: {selected.evidence}</p>}
              <p className="mt-1.5 text-[11px] text-ink-faint">First reported {fmtUtc(selected.firstReportedAt)} · <SourceLink source={selected.source} /></p>
            </section>
          )}
          <section className="panel" data-testid="location-list">
            <div className="panel-head"><h2 className="eyebrow">On the map</h2><span className="text-[10px] text-ink-faint">{mapped.length} verified location{mapped.length === 1 ? "" : "s"}</span></div>
            <ul className="divide-y divide-line">
              {mapped.map((l) => (
                <li key={l.id}>
                  <button className={cn("w-full px-3 py-2 text-left text-xs hover:bg-hover", l.id === selectedId && "bg-raised")} onClick={() => select(l)} data-testid={`location-${l.id}`} data-role={l.role}>
                    <span className="block font-medium">{l.name}</span>
                    <span className="text-[11px] text-ink-faint">{LOCATION_ROLE_LABEL[l.role]} · {l.countryName}</span>
                  </button>
                </li>
              ))}
              {mapped.length === 0 && <li className="px-3 py-2 text-xs text-ink-faint">No verified locations at this time.</li>}
            </ul>
          </section>
          {unmapped.length > 0 && (
            <section className="panel" data-testid="unmapped-locations">
              <div className="panel-head"><h2 className="eyebrow">Reported, not verified — not mapped</h2></div>
              <ul className="divide-y divide-line">
                {unmapped.map((l) => (
                  <li key={l.id} className="space-y-0.5 px-3 py-2 text-xs">
                    <p className="flex flex-wrap items-center gap-1.5 font-medium">{l.name} <VerificationBadge status={l.verificationStatus} /></p>
                    <p className="text-[11px] text-ink-faint">{l.roleLabel} · {l.countryName} · reported {fmtUtc(l.firstReportedAt, false)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="px-1 text-[11px] text-ink-faint">Satellite imagery: use the Map / Satellite switch on the map. All outbreaks worldwide: <Link href="/global/map" className="text-accent">Global watch map</Link>.</p>
        </aside>
      </div>
    </main>
  );
}
