"use client";

// Tracked-event configuration: which outbreak the main dashboard follows and how articles are matched to it.
import { useState } from "react";
import { useAction, Flash } from "./use-action";

export interface TrackedConfig {
  name: string; active: boolean; primary: boolean; originAdmin1: string | null;
  anchorTerms: string[]; contextTerms: string[]; weakAnchorTerms: string[]; mapCenterLat: number; mapCenterLng: number; mapZoom: number;
}

const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

export function TrackedEditor({ outbreakId, current, fallbackCenter }: { outbreakId: string; current: TrackedConfig | null; fallbackCenter: { lat: number; lng: number } }) {
  const { run, busy, error, message } = useAction();
  const [f, setF] = useState({
    name: current?.name ?? "",
    active: current?.active ?? true,
    primary: current?.primary ?? false,
    originAdmin1: current?.originAdmin1 ?? "",
    anchor: (current?.anchorTerms ?? []).join(", "),
    context: (current?.contextTerms ?? []).join(", "),
    weak: (current?.weakAnchorTerms ?? []).join(", "),
    lat: String(current?.mapCenterLat ?? fallbackCenter.lat),
    lng: String(current?.mapCenterLng ?? fallbackCenter.lng),
    zoom: String(current?.mapZoom ?? 8),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  return (
    <section className="panel" data-testid="tracked-editor">
      <div className="panel-head"><h2 className="eyebrow">Tracked event</h2><span className="text-[10px] text-ink-faint">{current ? (current.primary ? "primary — main dashboard" : current.active ? "tracked" : "inactive") : "not tracked"}</span></div>
      <form
        className="space-y-2 p-3 text-xs"
        onSubmit={(e) => {
          e.preventDefault();
          void run("t", `/api/admin/outbreaks/${outbreakId}/tracked`, "PUT", {
            name: f.name, active: f.active, primary: f.primary, originAdmin1: f.originAdmin1 || null,
            anchorTerms: lines(f.anchor), contextTerms: lines(f.context), weakAnchorTerms: lines(f.weak),
            mapCenterLat: Number(f.lat), mapCenterLng: Number(f.lng), mapZoom: Number(f.zoom),
          }, (d: { tagged: number }) => `Saved. ${d.tagged} article(s) newly tagged.`);
        }}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input className="field" placeholder="Display name, e.g. Irkutsk investigation" value={f.name} onChange={set("name")} required aria-label="Tracked name" />
          <input className="field" placeholder="Origin region (first-level)" value={f.originAdmin1} onChange={set("originAdmin1")} aria-label="Origin region" />
        </div>
        <label className="block text-ink-faint">Place / institution names (an article must mention one)<textarea className="field h-14" value={f.anchor} onChange={set("anchor")} aria-label="Anchor terms" /></label>
        <label className="block text-ink-faint">Event-specific context (needed alongside a place name)<textarea className="field h-14" value={f.context} onChange={set("context")} aria-label="Context terms" /></label>
        <label className="block text-ink-faint">Wider-area names (only make an article &ldquo;possibly&rdquo; related; review only)<input className="field" value={f.weak} onChange={set("weak")} aria-label="Weak anchor terms" /></label>
        <div className="grid grid-cols-3 gap-2">
          <input className="field" value={f.lat} onChange={set("lat")} aria-label="Map centre latitude" />
          <input className="field" value={f.lng} onChange={set("lng")} aria-label="Map centre longitude" />
          <input className="field" value={f.zoom} onChange={set("zoom")} aria-label="Map zoom" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.active} onChange={set("active")} /> Active</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.primary} onChange={set("primary")} /> Primary (main dashboard, map and timeline)</label>
          <button className="btn btn-accent ml-auto" disabled={!!busy}>{current ? "Save" : "Track this outbreak"}</button>
        </div>
        <Flash error={error} message={message} />
      </form>
    </section>
  );
}
