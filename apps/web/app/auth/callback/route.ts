import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensurePersonalWorkspace } from "@/lib/account";
import { env } from "@/lib/env";
import { recoverGithubConnection } from "@/lib/github-connection";

/**
 * OAuth (PKCE) callback: GitHub → Supabase → here. Exchanges the code for a
 * cookie session and forwards to the requested internal page.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const githubState = searchParams.get("github_state");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      try {
        await ensurePersonalWorkspace(supabase);
        if (githubState) {
          const providerToken = data.session?.provider_token;
          if (!providerToken) {
            return NextResponse.redirect(
              `${origin}/connect?error=github_access`,
            );
          }
          const recovery = await recoverGithubConnection(
            githubState,
            providerToken,
          );
          if (recovery.kind === "error") {
            return NextResponse.redirect(
              `${origin}/connect?error=${recovery.code}`,
            );
          }
          if (recovery.kind === "install") {
            return NextResponse.redirect(
              `https://github.com/apps/${env.NEXT_PUBLIC_GITHUB_APP_SLUG}/installations/new?state=${recovery.state}`,
            );
          }
          return NextResponse.redirect(
            `${origin}/connect?installation=${recovery.installationId}`,
          );
        }
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
