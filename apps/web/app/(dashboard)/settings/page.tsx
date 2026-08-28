import { deleteAccountAction, signOutAction } from "@/lib/actions";
import { getAccountContext } from "@/lib/queries";
import { ConfirmAction } from "@/components/confirm-action";
import { Card, secondaryButtonClass } from "@/components/ui";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { email } = await getAccountContext();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Manage the GitHub account signed in as {email}.
        </p>
      </header>

      <Card title="Session">
        <form action={signOutAction}>
          <button className={secondaryButtonClass} type="submit">
            Sign out
          </button>
        </form>
      </Card>

      <Card title="Delete account">
        <div className="space-y-4">
          <p className="max-w-xl text-sm text-neutral-600 text-pretty">
            Permanently deletes connected repositories, analyses, review data,
            manifests, deployment history, stored artifacts, and your sign-in
            identity. GitHub repositories are never modified or deleted.
          </p>
          <ConfirmAction
            action={deleteAccountAction}
            trigger="Delete account"
            title="Permanently delete this account?"
            description="All Sodium data for this account will be erased. This cannot be undone. Your GitHub repositories stay untouched."
            confirmLabel="Delete everything"
            danger
            fields={{ confirmation: "delete" }}
          />
        </div>
      </Card>
    </div>
  );
}
