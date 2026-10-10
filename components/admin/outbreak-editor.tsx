"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction, Flash } from "./use-action";
import { LocationsEditor, type EditorLocation } from "./locations-editor";
import { TIMELINE_CATEGORIES, TIMELINE_CATEGORY_LABEL } from "@/lib/tracked/timeline";
import { ClaimRow } from "./review-queue";
import { ClassificationBadge, SourceTypeBadge, VerificationBadge } from "@/components/ui/badges";
import { CLASSIFICATIONS, CLASSIFICATION_LABEL, METRICS, METRIC_LABEL, PATHOGEN_STATUSES, PATHOGEN_STATUS_LABEL, UPDATE_KINDS, UPDATE_KIND_LABEL, VERIFICATION_STATUSES, type Metric } from "@/lib/domain/enums";
import { formatCount } from "@/lib/domain/stats";
import { fmtUtc } from "@/lib/utils";

interface O {
  id: string; slug: string; title: string; summary: string; classification: string; pathogenStatus: string; published: boolean; featured: boolean; diseaseId: string | null; suspectedDiseaseId: string | null; lastVerifiedAt: string | null; mergedInto: { id: string; title: string } | null;
  locations: EditorLocation[];
  observations: { id: string; metric: string; value: number | null; valueHigh: number | null; asOfDate: string | null; reportedAt: string; sourceType: string; verificationStatus: string; attributedTo: string | null }[];
  updates: { id: string; kind: string; title: string; publishedAt: string; sourceType: string; verificationStatus: string }[];
  statusHistory: { id: string; toClassification: string; toPathogenStatus: string; reason: string; effectiveAt: string }[];
  claims: { id: string; claimType: string; text: string; metric: string | null; value: number | null; verificationStatus: string; conflictNote: string | null; sourceType: string }[];
  articles: { id: string; title: string; url: string; publishedAt: string; sourceType: string }[];
}

const nowLocal = () => new Date().toISOString().slice(0, 16);
const iso = (local: string) => new Date(local + "Z").toISOString();

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel"><div className="panel-head"><h2 className="eyebrow">{title}</h2></div><div className="space-y-2 p-3 text-xs">{children}</div></section>;
}

