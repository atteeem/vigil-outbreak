"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction, Flash } from "./use-action";
import { CLASSIFICATIONS, CLASSIFICATION_LABEL, PATHOGEN_STATUSES, PATHOGEN_STATUS_LABEL } from "@/lib/domain/enums";
import { COUNTRIES } from "@/lib/geo/countries";

export function CreateOutbreakForm({ diseases }: { diseases: { id: string; name: string }[] }) {
  const { run, busy, error, message } = useAction();
  const router = useRouter();
  const [f, setF] = useState({ slug: "", title: "", summary: "", classification: "UNCONFIRMED_INVESTIGATION", pathogenStatus: "UNKNOWN", diseaseId: "", suspectedDiseaseId: "", countryCode: "", firstReportedAt: new Date().toISOString().slice(0, 16), locName: "", lat: "", lng: "", precision: "CITY" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form className="panel space-y-2 p-4 text-xs" data-testid="create-outbreak" onSubmit={async (e) => {
      e.preventDefault();
      const loc = f.locName && f.lat && f.lng ? { name: f.locName, countryCode: f.countryCode, lat: Number(f.lat), lng: Number(f.lng), precision: f.precision, role: f.classification.startsWith("CONFIRMED") ? "AFFECTED_AREA" : "INVESTIGATION_SITE" } : undefined;
      const d = await run<{ outbreak: { id: string } }>("c", "/api/admin/outbreaks", "POST", { slug: f.slug, title: f.title, summary: f.summary, classification: f.classification, pathogenStatus: f.pathogenStatus, diseaseId: f.diseaseId || null, suspectedDiseaseId: f.suspectedDiseaseId || null, countryCode: f.countryCode, firstReportedAt: new Date(f.firstReportedAt + "Z").toISOString(), location: loc, published: false }, () => "Created (unpublished).");
      if (d) router.push(`/admin/outbreaks/${d.outbreak.id}`);
    }}>
      <input className="field" placeholder="slug (e.g. cholera-sudan-2026)" value={f.slug} onChange={set("slug")} required aria-label="Slug" />
      <input className="field" placeholder="Title" value={f.title} onChange={set("title")} required aria-label="Title" />
      <textarea className="field h-20" placeholder="Summary (sourced facts only)" value={f.summary} onChange={set("summary")} required aria-label="Summary" />
      <div className="grid grid-cols-2 gap-2">
        <select className="field" value={f.classification} onChange={set("classification")} aria-label="Classification">{CLASSIFICATIONS.map((c) => <option key={c} value={c}>{CLASSIFICATION_LABEL[c]}</option>)}</select>
        <select className="field" value={f.pathogenStatus} onChange={set("pathogenStatus")} aria-label="Pathogen status">{PATHOGEN_STATUSES.map((c) => <option key={c} value={c}>{PATHOGEN_STATUS_LABEL[c]}</option>)}</select>
        <select className="field" value={f.diseaseId} onChange={set("diseaseId")} aria-label="Confirmed disease"><option value="">Confirmed disease: none</option>{diseases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select className="field" value={f.suspectedDiseaseId} onChange={set("suspectedDiseaseId")} aria-label="Suspected disease"><option value="">Suspected disease: none</option>{diseases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select className="field" value={f.countryCode} onChange={set("countryCode")} required aria-label="Country"><option value="">Country…</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
        <input className="field" type="datetime-local" value={f.firstReportedAt} onChange={set("firstReportedAt")} required aria-label="First reported (UTC)" title="First public report (UTC)" />
      </div>
      <p className="eyebrow pt-1">Location (optional)</p>
      <div className="grid grid-cols-2 gap-2">
        <input className="field col-span-2" placeholder="Place name" value={f.locName} onChange={set("locName")} aria-label="Place name" />
        <input className="field" placeholder="Latitude" value={f.lat} onChange={set("lat")} aria-label="Latitude" />
        <input className="field" placeholder="Longitude" value={f.lng} onChange={set("lng")} aria-label="Longitude" />
        <select className="field col-span-2" value={f.precision} onChange={set("precision")} aria-label="Precision">{["EXACT", "CITY", "ADMIN1", "COUNTRY"].map((p) => <option key={p}>{p}</option>)}</select>
      </div>
      <button className="btn btn-accent w-full justify-center" disabled={!!busy}>{busy ? "Creating…" : "Create (unpublished)"}</button>
      <Flash error={error} message={message} />
    </form>
  );
}
