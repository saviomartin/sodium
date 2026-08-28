import { NextResponse, type NextRequest } from "next/server";
import { verifyInstallation } from "@/lib/github";
import {
  createGithubAuthorization,
  readGithubConnectionState,
} from "@/lib/github-connection";
import { currentUserId } from "@/lib/supabase/server";

/**
 * GitHub App post-install callback (the app's Setup URL). The query's
 * installation_id is untrusted: we bind the request to the session via the
 * `state` cookie, confirm the installation exists, then require a fresh
 * GitHub OAuth ownership check before saving it.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const installationIdRaw = searchParams.get("installation_id");
  const state = searchParams.get("state");
  const installationId = Number(installationIdRaw);

  const userId = await currentUserId();
  if (!userId) return NextResponse.redirect(new URL("/login", request.url));

  const connection = state ? await readGithubConnectionState(state) : null;
  if (!connection || !Number.isInteger(installationId) || installationId <= 0) {
    return NextResponse.redirect(
      new URL("/connect?error=github_state", request.url),
    );
  }

  const info = await verifyInstallation(installationId);
  if (!info) {
    return NextResponse.redirect(
      new URL("/connect?error=github_installation", request.url),
    );
  }

  try {
    const authorization = await createGithubAuthorization(
      connection.orgId,
      info.installationId,
    );
    return NextResponse.redirect(authorization.url);
  } catch {
    return NextResponse.redirect(
      new URL("/connect?error=github_access", request.url),
    );
  }
}
