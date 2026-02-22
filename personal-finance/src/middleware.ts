import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets
  if (
    pathname.includes("/_next/static") ||
    pathname.includes("/_next/image") ||
    pathname.endsWith("/favicon.ico")
  ) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get("session")?.value;

  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    // Validate session against district2 auth service (internal Docker network)
    const authRes = await fetch("http://district2:8050/auth/me", {
      headers: { Cookie: `session=${sessionToken}` },
    });

    if (!authRes.ok) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const data = await authRes.json();
    const { user, projects } = data;

    // Admins always have access
    if (user.role === "admin") {
      return NextResponse.next();
    }

    // Check if user has finance project access
    const hasAccess = projects.some(
      (p: { slug: string }) => p.slug === "finance"
    );

    if (!hasAccess) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  } catch {
    // Auth service unreachable — deny access
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: "/finance/:path*",
};
