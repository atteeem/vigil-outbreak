"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useAction, Flash } from "./use-action";
import { ContentTypeBadge, OriginBadge, SourceTypeBadge, VerificationBadge } from "@/components/ui/badges";
import { fmtUtc, cn } from "@/lib/utils";
import { METRICS, METRIC_LABEL, UPDATE_KINDS, UPDATE_KIND_LABEL, VERIFICATION_STATUSES } from "@/lib/domain/enums";
import { TIMELINE_CATEGORIES, TIMELINE_CATEGORY_LABEL } from "@/lib/tracked/timeline";
import { TopicChips } from "@/components/tracker/parts";

interface Claim { id: string; claimType: string; text: string; metric: string | null; value: number | null; verificationStatus: string; conflictNote: string | null; sourceType: string }
interface Article { id: string; title: string; url: string; summary: string | null; publishedAt: string; fetchedAt: string; eventDate: string | null; countryCodes: string; diseaseSlugs: string; locationText: string | null; geoPrecision: string; sourceType: string; verificationStatus: string; reviewStatus: string; origin: string; contentType: string; outbreakRelevant: boolean; mentionedCountryCodes: string; primaryValidatedAt: string | null; suggestedOutbreakId: string | null; outbreakId: string | null; duplicateOfId: string | null; source: { name: string; kind: string }; claims: Claim[]; trackedEventId: string | null; trackedLevel: string | null; trackedTopics: string; trackedReasons: string | null; materialChange: boolean }
type Tracked = { id: string; name: string; outbreakId: string; pending: number } | null;
type Outbreak = { id: string; title: string; slug: string };

