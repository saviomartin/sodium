import { describe, expect, it } from "vitest";
import {
  githubInstallationSettingsUrl,
  githubNewInstallationUrl,
} from "../lib/github-installation-url";

describe("GitHub installation URLs", () => {
  it("opens the account chooser with connection state", () => {
    expect(githubNewInstallationUrl("sodium-webmcp", "abc123")).toBe(
      "https://github.com/apps/sodium-webmcp/installations/new?state=abc123",
    );
  });

  it("opens personal installation settings", () => {
    expect(
      githubInstallationSettingsUrl({
        installationId: 123,
        accountLogin: "savio",
        accountType: "User",
      }),
    ).toBe("https://github.com/settings/installations/123");
  });

  it("opens organization installation settings", () => {
    expect(
      githubInstallationSettingsUrl({
        installationId: 456,
        accountLogin: "acme-inc",
        accountType: "Organization",
      }),
    ).toBe(
      "https://github.com/organizations/acme-inc/settings/installations/456",
    );
  });

  it("rejects an invalid installation id", () => {
    expect(() =>
      githubInstallationSettingsUrl({
        installationId: 0,
        accountLogin: "acme-inc",
        accountType: "Organization",
      }),
    ).toThrow("invalid GitHub installation id");
  });
});
