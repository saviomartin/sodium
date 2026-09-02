import { deleteAccountAction, signOutAction } from "@/lib/actions";
import {
  Card,
  Field,
  cn,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui";
import { getAccountContext } from "@/lib/queries";
import {
  GearIcon,
  GithubMarkIcon,
  KeyIcon,
  SignOutIcon,
  TrashIcon,
} from "@/components/icons";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { email, displayName } = await getAccountContext();
  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-10">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-medium">
          <GearIcon aria-hidden className="size-6 text-faint" />
          Settings
        </h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-neutral-400">
          <GithubMarkIcon aria-hidden className="size-3.5 shrink-0 text-faint" />
          Signed in as {displayName ? `${displayName} · ${email}` : email}.
        </p>
      </header>

      <Card title="Session" icon={KeyIcon}>
        <p className="mb-4 text-sm leading-6 text-neutral-400 text-pretty">
          Signing out ends this browser session. CLI tokens you authorized stay
          valid until you delete the account.
        </p>
        <form action={signOutAction}>
          <button className={secondaryButtonClass} type="submit">
            <SignOutIcon aria-hidden className="size-4 shrink-0" />
            Sign out
          </button>
        </form>
      </Card>

      <Card title="Delete account" icon={TrashIcon}>
        <p className="mb-4 text-sm leading-6 text-neutral-400 text-pretty">
          Deletes your projects, deployment history, CLI tokens, aggregate
          events, and your Sodium identity. It does not touch your application
          repository.
        </p>
        <form action={deleteAccountAction} className="space-y-4">
          <Field
            label={
              <>
                Type <strong className="text-neutral-200">delete</strong> to
                confirm
              </>
            }
          >
            <input
              name="confirmation"
              autoComplete="off"
              className={cn(inputClass, "py-2 focus:border-red-400")}
            />
          </Field>
          <button
            type="submit"
            className="group inline-flex items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
          >
            <TrashIcon aria-hidden className="size-4 shrink-0" />
            Delete account
          </button>
        </form>
      </Card>
    </div>
  );
}
