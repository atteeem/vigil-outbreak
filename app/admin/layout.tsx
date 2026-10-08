import Link from "next/link";
import { LogoutButton } from "@/components/admin/logout-button";

export const dynamic = "force-dynamic";

const LINKS = [
  ["/admin", "Sources & ingestion"],
  ["/admin/logs", "Ingestion logs"],
  ["/admin/review", "Incoming review"],
  ["/admin/outbreaks", "Outbreaks"],
  ["/admin/audit", "Audit history"],
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1500px] px-3 pb-12 pt-3 sm:px-4">
      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-line pb-2">
        <span className="eyebrow mr-3 text-warn">Admin</span>
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="rounded-md px-2.5 py-1 text-xs text-ink-dim hover:bg-hover hover:text-ink">{label}</Link>
        ))}
        <span className="ml-auto"><LogoutButton /></span>
      </div>
      {children}
    </div>
  );
}
