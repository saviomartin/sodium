import Image from "next/image";
import Link from "next/link";
import { signInWithGithubAction, signOutAction } from "@/lib/actions";
import { GithubSignInForm } from "./github-sign-in-form";
import { secondaryButtonClass } from "./ui";
import { GearIcon, SignOutIcon } from "./icons";

export interface HeaderAccount {
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export function AppHeader({
  account,
  next = "/",
}: {
  account?: HeaderAccount | null;
  next?: string;
}) {
  return (
    <header className="border-b border-white/[0.06] bg-ink-950/85 font-mono backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-baseline gap-2 py-2 text-lg font-medium text-neutral-100"
        >
          Sodium
          <span className="text-[10px] font-normal uppercase tracking-[0.18em] text-neutral-600">
            WebMCP
          </span>
        </Link>
        {account ? (
          <details className="group relative">
            <summary
              aria-label="Open account menu"
              className="flex cursor-pointer list-none items-center rounded-full outline-none ring-blue-500 ring-offset-2 ring-offset-ink-950 focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
            >
              {account.avatarUrl ? (
                <Image
                  src={account.avatarUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="size-8 rounded-full bg-white/[0.06] object-cover"
                />
              ) : (
                <span className="flex size-8 items-center justify-center rounded-full bg-white/10 text-xs">
                  {(account.displayName ||
                    account.email ||
                    "S")[0]?.toUpperCase()}
                </span>
              )}
            </summary>
            <div className="frame absolute right-0 z-20 mt-2 w-64 overflow-hidden shadow-xl shadow-black/40">
              <div className="border-b border-white/[0.07] px-4 py-3">
                <p className="truncate text-sm font-medium text-neutral-100">
                  {account.displayName || "Account"}
                </p>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {account.email}
                </p>
              </div>
              <div className="p-1.5 text-sm">
                <Link
                  href="/settings"
                  className="flex items-center gap-2 rounded-md px-2.5 py-2 text-neutral-300 hover:bg-white/[0.06]"
                >
                  <GearIcon aria-hidden className="size-4" /> Settings
                </Link>
                <form action={signOutAction}>
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-neutral-300 hover:bg-white/[0.06]"
                    type="submit"
                  >
                    <SignOutIcon aria-hidden className="size-4" /> Sign out
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
    </header>
  );
}
