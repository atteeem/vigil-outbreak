import { CommandCenter } from "@/components/dashboard/command-center";
import { getDashboard } from "@/lib/server/queries";
import { readDashboardParams } from "@/lib/server/page-params";

export const dynamic = "force-dynamic";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { filters, asOf, query } = readDashboardParams(await searchParams);
  const initial = await getDashboard(asOf, query);
  return <CommandCenter variant="overview" initial={initial} initialFilters={filters} initialAsOf={asOf?.toISOString() ?? null} />;
}
