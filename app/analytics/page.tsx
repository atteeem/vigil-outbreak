import type { Metadata } from "next";
import { getAnalytics } from "@/lib/server/queries";
import { AnalyticsView } from "@/components/analytics/analytics-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const data = await getAnalytics();
  return <AnalyticsView data={JSON.parse(JSON.stringify(data))} />;
}
