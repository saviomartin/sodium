export type IntegrationPrStatus = "open" | "merged" | "closed";

interface PullRequestWebhookPayload {
  action?: unknown;
  number?: unknown;
  installation?: { id?: unknown };
  repository?: { id?: unknown };
  pull_request?: {
    merged?: unknown;
    html_url?: unknown;
    head?: { ref?: unknown };
  };
}

export interface PullRequestStatusUpdate {
  githubRepoId: number;
  installationId: number;
  prNumber: number;
  status: IntegrationPrStatus;
  url?: string;
  branch?: string;
}

/** Extracts only the trusted identifiers and lifecycle state Sodium stores. */
export function pullRequestStatusUpdate(
  payload: Record<string, unknown>,
): PullRequestStatusUpdate | null {
  const event = payload as PullRequestWebhookPayload;
  const action = typeof event.action === "string" ? event.action : "";
  const githubRepoId = event.repository?.id;
  const installationId = event.installation?.id;
  const prNumber = event.number;
  const pullRequest = event.pull_request;

  if (
    typeof githubRepoId !== "number" ||
    typeof installationId !== "number" ||
    typeof prNumber !== "number" ||
    !Number.isInteger(prNumber) ||
    prNumber < 1 ||
    !pullRequest
  ) {
    return null;
  }

  let status: IntegrationPrStatus;
  if (action === "closed") {
    status = pullRequest.merged === true ? "merged" : "closed";
  } else if (
    [
      "opened",
      "reopened",
      "synchronize",
      "ready_for_review",
      "converted_to_draft",
      "edited",
    ].includes(action)
  ) {
    status = "open";
  } else {
    return null;
  }

  return {
    githubRepoId,
    installationId,
    prNumber,
    status,
    ...(typeof pullRequest.html_url === "string"
      ? { url: pullRequest.html_url }
      : {}),
    ...(typeof pullRequest.head?.ref === "string"
      ? { branch: pullRequest.head.ref }
      : {}),
  };
}
