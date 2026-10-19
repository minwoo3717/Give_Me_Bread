import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate only: sends visitors without a session cookie to the login
// page before any admin page renders. It cannot tell a valid session from a
// forged cookie; requireAdmin() in every admin page and action does that.
const COOKIE_NAMES = ["__Host-oven_session", "oven_session"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const hasCookie = COOKIE_NAMES.some((name) => request.cookies.has(name));
  if (!hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
