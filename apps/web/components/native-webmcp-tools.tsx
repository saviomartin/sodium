"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createNativeWebMcpDispatcher,
  createNativeWebMcpTools,
  describeNativeWebMcpCapabilities,
  getNativeModelContext,
  registerNativeWebMcpTools,
  type NativeWebMcpHandlers,
} from "@/lib/native-webmcp";
import {
  webMcpAuthorizeCli,
  webMcpDeleteAccount,
  webMcpDeleteProject,
  webMcpGetAppState,
  webMcpGetProject,
  webMcpGetTool,
  webMcpListProjects,
  webMcpSignOut,
  webMcpStartSignIn,
} from "@/lib/native-webmcp-actions";

function stringInput(input: Record<string, unknown>, key: string): string {
  return typeof input[key] === "string" ? input[key] : "";
}

function daysInput(
  input: Record<string, unknown>,
): { ok: true; value: 7 | 30 | 90 } | { ok: false } {
  if (input.days === undefined || input.days === 30) {
    return { ok: true, value: 30 };
  }
  if (input.days === 7 || input.days === 90) {
    return { ok: true, value: input.days };
  }
  return { ok: false };
}

/** Registers the Sodium dashboard itself with the browser's native WebMCP API. */
export function NativeWebMcpTools() {
  const router = useRouter();

  useEffect(() => {
    const navigate = (path: string, replace = false) => {
      if (replace) router.replace(path);
      else router.push(path);
      return Promise.resolve({ ok: true, path });
    };
    const refreshAfterMutation = (path: string) => {
      // Auth and deletion mutations change cookies/data outside the current
      // RSC tree. A full navigation guarantees the destination re-evaluates
      // both instead of leaving a stale protected page mounted.
      setTimeout(() => window.location.assign(path), 0);
    };

    const handlers: NativeWebMcpHandlers = {
      describeCapabilities: async () => describeNativeWebMcpCapabilities(),
      getAppState: () =>
        webMcpGetAppState(
          `${window.location.pathname}${window.location.search}`,
        ),
      listProjects: () => webMcpListProjects(),
      getProject: (input) => {
        const days = daysInput(input);
        if (!days.ok)
          return Promise.resolve({ ok: false, error: "invalid_input" });
        return webMcpGetProject(stringInput(input, "projectId"), days.value);
      },
      getTool: (input) => {
        const days = daysInput(input);
        if (!days.ok)
          return Promise.resolve({ ok: false, error: "invalid_input" });
        return webMcpGetTool(
          stringInput(input, "projectId"),
          stringInput(input, "toolName"),
          days.value,
        );
      },
      navigate: (input) => {
        const destination = stringInput(input, "destination");
        if (destination === "home") return navigate("/");
        if (destination === "settings") return navigate("/settings");
        if (destination === "activate_cli") {
          const code = stringInput(input, "code").trim().toUpperCase();
          const query = code ? `?code=${encodeURIComponent(code)}` : "";
          return navigate(`/activate${query}`);
        }
        return Promise.resolve({ ok: false, error: "invalid_destination" });
      },
      openProject: (input) => {
        const projectId = stringInput(input, "projectId");
        if (!/^prj_[a-z0-9]{8,24}$/.test(projectId)) {
          return Promise.resolve({ ok: false, error: "invalid_project_id" });
        }
        const days = daysInput(input);
        if (!days.ok) {
          return Promise.resolve({ ok: false, error: "invalid_input" });
        }
        return navigate(`/projects/${projectId}?range=${days.value}d`);
      },
      signIn: async (input) => {
        const provider = stringInput(input, "provider");
        const requestedNext = stringInput(input, "nextPath");
        const currentPath = `${window.location.pathname}${window.location.search}`;
        const result = await webMcpStartSignIn(
          provider,
          requestedNext || currentPath,
        );
        if (result.ok && result.redirectUrl) {
          const redirectUrl = result.redirectUrl;
          setTimeout(() => window.location.assign(redirectUrl), 0);
          return {
            ok: true,
            provider: result.provider,
            status: "redirecting_to_identity_provider",
          };
        }
        return result;
      },
      signOut: async (input) => {
        const result = await webMcpSignOut(input.confirmed === true);
        if (result.ok) refreshAfterMutation("/");
        return result;
      },
      authorizeCli: async (input) => {
        const result = await webMcpAuthorizeCli(
          stringInput(input, "code"),
          input.confirmed === true,
        );
        if (result.ok && result.code) {
          refreshAfterMutation(
            `/activate?code=${encodeURIComponent(result.code)}&complete=1`,
          );
        }
        return result;
      },
      deleteProject: async (input) => {
        const result = await webMcpDeleteProject(
          stringInput(input, "projectId"),
          stringInput(input, "confirmation"),
        );
        if (result.ok) refreshAfterMutation("/?deleted=project");
        return result;
      },
      deleteAccount: async (input) => {
        const result = await webMcpDeleteAccount(
          stringInput(input, "confirmation"),
        );
        if (result.ok) refreshAfterMutation("/?deleted=account");
        return result;
      },
    };

    const dispatcher = createNativeWebMcpDispatcher(handlers);
    const bridge = window.__sodiumWebMcp;
    if (bridge) {
      bridge.setHandler(dispatcher);
      void bridge.register().catch((error: unknown) => {
        console.error("Native WebMCP bridge registration failed", error);
      });
      return () => bridge.clearHandler(dispatcher);
    }

    // The pre-hydration script is the primary path. This fallback preserves
    // functionality if an application CSP or an older Next.js host blocks it.
    const modelContext = getNativeModelContext();
    if (!modelContext) return;
    const registration = new AbortController();
    void registerNativeWebMcpTools(
      modelContext,
      createNativeWebMcpTools(handlers),
      registration.signal,
    ).catch((error: unknown) => {
      if (!registration.signal.aborted) {
        console.error("Native WebMCP tool registration failed", error);
      }
    });

    return () => registration.abort();
  }, [router]);

  return null;
}
