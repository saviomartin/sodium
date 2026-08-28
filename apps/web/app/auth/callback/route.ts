import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensurePersonalWorkspace } from "@/lib/account";

/**
 * OAuth (PKCE) callback: GitHub → Supabase → here. Exchanges the code for a
 * cookie session and forwards to the requested internal page.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      try {
        await ensurePersonalWorkspace(supabase);
        return NextResponse.redirect(`${origin}${next}`);
      } catch (setupError) {
        const message =
          setupError instanceof Error
            ? setupError.message
            : "could not prepare your account";
        return NextResponse.redirect(
          `${origin}/login?error=${encodeURIComponent(message)}`,
        );
      }
    }
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(providerError ?? "sign-in was cancelled")}`,
  );
}
