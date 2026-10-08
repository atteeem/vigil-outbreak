import type { Metadata } from "next";
import { CommandCenter } from "@/components/dashboard/command-center";
import { getDashboard } from "@/lib/server/queries";
import { readDashboardParams } from "@/lib/server/page-params";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live Map" };

export default async function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { filters, asOf, query } = readDashboardParams(await searchParams);
  const initial = await getDashboard(asOf, query);
  return <CommandCenter variant="map" initial={initial} initialFilters={filters} initialAsOf={asOf?.toISOString() ?? null} />;
}
