import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { resolveOrigin, safeRedirect } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const resolvedOrigin = resolveOrigin(request.headers.get("x-forwarded-host"), origin);
  const token_hash = searchParams.get("token_hash");
  const code = searchParams.get("code");

  // `type` lands here straight from the query string, so check it against the values verifyOtp
  // actually accepts rather than casting.
  const OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;
  const rawType = searchParams.get("type");
  const type = (OTP_TYPES as readonly string[]).includes(rawType ?? "") ? (rawType as EmailOtpType) : null;

  // OTP flow: token_hash in the link (email template sends directly to our app)
  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) {
      // The customer only ever sees "ссылка недействительна", which is right for them and useless
      // for us: an expired token, a token already spent and a project misconfiguration all land
      // here. The reason goes to the server log instead.
      console.error("[auth/confirm] verifyOtp failed:", type, error.message);
      return NextResponse.redirect(`${resolvedOrigin}/auth?error=confirmation_failed`);
    }

    // Recovery is the one type whose session IS the point. verifyOtp is what proves the person
    // reading the mailbox owns the account, and /auth/new-password spends that proof on a single
    // updateUser call. Signing out here, as every other type does, is precisely what made the
    // password-reset link a dead end: it arrived, it verified, and it left nothing behind to set a
    // password with — while the sign-in form offered no way to ask for one in the first place.
    if (type === "recovery") {
      const next = searchParams.get("next");
      return NextResponse.redirect(next ? safeRedirect(next, resolvedOrigin) : `${resolvedOrigin}/auth/new-password`);
    }

    // verifyOtp sets session cookies, so signing out keeps this consistent with the PKCE branch
    // below — otherwise the page says "now you can log in" while the header already shows the
    // user as logged in. `scope: "local"` so confirming on one device doesn't revoke the others.
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(`${resolvedOrigin}/auth?confirmed=true`);
  }

  // PKCE / OAuth flow: code exchange
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    const next = searchParams.get("next");
    if (!error) {
      if (next) {
        return NextResponse.redirect(safeRedirect(next, resolvedOrigin));
      }
      // scope: "local" — a global sign-out here would revoke the user's other devices.
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.redirect(`${resolvedOrigin}/auth?confirmed=true`);
    }
    console.error("[auth/confirm] code exchange failed:", error.message);
    return NextResponse.redirect(`${resolvedOrigin}/auth?error=confirmation_failed`);
  }

  // Neither an OTP nor a code: an OAuth provider that refused, or a link that lost its query.
  // `error`/`error_description` are the provider's own, and they are the only account of what
  // went wrong that exists.
  console.error("[auth/confirm] no token_hash or code:", Object.fromEntries(searchParams));
  return NextResponse.redirect(`${resolvedOrigin}/auth?error=confirmation_failed`);
}
