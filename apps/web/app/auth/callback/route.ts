import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensurePersonalWorkspace } from "@/lib/account";
import { env, hasGithubApp } from "@/lib/env";
import {
  connectGithubWithProviderToken,
  recoverGithubConnection,
} from "@/lib/github-connection";
import { githubNewInstallationUrl } from "@/lib/github-installation-url";

/**
 * OAuth (PKCE) callback: GitHub → Supabase → here. Exchanges the code for a
 * cookie session and forwards to the requested internal page.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const githubState = searchParams.get("github_state");
  const rawNext = searchParams.get("next") ?? "/";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const shouldSetupGithub = searchParams.get("setup") === "github";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      try {
        const workspace = await ensurePersonalWorkspace(supabase);
        if (githubState) {
          const providerToken = data.session?.provider_token;
          if (!providerToken) {
            return NextResponse.redirect(`${origin}/?error=github_access`);
          }
          const recovery = await recoverGithubConnection(
            githubState,
            providerToken,
          );
          if (recovery.kind === "error") {
            return NextResponse.redirect(`${origin}/?error=${recovery.code}`);
          }
          if (recovery.kind === "install") {
            return NextResponse.redirect(
              githubNewInstallationUrl(
                env.NEXT_PUBLIC_GITHUB_APP_SLUG!,
                recovery.state,
              ),
            );
          }
          return NextResponse.redirect(
            `${origin}/?add=1&installation=${recovery.installationId}`,
          );
        }
        if (
          shouldSetupGithub &&
          workspace &&
          data.session?.provider_token &&
          hasGithubApp() &&
          env.NEXT_PUBLIC_GITHUB_APP_SLUG
        ) {
          const { data: existing } = await supabase
            .from("github_installations")
            .select("id")
            .eq("org_id", workspace.workspaceId)
            .is("suspended_at", null)
            .limit(1);
          if ((existing?.length ?? 0) === 0) {
            const recovery = await connectGithubWithProviderToken(
              workspace.workspaceId,
              data.session.provider_token,
            );
            if (recovery.kind === "install") {
              return NextResponse.redirect(
                githubNewInstallationUrl(
                  env.NEXT_PUBLIC_GITHUB_APP_SLUG,
                  recovery.state,
                ),
              );
            }
            if (recovery.kind === "connected") {
              return NextResponse.redirect(
                `${origin}/?add=1&installation=${recovery.installationId}`,
              );
            }
            return NextResponse.redirect(`${origin}/?error=${recovery.code}`);
          }
        }
        return NextResponse.redirect(`${origin}${next}`);
      } catch (setupError) {
        const message =
          setupError instanceof Error
            ? setupError.message
            : "could not prepare your account";
        return NextResponse.redirect(
          `${origin}/?error=${encodeURIComponent(message)}`,
        );
      }
    }
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent(error.message)}`,
    );
  }

  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");
  return NextResponse.redirect(
    `${origin}/?error=${encodeURIComponent(providerError ?? "sign-in was cancelled")}`,
  );
}
