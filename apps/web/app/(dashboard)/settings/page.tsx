import { deleteAccountAction, signOutAction } from "@/lib/actions";
import { getAccountContext } from "@/lib/queries";
import { ConfirmAction } from "@/components/confirm-action";
import { Card, secondaryButtonClass } from "@/components/ui";
import { GearIcon, KeyIcon, SignOutIcon, TrashIcon } from "@/components/icons";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { email } = await getAccountContext();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-medium">
          <GearIcon aria-hidden className="size-6 shrink-0 text-faint" />
          Settings
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          Manage the GitHub account signed in as {email}.
        </p>
      </header>

      <Card title="Session" icon={KeyIcon}>
        <form action={signOutAction}>
          <button className={secondaryButtonClass} type="submit">
            <SignOutIcon aria-hidden className="size-4 shrink-0" />
            Sign out
          </button>
        </form>
      </Card>

      <Card title="Delete account" icon={TrashIcon}>
        <div className="space-y-4">
          <p className="max-w-xl text-sm text-neutral-400 text-pretty">
            Permanently deletes connected repositories, analyses, review data,
            manifests, deployment history, stored artifacts, and your sign-in
            identity. GitHub repositories are never modified or deleted.
          </p>
          <ConfirmAction
            action={deleteAccountAction}
            trigger="Delete account"
            triggerIcon="delete"
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
