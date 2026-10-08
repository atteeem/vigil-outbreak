import { prisma } from "@/lib/db";
import { fmtUtc } from "@/lib/utils";
import { safeJson } from "@/lib/ingestion/pipeline";

export default async function LogsPage() {
  const runs = await prisma.ingestionRun.findMany({ orderBy: { startedAt: "desc" }, take: 150, include: { source: { select: { name: true } } } });
  return (
    <main>
      <h1 className="mb-3 text-lg font-semibold">Ingestion logs</h1>
      {runs.length === 0 ? <p className="text-xs text-ink-faint">No ingestion runs yet. Use “Fetch Now” on the sources page.</p> : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs" data-testid="runs-table">
            <thead className="text-ink-faint"><tr className="border-b border-line">{["Started (UTC)", "Source", "Trigger", "Status", "HTTP", "Fetched", "New", "Dup", "Failed", "Error"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {runs.map((r) => {
                const errs = safeJson<string[]>(r.errors, []);
                return (
                  <tr key={r.id} className="border-b border-line/60 align-top">
                    <td className="num px-3 py-2">{fmtUtc(r.startedAt)}</td><td className="px-3 py-2">{r.source.name}</td><td className="px-3 py-2">{r.trigger}</td>
                    <td className={`px-3 py-2 font-medium ${r.status === "FAILED" ? "text-danger" : r.status === "PARTIAL" ? "text-warn" : r.status === "SUCCESS" ? "text-ok" : ""}`}>{r.status}</td>
                    <td className="num px-3 py-2">{r.httpStatus ?? "—"}</td><td className="num px-3 py-2">{r.itemsFetched}</td><td className="num px-3 py-2">{r.itemsNew}</td><td className="num px-3 py-2">{r.itemsDuplicate}</td><td className="num px-3 py-2">{r.itemsFailed}</td>
                    <td className="max-w-[360px] px-3 py-2 text-danger">{r.errorMessage}{errs.length > 0 && <details className="text-ink-dim"><summary className="cursor-pointer">{errs.length} item errors</summary><ul>{errs.map((e, i) => <li key={i}>{e}</li>)}</ul></details>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
