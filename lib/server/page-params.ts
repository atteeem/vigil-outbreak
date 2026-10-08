import { parseAsOf } from "@/lib/domain/timeline";
import type { DashboardFilters } from "@/components/dashboard/command-center";
import type { OutbreakFilters } from "./queries";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function readDashboardParams(sp: SP) {
  const filters: DashboardFilters = {
    disease: one(sp.disease),
    country: one(sp.country).toUpperCase(),
    status: one(sp.status).split(",").filter(Boolean),
    since: one(sp.since),
    q: one(sp.q),
  };
  const asOf = parseAsOf(one(sp.asOf));
  const query: OutbreakFilters = {
    disease: filters.disease || null,
    country: filters.country || null,
    classification: filters.status.length ? filters.status : null,
    q: filters.q || null,
    sinceDays: Number(filters.since) || null,
  };
  return { filters, asOf, query };
}

export { one };