export function ClaimRow({ c, outbreaks, defaultOutbreak }: { c: Claim; outbreaks: Outbreak[]; defaultOutbreak: string | null }) {
  const { run, busy, error, message } = useAction();
  const [target, setTarget] = useState(defaultOutbreak ?? "");
  const [metric, setMetric] = useState(c.metric ?? "");
  return (
    <li className="rounded-md border border-line bg-surface px-3 py-2 text-xs" data-testid="claim-row">
      <div className="flex flex-wrap items-center gap-1.5"><SourceTypeBadge type={c.sourceType} /><VerificationBadge status={c.verificationStatus} /><span className="text-ink-faint">{c.claimType}</span></div>
      <p className="mt-1">{c.text}</p>
      {c.conflictNote && <p className="mt-1 text-warn">⚠ {c.conflictNote}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(["VERIFIED", "DISPUTED", "REFUTED", "UNVERIFIED"] as const).map((v) => (
          <button key={v} className={cn("btn py-0.5 text-[11px]", c.verificationStatus === v && "btn-accent")} disabled={!!busy} onClick={() => run("v", `/api/admin/claims/${c.id}`, "PATCH", { verificationStatus: v })}>{v.toLowerCase()}</button>
        ))}
        {c.value !== null && (
          <>
            <select className="field w-auto py-0.5 text-[11px]" value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Metric">
              <option value="">Metric…</option>
              {METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
            </select>
            <select className="field w-auto max-w-[220px] py-0.5 text-[11px]" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Outbreak">
              <option value="">Outbreak…</option>
              {outbreaks.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
            <button className="btn py-0.5 text-[11px]" disabled={!!busy || !target || !metric} data-testid="promote-claim" onClick={() => run("p", `/api/admin/claims/${c.id}`, "PATCH", { promote: { outbreakId: target, metric } }, () => "Observation created (provenance preserved).")}>Promote to observation</button>
          </>
        )}
      </div>
      <div className="mt-1"><Flash error={error} message={message} /></div>
    </li>
  );
}

/** Turns a reviewed publication into a timeline entry of the tracked investigation (unverified unless the analyst
 * says otherwise), then accepts the article and links it. Nothing is added to the timeline automatically. */
function AddToTimeline({ a, tracked, onDone }: { a: Article; tracked: NonNullable<Tracked>; onDone: () => void }) {
  const { run, busy, error, message, setError } = useAction();
  const [f, setF] = useState({
    kind: a.sourceType === "OFFICIAL" ? "OFFICIAL_STATEMENT" : "MEDIA_REPORT",
    category: "",
    title: a.title.slice(0, 300),
    body: (a.summary ?? a.title).slice(0, 5000),
    occurredAt: a.eventDate ? a.eventDate.slice(0, 16) : "",
    verificationStatus: "UNVERIFIED",
    attributedTo: a.source.name,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form
      className="mt-2 space-y-2 rounded-md border border-accent/30 bg-accent-dim/30 p-3 text-xs"
      data-testid="timeline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (f.body.trim().length < 3) return setError("Body is required.");
        const created = await run("tl", `/api/admin/outbreaks/${tracked.outbreakId}/updates`, "POST", {
          kind: f.kind, category: f.category || null, title: f.title, body: f.body, occurredAt: f.occurredAt ? new Date(`${f.occurredAt}:00Z`).toISOString() : null,
          publishedAt: a.publishedAt, sourceType: a.sourceType, verificationStatus: f.verificationStatus, attributedTo: f.attributedTo, sourceArticleId: a.id,
        });
        if (!created) return;
        const accepted = await run("tl", `/api/admin/articles/${a.id}`, "PATCH", { action: "accept", outbreakId: tracked.outbreakId }, () => `Added to the ${tracked.name} timeline and accepted.`);
        if (accepted) onDone();
      }}
    >
      <p className="eyebrow">Add to the {tracked.name} timeline</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select className="field" value={f.kind} onChange={set("kind")} aria-label="Timeline kind">{UPDATE_KINDS.map((k) => <option key={k} value={k}>{UPDATE_KIND_LABEL[k]}</option>)}</select>
        <select className="field" value={f.category} onChange={set("category")} aria-label="Timeline category"><option value="">Category: derive from text</option>{TIMELINE_CATEGORIES.map((c) => <option key={c} value={c}>{TIMELINE_CATEGORY_LABEL[c]}</option>)}</select>
        <select className="field" value={f.verificationStatus} onChange={set("verificationStatus")} aria-label="Timeline verification">{VERIFICATION_STATUSES.map((v) => <option key={v} value={v}>{v.toLowerCase()}</option>)}</select>
      </div>
      <input className="field" value={f.title} onChange={set("title")} aria-label="Timeline title" required minLength={3} />
      <textarea className="field h-16" value={f.body} onChange={set("body")} aria-label="Timeline body" required />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-ink-faint">Occurred (UTC; blank if not reported)<input className="field" type="datetime-local" value={f.occurredAt} onChange={set("occurredAt")} aria-label="Occurred at" /></label>
        <label className="text-ink-faint">Attributed to<input className="field" value={f.attributedTo} onChange={set("attributedTo")} required aria-label="Timeline attributed to" /></label>
      </div>
      <p className="text-[11px] text-ink-faint">Reported time = the publication time ({fmtUtc(a.publishedAt)}). Leave verification at &ldquo;unverified&rdquo; unless you have checked the claim against the primary source.</p>
      <button className="btn btn-accent" disabled={!!busy} data-testid="timeline-submit">{busy ? "Adding…" : "Add to timeline & accept"}</button>
      <Flash error={error} message={message} />
    </form>
  );
}

function ArticleCard({ a, outbreaks, tracked }: { a: Article; outbreaks: Outbreak[]; tracked: Tracked }) {
  const { run, busy, error, message } = useAction();
  const [timelineOpen, setTimelineOpen] = useState(false);
  const topics = JSON.parse(a.trackedTopics ?? "[]") as string[];
  const [target, setTarget] = useState(a.outbreakId ?? a.suggestedOutbreakId ?? "");
  const suggested = outbreaks.find((o) => o.id === a.suggestedOutbreakId);
  return (
    <li className={cn("panel p-4", a.materialChange && a.reviewStatus === "PENDING" && "border-warn/40")} data-testid="review-article" data-tracked={a.trackedLevel ?? ""} data-material={a.materialChange ? "true" : "false"}>
      {a.trackedLevel && tracked && a.trackedEventId === tracked.id && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px]" data-testid="tracked-info">
          <span className="rounded border border-accent/40 px-1.5 py-px text-accent">{a.trackedLevel === "DIRECT" ? tracked.name : `Possibly about the ${tracked.name}`}</span>
          {a.materialChange && <span className="rounded border border-warn/50 bg-warn/10 px-1.5 py-px font-semibold uppercase tracking-wide text-warn" data-testid="material-badge">Possible material change</span>}
          <TopicChips topics={topics} />
          {a.trackedReasons && <span className="text-ink-faint">({a.trackedReasons})</span>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
        <SourceTypeBadge type={a.sourceType} /><VerificationBadge status={a.verificationStatus} /><OriginBadge origin={a.origin} /><ContentTypeBadge type={a.contentType} relevant={a.outbreakRelevant} />
        {a.origin !== "INGESTED" && <span className={a.primaryValidatedAt ? "text-ok" : "text-warn"}>{a.primaryValidatedAt ? `checked vs primary ${fmtUtc(a.primaryValidatedAt, false)}` : "not yet checked vs primary"}</span>}
        <span className="text-ink-dim">{a.source.name}</span> · published {fmtUtc(a.publishedAt)} · fetched {fmtUtc(a.fetchedAt)}{a.eventDate ? ` · event date ${fmtUtc(a.eventDate, false)}` : ""}
      </div>
      <a href={a.url} target="_blank" rel="noreferrer" className="mt-1 block text-[14px] font-medium hover:text-accent">{a.title} <ExternalLink className="inline h-3 w-3" /></a>
      {a.summary && <p className="mt-1 text-xs leading-relaxed text-ink-dim">{a.summary}</p>}
      <p className="mt-1.5 text-[11px] text-ink-faint">Event location: {JSON.parse(a.countryCodes).join(", ") || "none detected"}{JSON.parse(a.mentionedCountryCodes ?? "[]").length ? ` (also mentioned: ${JSON.parse(a.mentionedCountryCodes).join(", ")})` : ""} · Diseases: {JSON.parse(a.diseaseSlugs).join(", ") || "none / unknown"} · Location: {a.locationText ?? "—"} ({a.geoPrecision.toLowerCase()})</p>
      <p className="mt-0.5 text-[11px]">{suggested ? <>Suggested outbreak: <Link className="text-accent" href={`/admin/outbreaks/${suggested.id}`}>{suggested.title}</Link></> : <span className="text-ink-faint">No matching outbreak detected.</span>}{a.duplicateOfId && <span className="text-warn"> · Duplicate of {a.duplicateOfId}</span>}</p>
      {a.claims.length > 0 && (
        <details className="mt-2" open={a.claims.length <= 4}>
          <summary className="cursor-pointer text-[11px] text-ink-dim">{a.claims.length} extracted claims (unverified until reviewed)</summary>
          <ul className="mt-2 space-y-1.5">{a.claims.map((c) => <ClaimRow key={c.id} c={c} outbreaks={outbreaks} defaultOutbreak={target || null} />)}</ul>
        </details>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
        <select className="field w-auto max-w-xs" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Link to outbreak">
          <option value="">No outbreak link</option>
          {outbreaks.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>
        <button className="btn btn-accent" disabled={!!busy} data-testid="accept-article" onClick={() => run("a", `/api/admin/articles/${a.id}`, "PATCH", { action: "accept", outbreakId: target || null }, () => "Accepted.")}>Accept{target ? " & link" : ""}</button>
        <button className="btn btn-danger" disabled={!!busy} onClick={() => run("r", `/api/admin/articles/${a.id}`, "PATCH", { action: "reject" }, () => "Rejected.")}>Reject</button>
        <button className="btn" disabled={!!busy} data-testid="toggle-relevance" onClick={() => run("rel", `/api/admin/articles/${a.id}`, "PATCH", { action: a.outbreakRelevant ? "mark-not-relevant" : "mark-relevant" }, () => (a.outbreakRelevant ? "Marked as not outbreak-related." : "Marked as outbreak-related."))}>{a.outbreakRelevant ? "Not outbreak-related" : "Outbreak-related"}</button>
        {a.origin !== "INGESTED" && <button className="btn" disabled={!!busy} data-testid="validate-primary" onClick={() => run("vp", `/api/admin/articles/${a.id}`, "PATCH", { action: a.primaryValidatedAt ? "unvalidate-primary" : "validate-primary" }, () => (a.primaryValidatedAt ? "Validation removed." : "Marked as checked against the primary publication."))}>{a.primaryValidatedAt ? "Undo primary check" : "Mark checked vs primary"}</button>}
        {a.reviewStatus !== "PENDING" && <button className="btn" disabled={!!busy} onClick={() => run("o", `/api/admin/articles/${a.id}`, "PATCH", { action: "reopen" })}>Reopen</button>}
        {tracked && a.trackedEventId === tracked.id && <button className="btn" disabled={!!busy} onClick={() => setTimelineOpen((v) => !v)} data-testid="add-to-timeline" aria-expanded={timelineOpen}>Add to investigation timeline</button>}
        <select className="field w-auto" value={a.verificationStatus} onChange={(e) => run("v", `/api/admin/articles/${a.id}`, "PATCH", { action: "verify", verificationStatus: e.target.value })} aria-label="Article verification">
          {["UNVERIFIED", "VERIFIED", "DISPUTED", "RETRACTED"].map((v) => <option key={v} value={v}>{v.toLowerCase()}</option>)}
        </select>
      </div>
      {timelineOpen && tracked && <AddToTimeline a={a} tracked={tracked} onDone={() => setTimelineOpen(false)} />}
      <div className="mt-2"><Flash error={error} message={message} /></div>
    </li>
  );
}

export function ReviewQueue({ articles, outbreaks, status, counts, scope = "all", tracked = null }: { articles: Article[]; outbreaks: Outbreak[]; status: string; counts: Record<string, number>; scope?: string; tracked?: Tracked }) {
  return (
    <main>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Incoming article review</h1>
        <div className="flex gap-1">
          {["PENDING", "ACCEPTED", "DUPLICATE", "REJECTED"].map((s) => (
            <Link key={s} href={`/admin/review?status=${s}${scope === "tracked" ? "&scope=tracked" : ""}`} className={cn("rounded-md px-2.5 py-1 text-xs", s === status ? "bg-raised text-ink" : "text-ink-dim hover:text-ink")}>{s.toLowerCase()} <span className="num text-ink-faint">{counts[s] ?? 0}</span></Link>
          ))}
        </div>
      </div>
      {tracked && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs" data-testid="review-scope">
          <Link href={`/admin/review?status=${status}`} className={cn("rounded-md px-2.5 py-1", scope !== "tracked" ? "bg-raised text-ink" : "text-ink-dim hover:text-ink")}>All articles</Link>
          <Link href={`/admin/review?status=${status}&scope=tracked`} className={cn("rounded-md px-2.5 py-1", scope === "tracked" ? "bg-raised text-ink" : "text-ink-dim hover:text-ink")} data-testid="review-scope-tracked">{tracked.name} <span className="num text-ink-faint">{tracked.pending} pending</span></Link>
          <span className="text-ink-faint">Possible material changes about the investigation are listed first.</span>
        </div>
      )}
      {articles.length === 0 ? <p className="text-xs text-ink-faint">Nothing here.</p> : <ul className="space-y-3">{articles.map((a) => <ArticleCard key={a.id} a={a} outbreaks={outbreaks} tracked={tracked} />)}</ul>}
    </main>
  );
}
