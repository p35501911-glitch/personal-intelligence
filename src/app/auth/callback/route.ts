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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      let finalTarget = next;

      // If default target '/' is used, check if the authenticated user
      // has completed category onboarding. First-time users are guided to onboarding.
      if (finalTarget === "/" && data?.user) {
        try {
          const { data: pref } = await supabase
            .from("user_preferences")
            .select("category_selection_mode")
            .eq("user_id", data.user.id)
            .maybeSingle();

          if (!pref) {
            finalTarget = "/onboarding/categories";
          }
        } catch (prefErr) {
          console.warn("[Auth Callback] Could not check user preferences:", prefErr);
        }
      }

      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${finalTarget}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${finalTarget}`);
      } else {
        return NextResponse.redirect(`${origin}${finalTarget}`);
      }
    }

    console.error("[Auth Callback] Exchange code error:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
