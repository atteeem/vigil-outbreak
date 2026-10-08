import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken, isTestBypass } from "@/lib/admin/auth";

// The single server-side authorization boundary for the entire admin surface (VIGIL pattern): every
// /admin page and /api/admin route is gated here, so a new admin route is protected the moment it exists.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login" || pathname === "/api/admin/login") return NextResponse.next();
  if (isTestBypass(request)) return NextResponse.next();
  const authorized = await verifyAdminSessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (authorized) return NextResponse.next();
  if (pathname.startsWith("/api/admin")) return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
