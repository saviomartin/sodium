"use server";

import { z } from "zod";
import { SodiumConfigSchema } from "sodium-webmcp-spec";
import { createClient } from "./supabase/server";
import { createServiceClient } from "./supabase/service";
import { siteUrl } from "./env";
import { safeNextPath } from "./safe-next";
import { normalizeToolAnalytics } from "./tool-analytics";
import { toolDetails } from "./tool-details";

const ProjectIdSchema = z.string().regex(/^prj_[a-z0-9]{8,24}$/);
const DaysSchema = z.union([z.literal(7), z.literal(30), z.literal(90)]);

async function account() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    email: user.email ?? "",
    displayName: profile?.display_name || user.user_metadata.user_name || "",
  };
}

async function projectsForUser() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, current_deployment_id, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Projects could not be loaded.");
  const projects = data ?? [];
  const deploymentIds = projects
    .map((project) => project.current_deployment_id)
    .filter((id): id is string => Boolean(id));
  const { data: deployments, error: deploymentError } = deploymentIds.length
    ? await supabase
        .from("deployments")
        .select("id, version, tool_count, created_at")
        .in("id", deploymentIds)
    : { data: [], error: null };
  if (deploymentError) throw new Error("Deployments could not be loaded.");
  const byId = new Map(
    (deployments ?? []).map((deployment) => [deployment.id, deployment]),
  );
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    liveDeployment: project.current_deployment_id
      ? (byId.get(project.current_deployment_id) ?? null)
      : null,
  }));
}

async function projectDashboard(projectId: string, days: number) {
  const parsed = z
    .object({ projectId: ProjectIdSchema, days: DaysSchema })
    .safeParse({ projectId, days });
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };

  const user = await account();
  if (!user) return { ok: false as const, error: "authentication_required" };
  const supabase = await createClient();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, current_deployment_id, created_at, updated_at")
    .eq("id", parsed.data.projectId)
    .maybeSingle();
  if (projectError)
    return { ok: false as const, error: "project_load_failed" };
  if (!project) return { ok: false as const, error: "project_not_found" };

  const [deploymentResult, analyticsResult] = await Promise.all([
    supabase
      .from("deployments")
      .select("id, version, config_hash, tool_count, config, created_at")
      .eq("project_id", project.id)
      .order("version", { ascending: false })
      .limit(20),
    supabase.rpc("get_project_agent_analytics", {
      p_project_id: project.id,
      p_days: parsed.data.days,
    }),
  ]);
  if (deploymentResult.error || analyticsResult.error) {
    return { ok: false as const, error: "project_load_failed" };
  }
  const deployments = deploymentResult.data ?? [];
  const current =
    deployments.find(
      (deployment) => deployment.id === project.current_deployment_id,
    ) ?? deployments[0];
  const configResult = SodiumConfigSchema.safeParse(current?.config);
  const config = configResult.success ? configResult.data : null;
  const analytics = normalizeToolAnalytics(
    analyticsResult.data,
    config?.tools ?? [],
    parsed.data.days,
  );

  return {
    ok: true as const,
    project: {
      id: project.id,
      name: project.name,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      origins: config?.app.origins ?? [],
    },
    currentDeployment: current
      ? {
          id: current.id,
          version: current.version,
          configHash: current.config_hash,
          toolCount: current.tool_count,
          createdAt: current.created_at,
        }
      : null,
    deployments: deployments.map((deployment) => ({
      id: deployment.id,
      version: deployment.version,
      configHash: deployment.config_hash,
      toolCount: deployment.tool_count,
      createdAt: deployment.created_at,
      live: deployment.id === current?.id,
    })),
    tools: toolDetails(config?.tools ?? [], analytics.tools),
    analytics,
  };
}

export async function webMcpGetAppState(currentPath: string) {
  const user = await account();
  const projects = user ? await projectsForUser() : [];
  return {
    ok: true,
    authenticated: Boolean(user),
    account: user,
    currentPath: safeNextPath(currentPath),
    projectCount: projects.length,
    liveProjectCount: projects.filter((project) => project.liveDeployment)
      .length,
    projects,
    destinations: ["home", "settings", "activate_cli"],
    setupCommands: ["npx sodiumtools init", "npx sodiumtools deploy"],
  };
}

