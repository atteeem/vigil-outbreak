"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/ui/empty-state";
import { fmtUtc } from "@/lib/utils";

export interface SeriesLine {
  key: string;
  name: string;
  color: string;
  points: { t: string | number; value: number }[];
}

/** Renders only when at least one series has two or more official, verified, cumulative observations. Each
 * line is drawn from its own observations; nothing is summed or interpolated across sources. */
export function SeriesChart({ lines, height = 220, emptyTitle = "Not enough verified observations to chart", emptyBody, testId }: { lines: SeriesLine[]; height?: number; emptyTitle?: string; emptyBody?: string; testId?: string }) {
  const usable = lines.filter((l) => l.points.length >= 2);
  if (usable.length === 0) {
    return <EmptyState title={emptyTitle} testId={testId ? `${testId}-empty` : undefined}>{emptyBody ?? "Charts appear once at least two dated, official, verified cumulative figures exist for the same metric."}</EmptyState>;
  }
  const times = [...new Set(usable.flatMap((l) => l.points.map((p) => new Date(p.t).getTime())))].sort((a, b) => a - b);
  const rows = times.map((t) => {
    const row: Record<string, number | null> = { t };
    for (const l of usable) row[l.key] = l.points.find((p) => new Date(p.t).getTime() === t)?.value ?? null;
    return row;
  });
  return (
    <div style={{ height }} data-testid={testId}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t: number) => fmtUtc(new Date(t), false).slice(5)} tick={{ fill: "#5f6873", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#5f6873", fontSize: 10 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => v.toLocaleString("en-US")} />
          <Tooltip labelFormatter={(t) => `As of ${fmtUtc(new Date(Number(t)), false)}`} formatter={(v) => (typeof v === "number" ? v.toLocaleString("en-US") : String(v))} contentStyle={{ background: "#151a1f", border: "1px solid rgba(255,255,255,0.13)", borderRadius: 6, fontSize: 11 }} labelStyle={{ color: "#98a1ad" }} />
          {usable.map((l) => (
            <Line key={l.key} dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} dot={{ r: 3, fill: l.color }} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
