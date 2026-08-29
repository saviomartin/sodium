const GITHUB_ORIGIN = "https://github.com";

/** GitHub's account chooser for installing this app on another account. */
export function githubNewInstallationUrl(
  appSlug: string,
  state: string,
): string {
  const url = new URL(
    `/apps/${encodeURIComponent(appSlug)}/installations/new`,
    GITHUB_ORIGIN,
  );
  url.searchParams.set("state", state);
  return url.toString();
}

/** The exact GitHub settings page for a personal or organization install. */
export function githubInstallationSettingsUrl(input: {
  installationId: number;
  accountLogin: string;
  accountType: string;
}): string {
  if (!Number.isInteger(input.installationId) || input.installationId <= 0) {
    throw new Error("invalid GitHub installation id");
  }
  const installationPath = `settings/installations/${input.installationId}`;
  const path =
    input.accountType.toLowerCase() === "organization"
      ? `/organizations/${encodeURIComponent(input.accountLogin)}/${installationPath}`
      : `/${installationPath}`;
  return new URL(path, GITHUB_ORIGIN).toString();
}
