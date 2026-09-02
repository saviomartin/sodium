import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "./supabase/server";

export async function getAccountContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { userId: null, email: "", displayName: "", avatarUrl: null };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  return {
    userId: user.id,
    email: user.email ?? "",
    displayName: profile?.display_name || user.user_metadata.user_name || "",
    avatarUrl: profile?.avatar_url ?? user.user_metadata.avatar_url ?? null,
  };
}

export async function listProjects() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, current_deployment_id, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const projects = data ?? [];
  const deploymentIds = projects
    .map((project) => project.current_deployment_id)
    .filter((id): id is string => Boolean(id));
  const { data: deployments, error: deploymentsError } = deploymentIds.length
    ? await supabase
        .from("deployments")
        .select("id, version, tool_count, created_at")
        .in("id", deploymentIds)
    : { data: [], error: null };
  if (deploymentsError) throw new Error(deploymentsError.message);
  const byId = new Map(
    (deployments ?? []).map((deployment) => [deployment.id, deployment]),
  );
  return projects.map((project) => ({
    ...project,
    deployment: project.current_deployment_id
      ? (byId.get(project.current_deployment_id) ?? null)
      : null,
  }));
}

export async function getProjectDashboard(projectId: string, days = 30) {
  const supabase = await createClient();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, current_deployment_id, created_at, updated_at")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw new Error(projectError.message);
  if (!project) notFound();

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const [deploymentResult, eventResult] = await Promise.all([
    supabase
      .from("deployments")
      .select("id, version, config_hash, tool_count, config, created_at")
      .eq("project_id", projectId)
      .order("version", { ascending: false })
      .limit(20),
    supabase
      .from("usage_events")
      .select(
        "event, tool_id, tool_name, invocation_id, duration_ms, error_code, received_at",
      )
      .eq("project_id", projectId)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(5000),
  ]);
  if (deploymentResult.error) throw new Error(deploymentResult.error.message);
  if (eventResult.error) throw new Error(eventResult.error.message);
  return {
    project,
    deployments: deploymentResult.data ?? [],
    events: eventResult.data ?? [],
  };
}
