import Image from "next/image";
import Link from "next/link";
import { signOutAction } from "@/lib/actions";

export interface HeaderAccount {
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

function AccountAvatar({ account }: { account: HeaderAccount }) {
  if (account.avatarUrl) {
    return (
      <Image
        src={account.avatarUrl}
        alt=""
        width={32}
        height={32}
        className="size-8 rounded-full bg-neutral-100 object-cover"
      />
    );
  }

  return (
    <span className="flex size-8 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
      {(account.displayName || account.email || "S").charAt(0).toUpperCase()}
    </span>
  );
}

export function AppHeader({ account }: { account?: HeaderAccount | null }) {
  return (
    <header className="border-b border-neutral-200/80 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold tracking-tight text-neutral-950"
        >
          <span className="size-2 rounded-full bg-blue-600" aria-hidden />
          Sodium
        </Link>

        {account && (
          <details className="group relative">
            <summary
              aria-label="Open account menu"
              className="flex cursor-pointer list-none rounded-full outline-none ring-blue-600 ring-offset-2 hover:opacity-80 focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
            >
              <AccountAvatar account={account} />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg shadow-neutral-900/10">
              <div className="border-b border-neutral-100 px-4 py-3">
                <p className="truncate text-sm font-medium text-neutral-900">
                  {account.displayName || "GitHub account"}
                </p>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {account.email}
                </p>
              </div>
              <div className="p-1.5 text-sm">
                <Link
                  href="/settings"
                  className="block rounded-md px-2.5 py-2 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950"
                >
                  Settings
                </Link>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="block w-full rounded-md px-2.5 py-2 text-left text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </details>
        )}
      </div>
    </header>
  );
}
