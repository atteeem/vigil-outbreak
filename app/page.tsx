import Link from "next/link";
import { TrackerDashboard } from "@/components/tracker/tracker-dashboard";
import { getTracker } from "@/lib/server/tracker";
import { parseAsOf } from "@/lib/domain/timeline";
import { one } from "@/lib/server/page-params";

export const dynamic = "force-dynamic";

/** Main dashboard: the primary tracked investigation (the Irkutsk investigation). */
export default async function InvestigationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tracker = await getTracker(parseAsOf(one(sp.asOf)));
  if (!tracker) {
    return (
      <main className="panel mx-auto max-w-xl p-6 text-sm text-ink-dim" data-testid="no-tracked-event">
        <h1 className="mb-2 text-base font-semibold text-ink">No tracked investigation configured</h1>
        <p>Run <code className="font-mono">npm run db:reference</code> to set up the Irkutsk investigation as the tracked event, or mark another published outbreak as tracked in the admin. Meanwhile see <Link href="/global" className="text-accent">Global watch</Link>.</p>
      </main>
    );
  }
  // Keyed by the as-of time so switching between historical and live views starts from fresh server data.
  return <TrackerDashboard key={tracker.asOf ?? "live"} initial={tracker} />;
}
