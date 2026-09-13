import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Validates the redirect target to prevent open-redirect vulnerabilities.
 * Ensures the target is a relative path starting with '/' and does not contain protocol-relative '//'.
 */
export function validateRedirectTarget(target: string | null): string {
  if (!target || typeof target !== "string") {
    return "/";
  }

  const trimmed = target.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\")) {
    return trimmed;
  }

  return "/";
}

/**
 * GET /auth/callback
 *
 * Supabase OAuth code exchange callback route.
 * Exchanging the authorization code sets the user session cookie on the response.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = validateRedirectTarget(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }

    console.error("[Auth Callback] Exchange code error:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
