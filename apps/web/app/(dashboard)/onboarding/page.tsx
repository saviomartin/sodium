import { getInstallations, getUserAndOrgs } from "@/lib/queries";
import { hasGithubApp } from "@/lib/env";
import {
  connectFixtureRepoAction,
  connectGithubAction,
  createOrganizationAction,
} from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import {
  Card,
  Field,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui";

export const metadata = { title: "Onboarding" };

/**
 * Guided onboarding: 1) organization → 2) GitHub App installation (repository
 * access, distinct from your sign-in) → 3) repository → 4) preview environment.
 * Steps 3–4 continue on the repository page.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { orgs } = await getUserAndOrgs();
  const org = orgs[0];
  const installations = org ? await getInstallations(org.id) : [];
  const { error } = await searchParams;
  const githubConfigured = hasGithubApp();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-balance">Set up Sodium</h1>
        <p className="mt-1 text-sm text-neutral-500 text-pretty">
          Four steps: organization, GitHub App installation, repository, preview
          environment. Published tools become available to compatible WebMCP
          browser agents while your application is open.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error === "github_state" &&
            "The GitHub installation callback could not be verified. Start again from this page."}
          {error === "github_installation" &&
            "GitHub did not confirm that installation. Start again from this page."}
          {error === "github_store" &&
            "The installation could not be saved. Do you have the admin role in this organization?"}
        </p>
      )}

      <Card title="1 · Organization">
        {org ? (
          <p className="text-sm">
            You&rsquo;re a {orgs[0]!.role} of{" "}
            <span className="font-medium">{org.name}</span>.
          </p>
        ) : (
          <ActionForm action={createOrganizationAction} className="space-y-3">
            <Field label="Organization name">
              <input
                name="name"
                required
                maxLength={120}
                className={inputClass}
                placeholder="Acme Inc"
              />
            </Field>
            <Field label="Slug" hint="Lowercase letters, digits and dashes.">
              <input
                name="slug"
                required
                pattern="[a-z0-9](-?[a-z0-9])*"
                className={inputClass}
                placeholder="acme"
              />
            </Field>
            <SubmitButton className={buttonClass}>
              Create organization
            </SubmitButton>
          </ActionForm>
        )}
      </Card>

      <Card title="2 · GitHub repository access">
        <p className="mb-3 text-sm text-neutral-600 text-pretty">
          This is separate from how you signed in: installing the Sodium GitHub
          App grants repository access (contents: read/write, pull requests:
          read/write) only for the repositories you choose.
        </p>
        {installations.length > 0 && (
          <ul className="mb-3 space-y-1 text-sm">
            {installations.map((installation) => (
              <li key={installation.id}>
                Installed on{" "}
                <span className="font-medium">
                  {installation.account_login}
                </span>
                {installation.installation_id <= 0 && " (local fixture)"}
                {installation.suspended_at && " — suspended"}
              </li>
            ))}
          </ul>
        )}
        {org ? (
          <div className="flex flex-wrap gap-2">
            {githubConfigured ? (
              <form
                action={async () => {
                  "use server";
                  await connectGithubAction(org.id);
                }}
              >
                <button className={buttonClass} type="submit">
                  Install GitHub App
                </button>
              </form>
            ) : (
              <p className="text-sm text-neutral-500 text-pretty">
                No GitHub App is configured on this deployment (see README →
                GitHub App setup). You can still exercise the complete flow with
                the bundled fixture repository:
              </p>
            )}
            <form
              action={async () => {
                "use server";
                await connectFixtureRepoAction(org.id);
              }}
            >
              <button className={secondaryButtonClass} type="submit">
                Use the local fixture repository
              </button>
            </form>
          </div>
        ) : (
          <p className="text-sm text-neutral-400">
            Create an organization first.
          </p>
        )}
      </Card>

      <Card title="3 · Repository & 4 · Preview environment">
        <p className="text-sm text-neutral-500 text-pretty">
          After installing, you&rsquo;ll pick a repository; the preview
          environment (a deployed URL Sodium may crawl, with optional
          credentials) is configured on the repository page. Sodium never builds
          or executes your code.
        </p>
      </Card>
    </div>
  );
}
