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
  // Secure only when the browser reached us over HTTPS (directly or via a TLS-terminating proxy). A Secure cookie
  // sent over plain HTTP from any host but localhost (e.g. http://192.168.1.20:3000 or http://my-pc:3000 with
  // `npm start`) is silently dropped by the browser, which made login loop back to the login page.
  res.cookies.set(ADMIN_SESSION_COOKIE, await createAdminSessionToken(), { httpOnly: true, sameSite: "lax", secure: isHttps(req), path: "/", maxAge: 12 * 3600 });
  return res;
}

function isHttps(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded) return forwarded === "https";
  return new URL(req.url).protocol === "https:";
}
