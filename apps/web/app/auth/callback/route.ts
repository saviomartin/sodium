import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensurePersonalWorkspace } from "@/lib/account";
import { createRepositoryWebhook, inspectGithubIdentity } from "@/lib/github";

/**
 * The single GitHub OAuth callback signs the user in, stores the same grant for
 * repository access, and sends them directly to the repository picker.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (!code) {
    const providerError =
      searchParams.get("error_description") ?? searchParams.get("error");
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent(
        providerError ?? "GitHub sign-in was cancelled",
      )}`,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent(
        error?.message ?? "GitHub sign-in could not be completed",
      )}`,
    );
  }

  try {
    const workspace = await ensurePersonalWorkspace(supabase);
    const accessToken = data.session.provider_token;
    if (!workspace || !accessToken) {
      throw new Error("GitHub did not return repository access");
    }
    const identity = await inspectGithubIdentity(accessToken);
    const refreshToken = (
      data.session as typeof data.session & {
        provider_refresh_token?: string;
      }
    ).provider_refresh_token;
    const service = createServiceClient();
    const { data: connectionId, error: saveError } = await service.rpc(
      "upsert_github_connection",
      {
        p_org_id: workspace.workspaceId,
        p_github_user_id: identity.githubUserId,
        p_github_login: identity.login,
        p_github_email: identity.email,
        p_scopes: identity.scopes,
        p_access_token: accessToken,
        p_refresh_token: refreshToken ?? "",
        p_created_by: workspace.userId,
      },
    );
    if (saveError || !connectionId) {
      console.error("GitHub OAuth connection save failed", {
        code: saveError?.code ?? "missing_connection_id",
        message: saveError?.message ?? "connection RPC returned no id",
      });
      throw new Error("GitHub connection could not be saved");
    }
    const [{ data: repositories }, { data: hooks }] = await Promise.all([
      service
        .from("repositories")
        .select("id, org_id, owner, name")
        .eq("org_id", workspace.workspaceId),
      service
        .from("github_repository_hooks")
        .select("repository_id")
        .eq("org_id", workspace.workspaceId),
    ]);
    const hooked = new Set((hooks ?? []).map((hook) => hook.repository_id));
    for (const repository of repositories ?? []) {
      if (hooked.has(repository.id)) continue;
      try {
        const hookId = await createRepositoryWebhook(
          String(connectionId),
          repository.owner,
          repository.name,
        );
        await service.from("github_repository_hooks").insert({
          repository_id: repository.id,
          org_id: repository.org_id,
          github_hook_id: hookId,
        });
      } catch (hookError) {
        console.error("GitHub repository webhook backfill failed", {
          repositoryId: repository.id,
          message:
            hookError instanceof Error
              ? hookError.message
              : "unknown GitHub error",
        });
      }
    }
    return NextResponse.redirect(`${origin}/?add=1`);
  } catch (setupError) {
    const message =
      setupError instanceof Error
        ? setupError.message
        : "GitHub sign-in could not be completed";
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent(message)}`,
    );
  }
}
