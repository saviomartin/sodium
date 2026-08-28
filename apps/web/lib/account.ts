import "server-only";
import { createClient } from "./supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Compatibility guard for deployments where a user existed before personal
 * workspaces became automatic. The database trigger handles every new user;
 * auth callbacks call this once to heal older accounts safely.
 */
export async function ensurePersonalWorkspace(
  supabase: ServerSupabaseClient,
): Promise<{ userId: string; workspaceId: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (membership) return { userId: user.id, workspaceId: membership.org_id };

  const slug = `account-${user.id.replaceAll("-", "")}`;
  const { data: workspaceId, error } = await supabase.rpc(
    "create_organization",
    {
      p_name: "Personal workspace",
      p_slug: slug,
    },
  );
  if (!error && workspaceId) {
    return { userId: user.id, workspaceId: String(workspaceId) };
  }

  // A simultaneous callback may have won the insert race. Re-read before
  // treating a duplicate-slug response as a real setup failure.
  const { data: recovered } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (recovered) return { userId: user.id, workspaceId: recovered.org_id };
  throw new Error(error?.message ?? "could not prepare your account");
}
