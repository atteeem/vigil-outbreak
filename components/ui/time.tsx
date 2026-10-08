"use client";

import { useEffect, useState } from "react";
import { fmtUtc, relative } from "@/lib/utils";

export const TIME_PREF_KEY = "vigil-outbreak.time";

/** Renders UTC on the server and first paint; switches to the viewer's local zone after mount if they chose it in
 * Settings. Avoids hydration mismatches while still honouring the preference. */
export function Time({ iso, withTime = true, className }: { iso: string | null | undefined; withTime?: boolean; className?: string }) {
  const [local, setLocal] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a client-only preference after hydration
      setLocal(localStorage.getItem(TIME_PREF_KEY) === "local");
    } catch {
      /* storage blocked */
    }
  }, []);
  if (!iso) return <span className={className}>—</span>;
  const d = new Date(iso);
  const text = local ? d.toLocaleString(undefined, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }) : fmtUtc(d, withTime);
  return (
    <time dateTime={iso} className={className} title={fmtUtc(d)}>
      {text}
    </time>
  );
}

/** "5m ago" — renders the absolute UTC time on the server and first paint, the relative form after mount. */
export function Ago({ iso }: { iso: string | null | undefined }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clock is client-only to avoid hydration mismatch
    setNow(Date.now());
  }, []);
  if (!iso) return <>never</>;
  return <time dateTime={iso} title={fmtUtc(iso)}>{now === null ? fmtUtc(iso) : relative(iso, now)}</time>;
}
