import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TimelineView } from "@/components/tracker/timeline-view";
import { getTracker } from "@/lib/server/tracker";
import { parseAsOf } from "@/lib/domain/timeline";
import { one } from "@/lib/server/page-params";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Investigation timeline" };

export default async function TimelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tracker = await getTracker(parseAsOf(one(sp.asOf)));
  if (!tracker) redirect("/");
  return <TimelineView t={tracker} />;
}
