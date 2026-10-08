import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken, timingSafeEqual } from "@/lib/admin/auth";
import { parseBody, fail } from "@/lib/server/http";

export async function POST(req: Request) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !process.env.ADMIN_SESSION_SECRET) return fail("Admin login is not configured (set ADMIN_PASSWORD and ADMIN_SESSION_SECRET).", 503);
  const body = await parseBody(req, z.object({ password: z.string().min(1).max(500) }));
  if (!body.ok) return body.res;
  if (!timingSafeEqual(body.data.password, expected)) return fail("Incorrect password.", 401);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, await createAdminSessionToken(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600 });
  return res;
}
