import { NextRequest, NextResponse } from "next/server";

// In-memory auth cache: session cookie → { data, expiresAt }
const authCache = new Map<
  string,
  { data: { user: { role: string }; projects: { slug: string }[] }; expiresAt: number }
>();
const CACHE_TTL_MS = 30_000; // 30 seconds
const FETCH_TIMEOUT_MS = 5_000; // 5 seconds

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
    // Check cache first
    const cached = authCache.get(sessionToken);
    let data: { user: { role: string }; projects: { slug: string }[] };

    if (cached && cached.expiresAt > Date.now()) {
      data = cached.data;
    } else {
      // Evict stale entry if present
      if (cached) authCache.delete(sessionToken);

      // Validate session against district2 auth service (internal Docker network)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const authRes = await fetch("http://district2:8050/auth/me", {
          headers: { Cookie: `session=${sessionToken}` },
          signal: controller.signal,
        });

        if (!authRes.ok) {
          return NextResponse.redirect(new URL("/login", request.url));
        }

        data = await authRes.json();
      } finally {
        clearTimeout(timeout);
      }

      // Cache the successful response
      authCache.set(sessionToken, {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    }

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
    // Auth service unreachable or timed out — return 503
    return new NextResponse("Auth service unavailable", { status: 503 });
  }
}

export const config = {
  matcher: "/finance/:path*",
};
