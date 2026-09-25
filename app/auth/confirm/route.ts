import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { resolveOrigin, safeRedirect } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const resolvedOrigin = resolveOrigin(request.headers.get("x-forwarded-host"), origin);
  const token_hash = searchParams.get("token_hash");
  const code = searchParams.get("code");

  // Checked against what verifyOtp accepts, never cast: it comes straight from the query string.
  const OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;
  const rawType = searchParams.get("type");
  const type = (OTP_TYPES as readonly string[]).includes(rawType ?? "") ? (rawType as EmailOtpType) : null;

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) {
      console.error("[auth/confirm] verifyOtp failed:", type, error.message);
      return NextResponse.redirect(`${resolvedOrigin}/auth?error=confirmation_failed`);
    }

    // Recovery keeps its session for /auth/new-password to spend; do not sign out here.
    if (type === "recovery") {
      const next = searchParams.get("next");
      return NextResponse.redirect(next ? safeRedirect(next, resolvedOrigin) : `${resolvedOrigin}/auth/new-password`);
    }

    // Sign out so the page and the header agree; scope "local" keeps other devices signed in.
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(`${resolvedOrigin}/auth?confirmed=true`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    const next = searchParams.get("next");
    if (!error) {
      if (next) {
        return NextResponse.redirect(safeRedirect(next, resolvedOrigin));
      }
      // scope "local": a global sign-out would revoke the user's other devices.
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.redirect(`${resolvedOrigin}/auth?confirmed=true`);
    }
    console.error("[auth/confirm] code exchange failed:", error.message);
    return NextResponse.redirect(`${resolvedOrigin}/auth?error=confirmation_failed`);
  }

  console.error("[auth/confirm] no token_hash or code:", Object.fromEntries(searchParams));
  return NextResponse.redirect(`${resolvedOrigin}/auth?error=confirmation_failed`);
}
