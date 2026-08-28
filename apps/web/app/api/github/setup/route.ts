import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { verifyInstallation } from "@/lib/github";
import { createClient, currentUserId } from "@/lib/supabase/server";

/**
 * GitHub App post-install callback (the app's Setup URL). The query's
 * installation_id is untrusted: we bind the request to the session via the
 * `state` cookie set before redirecting to GitHub, then confirm the
 * installation exists by asking GitHub as the app itself.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const installationIdRaw = searchParams.get("installation_id");
  const state = searchParams.get("state");
  const installationId = Number(installationIdRaw);

  const userId = await currentUserId();
  if (!userId) return NextResponse.redirect(new URL("/login", request.url));

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get("sodium_gh_state")?.value;
  cookieStore.delete("sodium_gh_state");
  let orgId: string | null = null;
  if (stateCookie && state) {
    try {
      const parsed = JSON.parse(stateCookie) as {
        state: string;
        orgId: string;
      };
      if (parsed.state === state) orgId = parsed.orgId;
    } catch {
      // fall through to error redirect
    }
  }
  if (!orgId || !Number.isInteger(installationId) || installationId <= 0) {
    return NextResponse.redirect(
      new URL("/onboarding?error=github_state", request.url),
    );
  }

  const info = await verifyInstallation(installationId);
  if (!info) {
    return NextResponse.redirect(
      new URL("/onboarding?error=github_installation", request.url),
    );
  }

  // User-context insert: RLS enforces the admin/owner role in the org.
  const supabase = await createClient();
  const { error } = await supabase.from("github_installations").insert({
    org_id: orgId,
    installation_id: info.installationId,
    account_login: info.accountLogin,
    account_type: info.accountType,
    created_by: userId,
  });
  if (error && !error.message.includes("duplicate")) {
    return NextResponse.redirect(
      new URL("/onboarding?error=github_store", request.url),
    );
  }

  return NextResponse.redirect(
    new URL(
      `/onboarding/repos?installation=${info.installationId}&org=${orgId}`,
      request.url,
    ),
  );
}
