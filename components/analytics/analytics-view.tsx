"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SeriesChart } from "@/components/outbreak/series-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { CLASSIFICATION_HEX, CLASSIFICATION_LABEL, type Classification } from "@/lib/domain/enums";

type Series = { slug: string; title: string; points: { t: number; value: number }[] }[];
interface Data {
  confirmed: Series; suspected: Series; deaths: Series;
  status: { key: string; value: number }[]; categories: { key: string; value: number }[]; pathogenTypes: { key: string; value: number }[];
  geography: { key: string; value: number }[]; reporting: { week: string; official: number; media: number }[]; outbreakCount: number;
}

const PALETTE = ["#f2b84b", "#3fd0c9", "#c79bff", "#ef6a5a", "#7aa7ff", "#4fd18b"];
const tip = { contentStyle: { background: "#151a1f", border: "1px solid rgba(255,255,255,0.13)", borderRadius: 6, fontSize: 11 }, labelStyle: { color: "#98a1ad" }, cursor: { fill: "rgba(255,255,255,0.04)" } };
const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

function Panel({ title, note, children, testId }: { title: string; note?: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="panel" data-testid={testId}>
      <div className="panel-head"><h2 className="eyebrow">{title}</h2></div>
      <div className="p-3">{children}{note && <p className="mt-2 text-[11px] text-ink-faint">{note}</p>}</div>
    </section>
  );
}

function HBar({ data, colorFor, label = pretty }: { data: { key: string; value: number }[]; colorFor?: (k: string) => string; label?: (k: string) => string }) {
  if (data.length === 0) return <EmptyState title="No records" />;
  return (
    <div style={{ height: Math.max(120, data.length * 30 + 20) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.map((d) => ({ ...d, name: label(d.key) }))} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <XAxis type="number" allowDecimals={false} tick={{ fill: "#5f6873", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={170} tick={{ fill: "#98a1ad", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip {...tip} />
          <Bar dataKey="value" name="Records" radius={[0, 3, 3, 0]} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={d.key} fill={colorFor ? colorFor(d.key) : PALETTE[i % PALETTE.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const lines = (s: Series) => s.map((x, i) => ({ key: x.slug, name: x.title, color: PALETTE[i % PALETTE.length]!, points: x.points }));

export function AnalyticsView({ data }: { data: Data }) {
  return (
    <main className="mx-auto max-w-[1400px] px-3 pb-12 pt-4 sm:px-4">
      <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
      <p className="mb-4 max-w-3xl text-xs text-ink-dim">Charts use only official, verified, cumulative observations, one line per outbreak — figures from different outbreaks or sources are never added together. A chart appears only when at least two compatible observations exist.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Confirmed cases over time" testId="chart-confirmed"><SeriesChart lines={lines(data.confirmed)} testId="series-confirmed" /></Panel>
        <Panel title="Suspected cases over time" testId="chart-suspected"><SeriesChart lines={lines(data.suspected)} testId="series-suspected" emptyBody="No outbreak currently has two or more official, verified suspected-case figures." /></Panel>
        <Panel title="Deaths where reported" testId="chart-deaths" note="Deaths as reported by the cited authority; attribution to the pathogen is shown on each outbreak page."><SeriesChart lines={lines(data.deaths)} testId="series-deaths" /></Panel>
        <Panel title="Investigation status distribution" testId="chart-status"><HBar data={data.status} colorFor={(k) => CLASSIFICATION_HEX[k as Classification] ?? "#888"} label={(k) => CLASSIFICATION_LABEL[k as Classification] ?? k} /></Panel>
        <Panel title="Disease categories (confirmed pathogens)" testId="chart-categories" note="“Unconfirmed” = no laboratory-confirmed causative agent."><HBar data={data.categories} /></Panel>
        <Panel title="Geographic distribution" testId="chart-geography"><HBar data={data.geography} label={(k) => k} /></Panel>
        <Panel title="Reporting history (publications per week)" testId="chart-reporting">
          {data.reporting.length === 0 ? <EmptyState title="No publications recorded" /> : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.reporting} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: "#5f6873", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(w: string) => w.slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fill: "#5f6873", fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip {...tip} labelFormatter={(w) => `Week of ${w}`} />
                  <Bar dataKey="official" name="Official" stackId="a" fill="#3fd0c9" isAnimationActive={false} />
                  <Bar dataKey="media" name="Media" stackId="a" fill="#5f6873" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title="Pathogen types (confirmed)" testId="chart-pathogen-types"><HBar data={data.pathogenTypes} /></Panel>
      </div>
    </main>
  );
}
