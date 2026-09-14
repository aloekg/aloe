import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LEGACY_FALLBACK, LEGACY_PERMANENT } from "@/lib/legacy-redirects";

export async function proxy(request: NextRequest) {
  // The previous site's non-product URLs, resolved before anything else: these are followed almost
  // entirely by crawlers and by people arriving from search results that still point at the old
  // shop, none of whom carry a session. Product URLs are not here — there are 2415 and they need a
  // database lookup, so they keep their route handlers (lib/legacy-redirect.ts).
  const pathname = request.nextUrl.pathname.toLowerCase();
  if (pathname.endsWith(".html")) {
    const exact = LEGACY_PERMANENT[pathname];
    if (exact) return NextResponse.redirect(new URL(exact, request.url), 301);
    // Dissolved by the category reorganisation, or a brand this catalogue no longer carries: the
    // nearest listing, and a 302 so the URL is not permanently tied to a page it never had.
    const nearest = LEGACY_FALLBACK[pathname];
    if (nearest) return NextResponse.redirect(new URL(nearest, request.url), 302);
  }

  // Anonymous visitors — the bulk of storefront traffic — have no Supabase cookie, so there is
  // no session to refresh. Bailing out here skips a network round trip to GoTrue on every
  // prerendered page and every RSC prefetch.
  if (!request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    },
  );

  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Also excludes _next/data, the metadata routes and font/icon assets — none of them need
    // a refreshed session, and sitemap.xml/robots.txt were previously matched.
    "/((?!_next/static|_next/image|_next/data|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|woff|woff2|ttf)$).*)",
  ],
};
