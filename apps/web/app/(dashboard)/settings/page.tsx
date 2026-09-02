import { deleteAccountAction, signOutAction } from "@/lib/actions";
import { Card, secondaryButtonClass } from "@/components/ui";
import { getAccountContext } from "@/lib/queries";
import { GearIcon, KeyIcon, SignOutIcon, TrashIcon } from "@/components/icons";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { email } = await getAccountContext();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-medium">
          <GearIcon aria-hidden className="size-6 text-neutral-500" />
          Settings
        </h1>
        <p className="mt-2 text-sm text-neutral-400">Signed in as {email}.</p>
      </header>
      <Card title="Session" icon={KeyIcon}>
        <form action={signOutAction}>
          <button className={secondaryButtonClass} type="submit">
            <SignOutIcon aria-hidden className="size-4" />
            Sign out everywhere
          </button>
        </form>
      </Card>
      <Card title="Delete account" icon={TrashIcon}>
        <p className="mb-4 text-sm leading-6 text-neutral-400">
          Deletes projects, deployment history, API tokens, aggregate events,
          and your Sodium identity. It does not touch your application
          repository.
        </p>
        <form action={deleteAccountAction} className="space-y-3">
          <label className="block text-xs text-neutral-500">
            Type <strong className="text-neutral-300">delete</strong> to confirm
            <input
              name="confirmation"
              autoComplete="off"
              className="mt-1 block w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-red-400"
            />
          </label>
          <button
            type="submit"
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400"
          >
            <TrashIcon aria-hidden className="size-4" />
            Delete account
          </button>
        </form>
      </Card>
    </div>
  );
}