export async function webMcpListProjects() {
  if (!(await account())) {
    return { ok: false, error: "authentication_required" };
  }
  return { ok: true, projects: await projectsForUser() };
}

export async function webMcpGetProject(projectId: string, days = 30) {
  return projectDashboard(projectId, days);
}

export async function webMcpGetTool(
  projectId: string,
  toolName: string,
  days = 30,
) {
  const name = z.string().trim().min(1).max(128).safeParse(toolName);
  if (!name.success) return { ok: false, error: "invalid_input" };
  const dashboard = await projectDashboard(projectId, days);
  if (!dashboard.ok) return dashboard;
  const selected = dashboard.tools.find((tool) => tool.name === name.data);
  if (!selected) return { ok: false, error: "tool_not_found" };
  return {
    ok: true,
    project: dashboard.project,
    deployment: dashboard.currentDeployment,
    tool: selected,
  };
}

export async function webMcpStartSignIn(
  provider: string,
  nextPath: string,
) {
  const parsedProvider = z.enum(["github", "google"]).safeParse(provider);
  if (!parsedProvider.success) return { ok: false, error: "invalid_provider" };
  const next = safeNextPath(nextPath);
  const supabase = await createClient();
  const callback = new URL("/auth/callback", siteUrl());
  callback.searchParams.set("next", next);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: parsedProvider.data,
    options: { redirectTo: callback.toString() },
  });
  if (error || !data.url) return { ok: false, error: "sign_in_failed" };
  return { ok: true, provider: parsedProvider.data, redirectUrl: data.url };
}

export async function webMcpSignOut(confirmed: boolean) {
  if (confirmed !== true) return { ok: false, error: "confirmation_required" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return { ok: false, error: "sign_out_failed" };
  return { ok: true };
}

export async function webMcpAuthorizeCli(code: string, confirmed: boolean) {
  const parsed = z
    .object({
      code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/),
      confirmed: z.literal(true),
    })
    .safeParse({ code, confirmed });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await account();
  if (!user) return { ok: false, error: "authentication_required" };
  const { data, error } = await createServiceClient()
    .from("cli_auth_requests")
    .update({ user_id: user.id, authorized_at: new Date().toISOString() })
    .eq("user_code", parsed.data.code)
    .is("user_id", null)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "code_invalid_expired_or_used" };
  }
  return { ok: true, code: parsed.data.code };
}

export async function webMcpDeleteProject(
  projectId: string,
  confirmation: string,
) {
  const parsed = z
    .object({
      projectId: ProjectIdSchema,
      confirmation: z.string().trim().min(1).max(120),
    })
    .safeParse({ projectId, confirmation });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  if (!(await account())) {
    return { ok: false, error: "authentication_required" };
  }
  const supabase = await createClient();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", parsed.data.projectId)
    .maybeSingle();
  if (projectError) return { ok: false, error: "project_load_failed" };
  if (!project) return { ok: false, error: "project_not_found" };
  if (parsed.data.confirmation !== project.name) {
    return {
      ok: false,
      error: "confirmation_mismatch",
      requiredConfirmation: project.name,
    };
  }
  const { data: deleted, error: deleteError } = await supabase
    .from("projects")
    .delete()
    .eq("id", project.id)
    .select("id")
    .maybeSingle();
  if (deleteError || !deleted) {
    return { ok: false, error: "project_delete_failed" };
  }
  return { ok: true, deletedProjectId: project.id };
}

export async function webMcpDeleteAccount(confirmation: string) {
  if (confirmation !== "delete") {
    return { ok: false, error: "confirmation_required" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "authentication_required" };
  const { error: deleteError } =
    await createServiceClient().auth.admin.deleteUser(user.id);
  if (deleteError) return { ok: false, error: "account_delete_failed" };
  await supabase.auth.signOut({ scope: "global" });
  return { ok: true };
}
