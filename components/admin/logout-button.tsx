"use client";

import { usePathname, useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const path = usePathname();
  if (path === "/admin/login") return null;
  return <button className="btn" onClick={async () => { await fetch("/api/admin/logout", { method: "POST" }); router.push("/admin/login"); router.refresh(); }}>Log out</button>;
}
