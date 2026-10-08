import { cn } from "@/lib/utils";
import { CLASSIFICATION_HEX, CLASSIFICATION_LABEL, PATHOGEN_STATUS_LABEL, VERIFICATION_LABEL, type Classification, type PathogenStatus } from "@/lib/domain/enums";

export function ClassificationDot({ classification, className }: { classification: string; className?: string }) {
  const hex = CLASSIFICATION_HEX[classification as Classification] ?? "#888";
  const hollow = classification === "UNCONFIRMED_INVESTIGATION" || classification === "SUSPECTED_OUTBREAK" || classification === "RESOLVED";
  return <span aria-hidden className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)} style={hollow ? { boxShadow: `inset 0 0 0 2px ${hex}` } : { background: hex }} />;
}

export function ClassificationBadge({ classification, className }: { classification: string; className?: string }) {
  const hex = CLASSIFICATION_HEX[classification as Classification] ?? "#888";
  return (
    <span data-testid="classification-badge" className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", className)} style={{ borderColor: `${hex}55`, color: hex, background: `${hex}14` }}>
      <ClassificationDot classification={classification} className="h-2 w-2" />
      {CLASSIFICATION_LABEL[classification as Classification] ?? classification}
    </span>
  );
}

const V_STYLE: Record<string, string> = {
  VERIFIED: "text-ok border-ok/30 bg-ok/10",
  UNVERIFIED: "text-ink-dim border-line-strong bg-white/[0.03]",
  DISPUTED: "text-warn border-warn/35 bg-warn/10",
  REFUTED: "text-danger border-danger/35 bg-danger/10",
  RETRACTED: "text-danger border-danger/35 bg-danger/10",
};

export function VerificationBadge({ status, className }: { status: string; className?: string }) {
  return <span className={cn("inline-flex items-center rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap", V_STYLE[status] ?? V_STYLE.UNVERIFIED, className)}>{VERIFICATION_LABEL[status] ?? status}</span>;
}

export function SourceTypeBadge({ type, className }: { type: string; className?: string }) {
  const official = type === "OFFICIAL";
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap", official ? "bg-accent-dim text-accent" : "bg-white/[0.05] text-ink-dim", className)} title={official ? "Published by a public-health authority" : "Media or secondary report"}>
      {official ? "Official" : "Media"}
    </span>
  );
}

export function PathogenStatusText({ status, className }: { status: string; className?: string }) {
  const color = status === "CONFIRMED" ? "text-ok" : status === "RULED_OUT" ? "text-ink-dim" : "text-warn";
  return <span className={cn(color, className)}>{PATHOGEN_STATUS_LABEL[status as PathogenStatus] ?? status}</span>;
}
