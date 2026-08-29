import { NextResponse, type NextRequest } from "next/server";
import { verifyInstallation } from "@/lib/github";
import {
  createGithubAuthorization,
  readGithubConnectionState,
  recoverGithubInstallationWithProviderToken,
} from "@/lib/github-connection";
import { createClient, currentUserId } from "@/lib/supabase/server";

/**
 * GitHub App post-install callback (the app's Setup URL). The query's
 * installation_id is untrusted: new installs are bound to the session via a
 * state cookie and OAuth ownership check. Update redirects are accepted only
 * for an existing RLS-visible installation after GitHub API verification.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const installationIdRaw = searchParams.get("installation_id");
  const state = searchParams.get("state");
  const installationId = Number(installationIdRaw);

  const userId = await currentUserId();
  if (!userId) return NextResponse.redirect(new URL("/", request.url));

  if (!Number.isInteger(installationId) || installationId <= 0) {
    return NextResponse.redirect(new URL("/?error=github_state", request.url));
  }

  const info = await verifyInstallation(installationId);
  if (!info) {
    return NextResponse.redirect(
      new URL("/?error=github_installation", request.url),
    );
  }

  const supabase = await createClient();
  if (!state) {
    // GitHub's "Redirect on update" callback has no installation state. Only
    // accept an installation already visible to this signed-in user via RLS;
    // verifyInstallation above also confirms it still belongs to this app.
    const { data: existing } = await supabase
      .from("github_installations")
      .select("installation_id")
      .eq("installation_id", installationId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.redirect(
        new URL("/?error=github_access", request.url),
      );
    }
    return NextResponse.redirect(
      new URL(`/?add=1&installation=${installationId}`, request.url),
    );
  }

  const connection = await readGithubConnectionState(state);
  if (!connection) {
    return NextResponse.redirect(new URL("/?error=github_state", request.url));
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.provider_token) {
    const recovery = await recoverGithubInstallationWithProviderToken(
      state,
      installationId,
      session.provider_token,
    );
    if (recovery.kind === "connected") {
      return NextResponse.redirect(
        new URL(`/?add=1&installation=${recovery.installationId}`, request.url),
      );
    }
    if (recovery.kind === "error") {
      return NextResponse.redirect(
        new URL(`/?error=${recovery.code}`, request.url),
      );
    }
  }

  try {
    const authorization = await createGithubAuthorization(
      connection.orgId,
      info.installationId,
    );
    return NextResponse.redirect(authorization.url);
  } catch {
    return NextResponse.redirect(new URL("/?error=github_access", request.url));
  }
}
