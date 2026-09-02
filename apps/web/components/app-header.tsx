import Image from "next/image";
import Link from "next/link";
import {
  signInWithGithubAction,
  signInWithGoogleAction,
  signOutAction,
} from "@/lib/actions";
import { OAuthSignInForm } from "./oauth-sign-in-form";
import { SectionLink } from "./section-link";
import { cn, frameClass, secondaryButtonClass } from "./ui";
import { CubeIcon, GearIcon, SignOutIcon } from "./icons";

export interface HeaderAccount {
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * The header rides every page, signed in or out, so a link here has to resolve
 * everywhere. The home page carries these sections in both states, which is
 * why the anchors are absolute (`/#features`) rather than bare fragments: from
 * /projects/[id] or /settings they navigate home and land on the section.
 */
const NAV: readonly { href: string; label: string }[] = [
  { href: "/#features", label: "Features" },
  { href: "/#faq", label: "FAQ" },
];

const NAV_LINK_CLASS = "py-1 transition-colors hover:text-neutral-100";

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
      <div className="mx-auto grid h-14 w-full max-w-6xl grid-cols-[1fr_auto] items-center gap-4 px-4 sm:px-6 md:grid-cols-[1fr_auto_1fr]">
        <Link
          href="/"
          className="inline-flex w-fit items-baseline gap-2 py-1.5 text-lg leading-none font-medium text-neutral-100"
        >
          <span>Sodium</span>
          <span className="inline-flex items-baseline gap-1.5 text-xs leading-none font-normal text-faint">
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

        <nav className="hidden items-center gap-4 text-sm text-neutral-400 md:flex lg:gap-6">
          {account && (
            <Link
              href="/"
              className={cn(NAV_LINK_CLASS, "inline-flex items-center gap-1.5")}
            >
              <CubeIcon aria-hidden className="size-3.5 text-faint" />
              Projects
            </Link>
          )}
          {NAV.map((item) => (
            <SectionLink
              key={item.href}
              href={item.href}
              className={NAV_LINK_CLASS}
            >
              {item.label}
            </SectionLink>
          ))}
        </nav>

        <div className="flex items-center justify-end md:col-start-3">
          {account ? (
            <details className="group relative">
              <summary
                aria-label="Open account menu"
                className="flex cursor-pointer list-none items-center rounded-full outline-none ring-blue-500 ring-offset-2 ring-offset-ink-950 hover:opacity-80 focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
              >
                <AccountAvatar account={account} />
              </summary>
              <div
                className={cn(
                  frameClass,
                  "absolute right-0 z-20 mt-2 w-64 overflow-hidden shadow-lg shadow-black/40",
                )}
              >
                <div className="border-b border-white/[0.07] px-4 py-3">
                  <p className="truncate text-sm font-medium text-neutral-100">
                    {account.displayName || "Account"}
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
            <details className="group relative">
              <summary
                className={cn(
                  secondaryButtonClass,
                  "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
                )}
              >
                Sign in
              </summary>
              <div
                className={cn(
                  frameClass,
                  "absolute right-0 z-20 mt-2 w-72 overflow-hidden shadow-lg shadow-black/40",
                )}
              >
                <div className="border-b border-white/[0.07] px-4 py-3">
                  <p className="text-sm font-medium text-neutral-100">
                    Sign in to Sodium
                  </p>
                  <p className="mt-1 text-xs leading-5 text-neutral-400 text-pretty">
                    Choose the account you want to continue with.
                  </p>
                </div>
                <div className="grid gap-2 p-3">
                  <OAuthSignInForm
                    action={signInWithGoogleAction}
                    next={next}
                    provider="google"
                    className={cn(secondaryButtonClass, "w-full")}
                  />
                  <OAuthSignInForm
                    action={signInWithGithubAction}
                    next={next}
                    provider="github"
                    className={cn(secondaryButtonClass, "w-full")}
                  />
                </div>
              </div>
            </details>
          )}
        </div>
      </div>
    </header>
  );
}
