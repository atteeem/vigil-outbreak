"use client";

// Locations of an outbreak with their role and verification. Only VERIFIED locations are drawn on public maps.
// Case locations outside the event's origin start unverified, and the server refuses to verify one without
// evidence (a source article or an evidence note).
import { useState } from "react";
import { useAction, Flash } from "./use-action";
import { VerificationBadge } from "@/components/ui/badges";
import { COUNTRIES } from "@/lib/geo/countries";
import { GEO_PRECISIONS, VERIFICATION_STATUSES } from "@/lib/domain/enums";
import { LOCATION_ROLES, LOCATION_ROLE_LABEL, type LocationRole } from "@/lib/tracked/timeline";
import { fmtUtc } from "@/lib/utils";

export interface EditorLocation {
  id: string; name: string; admin1: string | null; countryCode: string; lat: number; lng: number; precision: string; role: string;
  verificationStatus: string; evidence: string | null; notes: string | null; firstReportedAt: string; sourceArticleId: string | null;
}

function LocationRow({ outbreakId, l }: { outbreakId: string; l: EditorLocation }) {
  const { run, busy, error, message } = useAction();
  const [evidence, setEvidence] = useState(l.evidence ?? "");
  return (
    <li className="space-y-1.5 py-2" data-testid="admin-location" data-name={l.name}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{l.name}</span>
        <span className="text-ink-faint">{LOCATION_ROLE_LABEL[l.role as LocationRole] ?? l.role} · {[l.admin1, l.countryCode].filter(Boolean).join(", ")} · {l.precision.toLowerCase()} · {l.lat.toFixed(3)}, {l.lng.toFixed(3)} · reported {fmtUtc(l.firstReportedAt, false)}</span>
        <VerificationBadge status={l.verificationStatus} />
        {l.verificationStatus !== "VERIFIED" && <span className="text-[10px] text-warn">not mapped</span>}
      </div>
      {l.notes && <p className="text-ink-dim">{l.notes}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <input className="field min-w-0 flex-1" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Evidence (publication, statement, date)" aria-label={`Evidence for ${l.name}`} />
        <select className="field w-auto" value={l.verificationStatus} aria-label={`Verification of ${l.name}`} disabled={!!busy}
          onChange={(e) => run("v", `/api/admin/outbreaks/${outbreakId}`, "PATCH", { updateLocation: { id: l.id, verificationStatus: e.target.value, evidence: evidence.trim() || null } }, () => `Location ${e.target.value.toLowerCase()}.`)}>
          {VERIFICATION_STATUSES.map((v) => <option key={v} value={v}>{v.toLowerCase()}</option>)}
        </select>
        <button className="btn btn-danger" disabled={!!busy} onClick={() => run("rm", `/api/admin/outbreaks/${outbreakId}`, "PATCH", { removeLocationId: l.id }, () => "Location removed.")}>Remove</button>
      </div>
      <Flash error={error} message={message} />
    </li>
  );
}

export function LocationsEditor({ outbreakId, locations, articles }: { outbreakId: string; locations: EditorLocation[]; articles: { id: string; title: string; publishedAt: string }[] }) {
  const { run, busy, error, message } = useAction();
  const blank = { name: "", admin1: "", countryCode: "", lat: "", lng: "", precision: "CITY", role: "SUSPECTED_CASE", verificationStatus: "", evidence: "", notes: "", sourceArticleId: "" };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <section className="panel" data-testid="locations-editor">
      <div className="panel-head"><h2 className="eyebrow">Locations</h2><span className="text-[10px] text-ink-faint">only verified locations are mapped</span></div>
      <div className="space-y-2 p-3 text-xs">
        <ul className="divide-y divide-line">{locations.map((l) => <LocationRow key={l.id} outbreakId={outbreakId} l={l} />)}</ul>
        {locations.length === 0 && <p className="text-ink-faint">No locations.</p>}
        <form
          className="space-y-2 border-t border-line pt-3"
          data-testid="add-location-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run("add", `/api/admin/outbreaks/${outbreakId}`, "PATCH", {
              addLocation: {
                name: f.name, admin1: f.admin1 || null, countryCode: f.countryCode, lat: Number(f.lat), lng: Number(f.lng), precision: f.precision, role: f.role,
                ...(f.verificationStatus ? { verificationStatus: f.verificationStatus } : {}), evidence: f.evidence || null, notes: f.notes || null, sourceArticleId: f.sourceArticleId || null,
              },
            }, (d: { outbreak?: unknown }) => (d ? "Location added." : ""));
            if (ok) setF(blank);
          }}
        >
          <p className="eyebrow">Add location</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input className="field" placeholder="Place name" value={f.name} onChange={set("name")} required aria-label="Location name" />
            <input className="field" placeholder="Region (first-level), e.g. Irkutsk Oblast" value={f.admin1} onChange={set("admin1")} aria-label="Location region" />
            <select className="field" value={f.countryCode} onChange={set("countryCode")} required aria-label="Location country"><option value="">Country…</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
            <select className="field" value={f.role} onChange={set("role")} aria-label="Location role">{LOCATION_ROLES.map((r) => <option key={r} value={r}>{LOCATION_ROLE_LABEL[r]}</option>)}</select>
            <input className="field" placeholder="Latitude" value={f.lat} onChange={set("lat")} required aria-label="Location latitude" />
            <input className="field" placeholder="Longitude" value={f.lng} onChange={set("lng")} required aria-label="Location longitude" />
            <select className="field" value={f.precision} onChange={set("precision")} aria-label="Location precision">{GEO_PRECISIONS.filter((p) => p !== "UNKNOWN").map((p) => <option key={p}>{p}</option>)}</select>
            <select className="field" value={f.verificationStatus} onChange={set("verificationStatus")} aria-label="Location verification"><option value="">Verification: default (unverified if outside the origin)</option>{VERIFICATION_STATUSES.map((v) => <option key={v} value={v}>{v.toLowerCase()}</option>)}</select>
          </div>
          <select className="field" value={f.sourceArticleId} onChange={set("sourceArticleId")} aria-label="Location source article"><option value="">No linked article</option>{articles.map((a) => <option key={a.id} value={a.id}>{fmtUtc(a.publishedAt, false)} · {a.title.slice(0, 70)}</option>)}</select>
          <input className="field" placeholder="Evidence (required to verify a case location outside the origin)" value={f.evidence} onChange={set("evidence")} aria-label="Location evidence" />
          <input className="field" placeholder="Notes (what is known about this place; precision caveats)" value={f.notes} onChange={set("notes")} aria-label="Location notes" />
          <p className="text-[11px] text-ink-faint">A quarantine, observation of contacts or a closure is a <em>precautionary measure</em>, never a case. Do not add countries that are only mentioned in reporting.</p>
          <button className="btn btn-accent" disabled={!!busy} data-testid="add-location">Add location</button>
          <Flash error={error} message={message} />
        </form>
      </div>
    </section>
  );
}
