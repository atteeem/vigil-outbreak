import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TrackerMap } from "@/components/tracker/tracker-map";
import { getTracker } from "@/lib/server/tracker";
import { parseAsOf } from "@/lib/domain/timeline";
import { one } from "@/lib/server/page-params";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live Map" };

/** Live Map of the tracked investigation. Without a tracked event, falls back to the map of all outbreaks. */
export default async function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tracker = await getTracker(parseAsOf(one(sp.asOf)));
  if (!tracker) redirect("/global/map");
  return <TrackerMap initial={tracker} />;
}
