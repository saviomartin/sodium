"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "./supabase/server";
import { createServiceClient } from "./supabase/service";
import { siteUrl } from "./env";

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signInWithGithubAction(
  formData: FormData,
): Promise<void> {
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const callback = new URL("/auth/callback", siteUrl());
  callback.searchParams.set("next", next);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: callback.toString() },
  });
  if (error || !data.url)
    redirect(
      `/?error=${encodeURIComponent(error?.message ?? "Sign in failed")}`,
    );
  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/");
}

export async function authorizeCliAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    redirect(`/login?next=${encodeURIComponent(`/activate?code=${code}`)}`);
  const service = createServiceClient();
  const { data, error } = await service
    .from("cli_auth_requests")
    .update({ user_id: user.id, authorized_at: new Date().toISOString() })
    .eq("user_code", code)
    .is("user_id", null)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (error || !data)
    redirect(`/activate?code=${encodeURIComponent(code)}&error=invalid`);
  redirect(`/activate?code=${encodeURIComponent(code)}&complete=1`);
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  if (formData.get("confirmation") !== "delete") return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  await supabase.auth.signOut({ scope: "global" });
  const { error } = await createServiceClient().auth.admin.deleteUser(user.id);
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  redirect("/?deleted=1");
}

export interface DeleteProjectState {
  error: string | null;
}

const DeleteProjectSchema = z.object({
  projectId: z.string().regex(/^prj_[a-z0-9]{8,24}$/),
  confirmation: z.string().trim().min(1).max(120),
});

export async function deleteProjectAction(
  _state: DeleteProjectState,
  formData: FormData,
): Promise<DeleteProjectState> {
  const input = DeleteProjectSchema.safeParse({
    projectId: formData.get("projectId"),
    confirmation: formData.get("confirmation"),
  });
  if (!input.success) return { error: "Enter the project name to confirm." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in and try again." };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", input.data.projectId)
    .maybeSingle();
  if (projectError) return { error: "The project could not be checked." };
  if (!project) return { error: "Project not found." };
  if (input.data.confirmation !== project.name) {
    return { error: `Type ${project.name} exactly to confirm.` };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("projects")
    .delete()
    .eq("id", project.id)
    .select("id")
    .maybeSingle();
  if (deleteError || !deleted) {
    return { error: "The project could not be deleted. Try again." };
  }
  redirect("/dashboard?deleted=1");
}