export function OutbreakEditor({ o, diseases, others }: { o: O; diseases: { id: string; name: string }[]; others: { id: string; title: string; slug: string }[] }) {
  const { run, busy, error, message } = useAction();
  const router = useRouter();
  const [title, setTitle] = useState(o.title);
  const [summary, setSummary] = useState(o.summary);
  const [suspected, setSuspected] = useState(o.suspectedDiseaseId ?? "");
  const [cls, setCls] = useState({ classification: o.classification, pathogenStatus: o.pathogenStatus, diseaseId: o.diseaseId ?? "", reason: "", effectiveAt: nowLocal(), sourceArticleId: "" });
  const [obs, setObs] = useState({ metric: "CONFIRMED_CASES", value: "", valueHigh: "", asOfDate: "", reportedAt: nowLocal(), sourceType: "OFFICIAL", verificationStatus: "UNVERIFIED", attributedTo: "", notes: "", deathCauseConfirmed: "", isCumulative: true, sourceArticleId: "" });
  const [upd, setUpd] = useState({ kind: "DEVELOPMENT", category: "", title: "", body: "", occurredAt: "", publishedAt: nowLocal(), sourceType: "OFFICIAL", verificationStatus: "UNVERIFIED", attributedTo: "", sourceArticleId: "" });
  const [merge, setMerge] = useState({ targetId: "", reason: "" });
  const sel = (on: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>) => on(e.target.value);
  const articleOptions = <><option value="">No linked article</option>{o.articles.map((a) => <option key={a.id} value={a.id}>{fmtUtc(a.publishedAt, false)} · {a.title.slice(0, 70)}</option>)}</>;

  return (
    <main className="space-y-4" data-testid="outbreak-editor">
      <div className="flex flex-wrap items-center gap-2">
        <ClassificationBadge classification={o.classification} />
        <h1 className="text-lg font-semibold">{o.title}</h1>
        <span className={o.published ? "text-xs text-ok" : "text-xs text-warn"}>{o.published ? "Published" : "Unpublished"}</span>
        <div className="ml-auto flex gap-2">
          {o.published && <Link className="btn" href={`/outbreaks/${o.slug}`}>View public page</Link>}
          <button className={o.published ? "btn btn-danger" : "btn btn-accent"} disabled={!!busy || !!o.mergedInto} data-testid="toggle-publish" onClick={() => run("pub", `/api/admin/outbreaks/${o.id}`, "PATCH", { published: !o.published }, () => (o.published ? "Unpublished." : "Published."))}>{o.published ? "Unpublish" : "Publish"}</button>
        </div>
      </div>
      {o.mergedInto && <p className="text-xs text-warn">Merged into <Link className="underline" href={`/admin/outbreaks/${o.mergedInto.id}`}>{o.mergedInto.title}</Link>.</p>}
      <Flash error={error} message={message} />

      <LocationsEditor outbreakId={o.id} locations={o.locations} articles={o.articles} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Record">
          <input className="field" value={title} onChange={sel(setTitle)} aria-label="Title" />
          <textarea className="field h-36" value={summary} onChange={sel(setSummary)} aria-label="Summary" />
          <select className="field" value={suspected} onChange={sel(setSuspected)} aria-label="Suspected disease"><option value="">Suspected disease: none</option>{diseases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-accent" disabled={!!busy} onClick={() => run("save", `/api/admin/outbreaks/${o.id}`, "PATCH", { title, summary, suspectedDiseaseId: suspected || null }, () => "Saved.")}>Save</button>
            <button className="btn" disabled={!!busy} onClick={() => run("feat", `/api/admin/outbreaks/${o.id}`, "PATCH", { featured: !o.featured })}>{o.featured ? "Unfeature" : "Feature"}</button>
            <button className="btn" disabled={!!busy} onClick={() => run("lv", `/api/admin/outbreaks/${o.id}`, "PATCH", { lastVerifiedAt: new Date().toISOString() }, () => "Marked verified now.")}>Mark verified now</button>
          </div>
        </Card>

        <Card title="Reclassify (appends history)">
          <form className="space-y-2" data-testid="reclassify-form" onSubmit={(e) => { e.preventDefault(); void run("cls", `/api/admin/outbreaks/${o.id}/classification`, "POST", { classification: cls.classification, pathogenStatus: cls.pathogenStatus, diseaseId: cls.diseaseId || null, reason: cls.reason, effectiveAt: iso(cls.effectiveAt), sourceArticleId: cls.sourceArticleId || null }, () => "Reclassified; history entry added."); }}>
            <div className="grid grid-cols-2 gap-2">
              <select className="field" value={cls.classification} onChange={sel((v) => setCls((s) => ({ ...s, classification: v })))} aria-label="New classification">{CLASSIFICATIONS.map((c) => <option key={c} value={c}>{CLASSIFICATION_LABEL[c]}</option>)}</select>
              <select className="field" value={cls.pathogenStatus} onChange={sel((v) => setCls((s) => ({ ...s, pathogenStatus: v })))} aria-label="New pathogen status">{PATHOGEN_STATUSES.map((c) => <option key={c} value={c}>{PATHOGEN_STATUS_LABEL[c]}</option>)}</select>
              <select className="field" value={cls.diseaseId} onChange={sel((v) => setCls((s) => ({ ...s, diseaseId: v })))} aria-label="Confirmed disease"><option value="">Confirmed disease: none</option>{diseases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              <input className="field" type="datetime-local" value={cls.effectiveAt} onChange={sel((v) => setCls((s) => ({ ...s, effectiveAt: v })))} aria-label="Effective (UTC)" />
            </div>
            <select className="field" value={cls.sourceArticleId} onChange={sel((v) => setCls((s) => ({ ...s, sourceArticleId: v })))} aria-label="Evidence">{articleOptions}</select>
            <textarea className="field h-16" placeholder="Reason and evidence (required)" value={cls.reason} onChange={sel((v) => setCls((s) => ({ ...s, reason: v })))} required minLength={10} aria-label="Reason" />
            <button className="btn btn-accent" disabled={!!busy}>Apply reclassification</button>
          </form>
          <ol className="space-y-1 border-t border-line pt-2">{o.statusHistory.map((h) => <li key={h.id}><span className="text-ink-faint">{fmtUtc(h.effectiveAt)}</span> {CLASSIFICATION_LABEL[h.toClassification as keyof typeof CLASSIFICATION_LABEL]} · {h.toPathogenStatus.toLowerCase()} — <span className="text-ink-dim">{h.reason}</span></li>)}</ol>
        </Card>

        <Card title="Add dated observation">
          <form className="space-y-2" data-testid="observation-form" onSubmit={(e) => { e.preventDefault(); void run("obs", `/api/admin/outbreaks/${o.id}/observations`, "POST", { metric: obs.metric, value: obs.value === "" ? null : Number(obs.value), valueHigh: obs.valueHigh === "" ? null : Number(obs.valueHigh), isCumulative: obs.isCumulative, deathCauseConfirmed: obs.deathCauseConfirmed === "" ? null : obs.deathCauseConfirmed === "yes", asOfDate: obs.asOfDate ? iso(obs.asOfDate) : null, reportedAt: iso(obs.reportedAt), sourceType: obs.sourceType, verificationStatus: obs.verificationStatus, attributedTo: obs.attributedTo, notes: obs.notes || null, sourceArticleId: obs.sourceArticleId || null }, () => "Observation added."); }}>
            <div className="grid grid-cols-2 gap-2">
              <select className="field" value={obs.metric} onChange={sel((v) => setObs((s) => ({ ...s, metric: v })))} aria-label="Metric">{METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}</select>
              <input className="field" type="number" min={0} placeholder="Value (blank = not reported)" value={obs.value} onChange={sel((v) => setObs((s) => ({ ...s, value: v })))} aria-label="Value" />
              <input className="field" type="number" min={0} placeholder="Upper bound (range)" value={obs.valueHigh} onChange={sel((v) => setObs((s) => ({ ...s, valueHigh: v })))} aria-label="Upper bound" />
              <select className="field" value={obs.deathCauseConfirmed} onChange={sel((v) => setObs((s) => ({ ...s, deathCauseConfirmed: v })))} aria-label="Death cause confirmed"><option value="">Death cause: n/a</option><option value="yes">Death cause lab-attributed</option><option value="no">Death cause NOT confirmed</option></select>
              <label className="text-ink-faint">Refers to (UTC)<input className="field" type="datetime-local" value={obs.asOfDate} onChange={sel((v) => setObs((s) => ({ ...s, asOfDate: v })))} /></label>
              <label className="text-ink-faint">Published (UTC)<input className="field" type="datetime-local" value={obs.reportedAt} onChange={sel((v) => setObs((s) => ({ ...s, reportedAt: v })))} required /></label>
              <select className="field" value={obs.sourceType} onChange={sel((v) => setObs((s) => ({ ...s, sourceType: v })))} aria-label="Source type"><option value="OFFICIAL">Official</option><option value="MEDIA">Media</option></select>
              <select className="field" value={obs.verificationStatus} onChange={sel((v) => setObs((s) => ({ ...s, verificationStatus: v })))} aria-label="Verification">{VERIFICATION_STATUSES.map((v) => <option key={v}>{v}</option>)}</select>
            </div>
            <label className="flex items-center gap-2 text-ink-dim"><input type="checkbox" checked={obs.isCumulative} onChange={(e) => setObs((s) => ({ ...s, isCumulative: e.target.checked }))} /> Cumulative total (uncheck for a period count)</label>
            <input className="field" placeholder="Attributed to (e.g. WHO DON 2026-DON620)" value={obs.attributedTo} onChange={sel((v) => setObs((s) => ({ ...s, attributedTo: v })))} required aria-label="Attributed to" />
            <select className="field" value={obs.sourceArticleId} onChange={sel((v) => setObs((s) => ({ ...s, sourceArticleId: v })))} aria-label="Source article">{articleOptions}</select>
            <input className="field" placeholder="Notes" value={obs.notes} onChange={sel((v) => setObs((s) => ({ ...s, notes: v })))} aria-label="Notes" />
            <button className="btn btn-accent" disabled={!!busy}>Add observation</button>
          </form>
          <table className="w-full border-t border-line pt-2 text-left">
            <tbody>
              {o.observations.map((x) => (
                <tr key={x.id} className="border-b border-line/50">
                  <td className="py-1 pr-2">{METRIC_LABEL[x.metric as Metric]}</td><td className="num pr-2">{formatCount(x.value, x.valueHigh)}</td><td className="pr-2 text-ink-faint">{fmtUtc(x.reportedAt, false)}</td>
                  <td className="pr-2"><SourceTypeBadge type={x.sourceType} /></td>
                  <td><select className="field w-auto py-0 text-[11px]" value={x.verificationStatus} onChange={(e) => run("ov", `/api/admin/outbreaks/${o.id}/observations`, "PATCH", { observationId: x.id, verificationStatus: e.target.value })} aria-label="Observation verification">{VERIFICATION_STATUSES.map((v) => <option key={v}>{v}</option>)}</select></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Add update / correction">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void run("upd", `/api/admin/outbreaks/${o.id}/updates`, "POST", { ...upd, category: upd.category || null, occurredAt: upd.occurredAt ? iso(upd.occurredAt) : null, publishedAt: iso(upd.publishedAt), sourceArticleId: upd.sourceArticleId || null }, () => "Update added."); }}>
            <div className="grid grid-cols-2 gap-2">
              <select className="field" value={upd.kind} onChange={sel((v) => setUpd((s) => ({ ...s, kind: v })))} aria-label="Kind">{UPDATE_KINDS.map((k) => <option key={k} value={k}>{UPDATE_KIND_LABEL[k]}</option>)}</select>
              <select className="field" value={upd.category} onChange={sel((v) => setUpd((s) => ({ ...s, category: v })))} aria-label="Update category"><option value="">Timeline category: derive from text</option>{TIMELINE_CATEGORIES.map((c) => <option key={c} value={c}>{TIMELINE_CATEGORY_LABEL[c]}</option>)}</select>
              <select className="field" value={upd.sourceType} onChange={sel((v) => setUpd((s) => ({ ...s, sourceType: v })))} aria-label="Source type"><option value="OFFICIAL">Official</option><option value="MEDIA">Media</option></select>
              <label className="text-ink-faint">Occurred (UTC, optional)<input className="field" type="datetime-local" value={upd.occurredAt} onChange={sel((v) => setUpd((s) => ({ ...s, occurredAt: v })))} /></label>
              <label className="text-ink-faint">Published (UTC)<input className="field" type="datetime-local" value={upd.publishedAt} onChange={sel((v) => setUpd((s) => ({ ...s, publishedAt: v })))} required /></label>
              <select className="field" value={upd.verificationStatus} onChange={sel((v) => setUpd((s) => ({ ...s, verificationStatus: v })))} aria-label="Verification">{VERIFICATION_STATUSES.map((v) => <option key={v}>{v}</option>)}</select>
              <input className="field" placeholder="Attributed to" value={upd.attributedTo} onChange={sel((v) => setUpd((s) => ({ ...s, attributedTo: v })))} required aria-label="Attributed to" />
            </div>
            <input className="field" placeholder="Title" value={upd.title} onChange={sel((v) => setUpd((s) => ({ ...s, title: v })))} required aria-label="Update title" />
            <textarea className="field h-16" placeholder="Body" value={upd.body} onChange={sel((v) => setUpd((s) => ({ ...s, body: v })))} required aria-label="Update body" />
            <select className="field" value={upd.sourceArticleId} onChange={sel((v) => setUpd((s) => ({ ...s, sourceArticleId: v })))} aria-label="Source article">{articleOptions}</select>
            <button className="btn btn-accent" disabled={!!busy}>Add update</button>
          </form>
          <ul className="space-y-1 border-t border-line pt-2">{o.updates.slice(0, 12).map((u) => <li key={u.id} className="flex flex-wrap items-center gap-1"><span className="text-ink-faint">{fmtUtc(u.publishedAt, false)}</span> <SourceTypeBadge type={u.sourceType} /><VerificationBadge status={u.verificationStatus} /> {u.title}</li>)}</ul>
        </Card>

        <Card title="Claims">
          {o.claims.length === 0 ? <p className="text-ink-faint">No claims linked.</p> : <ul className="space-y-1.5">{o.claims.map((c) => <ClaimRow key={c.id} c={c} outbreaks={[{ id: o.id, title: o.title, slug: o.slug }]} defaultOutbreak={o.id} />)}</ul>}
        </Card>

        <Card title="Merge this record into another (duplicate)">
          <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); const d = await run("merge", `/api/admin/outbreaks/${o.id}/merge`, "POST", merge, () => "Merged."); if (d) router.push(`/admin/outbreaks/${merge.targetId}`); }}>
            <select className="field" value={merge.targetId} onChange={sel((v) => setMerge((s) => ({ ...s, targetId: v })))} required aria-label="Merge target"><option value="">Surviving record…</option>{others.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
            <input className="field" placeholder="Reason" value={merge.reason} onChange={sel((v) => setMerge((s) => ({ ...s, reason: v })))} required minLength={5} aria-label="Merge reason" />
            <button className="btn btn-danger" disabled={!!busy || !!o.mergedInto}>Merge into selected record</button>
            <p className="text-ink-faint">Articles, observations, updates, claims, locations and risk assessments move to the surviving record. This record is kept (unpublished) with a pointer.</p>
          </form>
        </Card>
      </div>
    </main>
  );
}
