"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { History } from "lucide-react";
import { fmtUtc } from "@/lib/utils";

/** "What was known at…": reloads the page with ?asOf=<UTC ISO>. Times are entered in UTC. */
export function AsOfControl({ asOf }: { asOf: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(asOf ? asOf.slice(0, 16) : "");
  return (
    <form
      className="flex flex-wrap items-center gap-1.5 text-[11px]"
      data-testid="as-of-control"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value) return;
        router.push(`${pathname}?asOf=${encodeURIComponent(new Date(`${value}:00Z`).toISOString())}`);
      }}
    >
      <History className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
      <label className="text-ink-faint" htmlFor="as-of-input">Known as of (UTC)</label>
      <input id="as-of-input" type="datetime-local" className="field w-auto py-1" value={value} onChange={(e) => setValue(e.target.value)} data-testid="as-of-input" />
      <button className="btn py-1" type="submit">View</button>
      {asOf && <button type="button" className="btn btn-accent py-1" onClick={() => router.push(pathname)} data-testid="as-of-live">Return to live</button>}
    </form>
  );
}

export function HistoricalBanner({ asOf }: { asOf: string }) {
  return (
    <div className="rounded-lg border border-warn/35 bg-warn/[0.06] px-4 py-2 text-xs text-warn" data-testid="historical-banner" role="status">
      Historical view: showing only what had been published by {fmtUtc(asOf)}, with the verification verdicts known at that time. Later facts, figures and corrections are hidden.
    </div>
  );
}
