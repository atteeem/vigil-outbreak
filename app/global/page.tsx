import type { Metadata } from "next";
import { CommandCenter } from "@/components/dashboard/command-center";
import { getDashboard } from "@/lib/server/queries";
import { readDashboardParams } from "@/lib/server/page-params";
import { getPrimaryTrackedEvent } from "@/lib/server/tracker";
import { SecondaryNote } from "@/components/tracker/secondary-note";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Global watch" };

export default async function OtherOutbreaksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { filters, asOf, query } = readDashboardParams(await searchParams);
  const [initial, tracked] = await Promise.all([getDashboard(asOf, query), getPrimaryTrackedEvent()]);
  return <><SecondaryNote trackedName={tracked?.name ?? null} /><CommandCenter variant="overview" initial={initial} initialFilters={filters} initialAsOf={asOf?.toISOString() ?? null} /></>;
}
