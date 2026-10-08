"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Calls an admin API and refreshes server data. Errors are surfaced, never swallowed. */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function run<T = unknown>(key: string, url: string, method: string, body?: unknown, okMessage?: (data: T) => string): Promise<T | null> {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      if (okMessage) setMessage(okMessage(data as T));
      router.refresh();
      return data as T;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  }
  return { run, busy, error, message, setError };
}

export function Flash({ error, message }: { error: string | null; message: string | null }) {
  if (error) return <p role="alert" className="rounded-md border border-danger/30 bg-danger/[0.06] px-3 py-2 text-xs text-danger" data-testid="admin-error">{error}</p>;
  if (message) return <p role="status" className="rounded-md border border-ok/30 bg-ok/[0.06] px-3 py-2 text-xs text-ok" data-testid="admin-message">{message}</p>;
  return null;
}
