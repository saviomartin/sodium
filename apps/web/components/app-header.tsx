import Image from "next/image";
import Link from "next/link";
import { signInWithGithubAction, signOutAction } from "@/lib/actions";
import { GithubSignInForm } from "./github-sign-in-form";
import { frameClass, secondaryButtonClass } from "./ui";
import { ArrowSquareOutIcon, GearIcon, SignOutIcon } from "./icons";

export interface HeaderAccount {
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * The header rides every page, signed in or out, so a link here has to resolve
 * everywhere. Section anchors (#features, #pricing, #faq) do not — nothing in
 * the app declares those ids, and on /repos/[id] they would only append a dead
 * fragment. Re-add them here once the landing page actually carries the
 * sections, and point them at `/#features` so they work off the landing page.
 */
const ENTERPRISE_URL = "https://cal.com/team/result/enterprise";

function AccountAvatar({ account }: { account: HeaderAccount }) {
  if (account.avatarUrl) {
    return (
      <Image
        src={account.avatarUrl}
        alt=""
        width={32}
        height={32}
        className="size-8 rounded-full bg-white/[0.06] object-cover"
      />
    );
  }

  return (
    <span className="flex size-8 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-neutral-200">
      {(account.displayName || account.email || "S").charAt(0).toUpperCase()}
    </span>
  );
}

export function AppHeader({
  account,
  next = "/",
}: {
  account?: HeaderAccount | null;
  /** Where sign-in returns to, for the signed-out header button. */
  next?: string;
}) {
  return (
    <header className="bg-transparent font-mono">
      <div className="mx-auto grid h-14 w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex w-fit items-baseline gap-2 py-1.5 text-lg font-medium leading-none text-neutral-100"
        >
          <span>Sodium</span>
          <span className="inline-flex items-baseline gap-1.5 text-xs font-normal leading-none text-faint">
            by
            <Image
              src="/result-logo-white.svg"
              alt="Result"
              width={22}
              height={11}
              unoptimized
              className="h-[9px] w-auto opacity-80"
            />
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-neutral-400 md:flex">
          <a
            href={ENTERPRISE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 py-1 transition-colors hover:text-neutral-100"
          >
            Enterprise
            <ArrowSquareOutIcon aria-hidden className="size-3.5 text-faint" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </nav>

        <div className="col-start-3 flex items-center justify-end">
          {account ? (
            <details className="group relative">
              <summary
                aria-label="Open account menu"
                className="flex cursor-pointer list-none items-center rounded-full outline-none ring-blue-500 ring-offset-2 ring-offset-ink-950 hover:opacity-80 focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
              >
                <AccountAvatar account={account} />
              </summary>
              <div
                className={`absolute right-0 z-20 mt-2 w-64 overflow-hidden shadow-lg shadow-black/40 ${frameClass}`}
              >
                <div className="border-b border-white/[0.07] px-4 py-3">
                  <p className="truncate text-sm font-medium text-neutral-100">
                    {account.displayName || "GitHub account"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-neutral-400">
                    {account.email}
                  </p>
                </div>
                <div className="p-1.5 text-sm">
                  <Link
                    href="/settings"
                    className="flex items-center gap-2 rounded-md px-2.5 py-2 text-neutral-300 hover:bg-white/[0.06] hover:text-neutral-100"
                  >
                    <GearIcon aria-hidden className="size-4 text-faint" />
                    Settings
                  </Link>
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-neutral-300 hover:bg-white/[0.06] hover:text-neutral-100"
                    >
                      <SignOutIcon aria-hidden className="size-4 text-faint" />
                      Sign out
                    </button>
                  </form>
                </div>
              </div>
            </details>
          ) : (
            <GithubSignInForm
              action={signInWithGithubAction}
              next={next}
              className={secondaryButtonClass}
              label="Sign in"
              mark="github"
            />
          )}
        </div>
      </div>
    </header>
  );
}
