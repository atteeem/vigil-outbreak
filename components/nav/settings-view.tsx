"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TIME_PREF_KEY } from "@/components/ui/time";
import { BASEMAP_PREF_KEY } from "@/components/map/outbreak-map";
import { fmtUtc, relative } from "@/lib/utils";

const MOTION_KEY = "vigil-outbreak.reduce-motion";

interface Status { lastSuccessAt: string | null; scheduler: { running: boolean; lastTickAt: string | null }; sources: { slug: string; name: string; enabled: boolean; endpointStatus: string; lastSuccessAt: string | null; lastFetchAt: string | null; lastError: string | null; pollIntervalMinutes: number }[] }

function useStored(key: string, fallback: string): [string, (v: string) => void] {
  const [v, setV] = useState(fallback);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only preference after mount
      setV(localStorage.getItem(key) ?? fallback);
    } catch { /* ignore */ }
  }, [key, fallback]);
  return [v, (next) => { setV(next); try { localStorage.setItem(key, next); } catch { /* ignore */ } }];
}

export function SettingsView() {
  const [time, setTime] = useStored(TIME_PREF_KEY, "utc");
  const [basemap, setBasemap] = useStored(BASEMAP_PREF_KEY, "map");
  const [motion, setMotion] = useStored(MOTION_KEY, "system");
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => { fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => undefined); }, []);
  useEffect(() => { document.documentElement.dataset.reduceMotion = motion === "reduce" ? "true" : "false"; }, [motion]);
  const row = "flex flex-wrap items-center justify-between gap-3 px-4 py-3";
  return (
    <main className="mx-auto max-w-3xl px-3 pb-12 pt-4 sm:px-4">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <p className="mb-4 text-xs text-ink-dim">Preferences are stored in this browser only.</p>
      <section className="panel mb-4 divide-y divide-line">
        <div className={row}><div><p className="text-sm">Time display</p><p className="text-xs text-ink-faint">UTC is the default for an international audience.</p></div>
          <select className="field w-auto" value={time} onChange={(e) => setTime(e.target.value)} data-testid="pref-time"><option value="utc">UTC</option><option value="local">Local time zone</option></select></div>
        <div className={row}><div><p className="text-sm">Default basemap</p><p className="text-xs text-ink-faint">Satellite imagery: Esri World Imagery (requires network access).</p></div>
          <select className="field w-auto" value={basemap} onChange={(e) => setBasemap(e.target.value)}><option value="map">Map</option><option value="satellite">Satellite</option></select></div>
        <div className={row}><div><p className="text-sm">Motion</p><p className="text-xs text-ink-faint">Reduce animated transitions.</p></div>
          <select className="field w-auto" value={motion} onChange={(e) => setMotion(e.target.value)}><option value="system">Follow system</option><option value="reduce">Reduce</option></select></div>
      </section>
      <h2 className="eyebrow mb-2">Data sources & freshness</h2>
      <section className="panel divide-y divide-line text-xs" data-testid="source-status">
        {!status && <p className="px-4 py-3 text-ink-faint">Loading…</p>}
        {status && (
          <div className="px-4 py-3">
            Scheduler: <span className={status.scheduler.running ? "text-ok" : "text-warn"}>{status.scheduler.running ? "running" : "not running in this server process"}</span>
            {status.scheduler.lastTickAt && <> · last tick {relative(status.scheduler.lastTickAt)}</>}
            {" · "}Last successful fetch: {status.lastSuccessAt ? fmtUtc(status.lastSuccessAt) : "never"}
          </div>
        )}
        {status?.sources.map((s) => (
          <div key={s.slug} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <div><p className="text-[13px]">{s.name}</p><p className="text-ink-faint">{s.enabled ? `every ${s.pollIntervalMinutes} min` : "disabled"} · endpoint {s.endpointStatus.toLowerCase()} · last success {s.lastSuccessAt ? relative(s.lastSuccessAt) : "never"}</p>{s.lastError && <p className="text-danger">{s.lastError}</p>}</div>
          </div>
        ))}
      </section>
      <p className="mt-4 text-xs text-ink-faint">Administrators: <Link className="text-accent" href="/admin">open the admin console</Link>.</p>
    </main>
  );
}
