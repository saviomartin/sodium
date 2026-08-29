import Image from "next/image";
import Link from "next/link";
import { signInWithGithubAction, signOutAction } from "@/lib/actions";
import { DISCORD_URL, ENTERPRISE_URL } from "@/lib/plan";
import { GithubSignInForm } from "./github-sign-in-form";
import { SectionLink } from "./section-link";
import { frameClass, secondaryButtonClass } from "./ui";
import { ArrowSquareOutIcon, GearIcon, SignOutIcon } from "./icons";

export interface HeaderAccount {
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * The header rides every page, signed in or out, so a link here has to resolve
 * everywhere. The home page carries these sections in both states, which is
 * why the anchors are absolute (`/#features`) rather than bare fragments: from
 * /repos/[id] or /settings they navigate home and land on the section.
 *
 * The links that leave the site close the row, marked `external` so they all
 * render the same way: a new tab, the arrow glyph, and the note screen readers
 * need to hear before they follow one.
 */
const NAV: readonly {
  href: string;
  label: string;
  external?: boolean;
}[] = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
  { href: DISCORD_URL, label: "Community", external: true },
  { href: ENTERPRISE_URL, label: "Enterprise", external: true },
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

        <nav className="hidden items-center gap-4 text-sm text-neutral-400 md:flex lg:gap-6">
          {NAV.map((item) =>
            item.external ? (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-1 ${NAV_LINK_CLASS}`}
              >
                {item.label}
                <ArrowSquareOutIcon
                  aria-hidden
                  className="size-3.5 text-faint"
                />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <SectionLink
                key={item.href}
                href={item.href}
                className={NAV_LINK_CLASS}
              >
                {item.label}
              </SectionLink>
            ),
          )}
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
