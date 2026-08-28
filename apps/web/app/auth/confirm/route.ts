import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ensurePersonalWorkspace } from "@/lib/account";

/**
 * Token-hash verification (the standard @supabase/ssr confirm route): used
 * by emailed links — invites, magic links — and by the e2e suite, which
 * signs in with admin-generated magic-link tokens instead of passwords.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/dashboard";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
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
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("invalid confirmation link")}`,
  );
}
