import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
export const fail = (message: string, status = 400) => json({ error: message }, status);

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; res: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: fail("Request body must be JSON") };
  }
  try {
    return { ok: true, data: schema.parse(raw) };
  } catch (err) {
    const msg = err instanceof ZodError ? err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") : "Invalid body";
    return { ok: false, res: fail(msg, 422) };
  }
}

export function handleError(err: unknown) {
  console.error(err);
  return fail(err instanceof Error ? err.message : "Internal error", 500);
}
