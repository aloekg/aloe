import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie for the routes whose server code reads it.
 *
 * Only those routes: the browser client refreshes its own token, so a storefront page that never
 * calls `createClient()` on the server gains nothing from a proxy pass — and on Vercel the proxy
 * runs before the CDN cache is consulted, so every ISR hit and every RSC prefetch of the home page,
 * a product or a brand was a function invocation for nothing. The matcher below is the list of
 * routes that do read the session; a new one has to be added here when it is created, which is why
 * lib/auth.ts says so. The old shop's static redirects used to be answered here too and moved to
 * `redirects()` in next.config.ts, where they cost no invocation either.
 */
export async function proxy(request: NextRequest) {
  // No Supabase cookie, no session to refresh — a signed-out visitor opening /checkout.
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
  // Every route whose page, layout or route handler calls lib/supabase-server's createClient()
  // (directly or through requireAuth / requireAdmin). Server actions posted from these pages are
  // covered too, since they post to the page's own path.
  matcher: [
    "/admin/:path*",
    "/auth/:path*",
    "/checkout/:path*",
    "/favorites",
    "/order/:path*",
    "/profile/:path*",
    "/review/:path*",
  ],
};
