"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useAction, Flash } from "./use-action";
import { ContentTypeBadge, OriginBadge, SourceTypeBadge, VerificationBadge } from "@/components/ui/badges";
import { fmtUtc, cn } from "@/lib/utils";
import { METRICS, METRIC_LABEL } from "@/lib/domain/enums";

interface Claim { id: string; claimType: string; text: string; metric: string | null; value: number | null; verificationStatus: string; conflictNote: string | null; sourceType: string }
interface Article { id: string; title: string; url: string; summary: string | null; publishedAt: string; fetchedAt: string; eventDate: string | null; countryCodes: string; diseaseSlugs: string; locationText: string | null; geoPrecision: string; sourceType: string; verificationStatus: string; reviewStatus: string; origin: string; contentType: string; outbreakRelevant: boolean; mentionedCountryCodes: string; primaryValidatedAt: string | null; suggestedOutbreakId: string | null; outbreakId: string | null; duplicateOfId: string | null; source: { name: string; kind: string }; claims: Claim[] }
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

function ArticleCard({ a, outbreaks }: { a: Article; outbreaks: Outbreak[] }) {
  const { run, busy, error, message } = useAction();
  const [target, setTarget] = useState(a.outbreakId ?? a.suggestedOutbreakId ?? "");
  const suggested = outbreaks.find((o) => o.id === a.suggestedOutbreakId);
  return (
    <li className="panel p-4" data-testid="review-article">
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
        <select className="field w-auto" value={a.verificationStatus} onChange={(e) => run("v", `/api/admin/articles/${a.id}`, "PATCH", { action: "verify", verificationStatus: e.target.value })} aria-label="Article verification">
          {["UNVERIFIED", "VERIFIED", "DISPUTED", "RETRACTED"].map((v) => <option key={v} value={v}>{v.toLowerCase()}</option>)}
        </select>
      </div>
      <div className="mt-2"><Flash error={error} message={message} /></div>
    </li>
  );
}

export function ReviewQueue({ articles, outbreaks, status, counts }: { articles: Article[]; outbreaks: Outbreak[]; status: string; counts: Record<string, number> }) {
  return (
    <main>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Incoming article review</h1>
        <div className="flex gap-1">
          {["PENDING", "ACCEPTED", "DUPLICATE", "REJECTED"].map((s) => (
            <Link key={s} href={`/admin/review?status=${s}`} className={cn("rounded-md px-2.5 py-1 text-xs", s === status ? "bg-raised text-ink" : "text-ink-dim hover:text-ink")}>{s.toLowerCase()} <span className="num text-ink-faint">{counts[s] ?? 0}</span></Link>
          ))}
        </div>
      </div>
      {articles.length === 0 ? <p className="text-xs text-ink-faint">Nothing here.</p> : <ul className="space-y-3">{articles.map((a) => <ArticleCard key={a.id} a={a} outbreaks={outbreaks} />)}</ul>}
    </main>
  );
}
