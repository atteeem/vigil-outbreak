"use client";

import { useState } from "react";

export function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel space-y-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
        setBusy(false);
        if (res.ok) window.location.href = next;
        else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Login failed");
      }}
    >
      <label className="eyebrow block" htmlFor="pw">Password</label>
      <input id="pw" type="password" autoComplete="current-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <button className="btn btn-accent w-full justify-center" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
