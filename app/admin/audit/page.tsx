import { prisma } from "@/lib/db";
import { fmtUtc } from "@/lib/utils";

export default async function AuditPage() {
  const entries = await prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  return (
    <main>
      <h1 className="mb-3 text-lg font-semibold">Audit history</h1>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-xs" data-testid="audit-table">
          <thead className="text-ink-faint"><tr className="border-b border-line">{["Time (UTC)", "Actor", "Action", "Entity", "Details"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-line/60 align-top">
                <td className="num px-3 py-2 whitespace-nowrap">{fmtUtc(e.createdAt)}</td><td className="px-3 py-2">{e.actor}</td><td className="px-3 py-2 font-medium">{e.action}</td><td className="px-3 py-2 text-ink-dim">{e.entityType}{e.entityId ? ` · ${e.entityId.slice(0, 10)}` : ""}</td>
                <td className="max-w-[520px] px-3 py-2 font-mono text-[10.5px] break-all text-ink-faint">{e.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
