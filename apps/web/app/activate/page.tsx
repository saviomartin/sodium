import { AppHeader } from "@/components/app-header";
import {
  CheckCircleIcon,
  TerminalWindowIcon,
  WarningCircleIcon,
} from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { authorizeCliAction } from "@/lib/actions";
import { getAccountContext } from "@/lib/queries";

export const metadata = {
  title: "Activate CLI",
  robots: { index: false, follow: false },
};

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; complete?: string; error?: string }>;
}) {
  const [account, params] = await Promise.all([
    getAccountContext(),
    searchParams,
  ]);
  const code = (params.code ?? "").toUpperCase();
  return (
    <div className="min-h-dvh">
      <AppHeader
        account={account.userId ? account : undefined}
        next={`/activate?code=${encodeURIComponent(code)}`}
      />
      <main className="mx-auto flex w-full max-w-xl px-4 py-16 sm:px-6 sm:py-24">
        <section className="frame w-full p-6 sm:p-8">
          {params.complete ? (
            <div className="text-center">
              <CheckCircleIcon
                aria-hidden
                className="mx-auto size-9 text-emerald-400"
              />
              <h1 className="mt-4 text-2xl font-medium text-neutral-100">
                CLI authorized
              </h1>
              <p className="mt-2 text-sm text-neutral-400">
                Return to your terminal. Initialization will continue
                automatically.
              </p>
            </div>
          ) : (
            <>
              <TerminalWindowIcon
                aria-hidden
                className="size-7 text-blue-400"
              />
              <h1 className="mt-4 text-2xl font-medium text-neutral-100">
                Authorize Sodium CLI
              </h1>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                Confirm the code shown in your terminal. This creates a
                revocable CLI token; it does not grant repository access.
              </p>
              <div className="my-6 rounded-md border border-white/10 bg-black/20 px-4 py-5 text-center font-mono text-3xl tracking-[0.18em] text-neutral-100">
                {code || "NO CODE"}
              </div>
              {params.error && (
                <p className="mb-4 flex items-center gap-2 text-sm text-red-300">
                  <WarningCircleIcon aria-hidden className="size-4" />
                  This code is invalid, expired, or already used.
                </p>
              )}
              <form action={authorizeCliAction}>
                <input type="hidden" name="code" value={code} />
                <button
                  className={`${buttonClass} w-full`}
                  type="submit"
                  disabled={!code}
                >
                  Authorize this device
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
