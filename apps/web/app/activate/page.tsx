import { AppHeader } from "@/components/app-header";
import {
  CheckCircleIcon,
  LockKeyIcon,
  TerminalWindowIcon,
  WarningCircleIcon,
} from "@/components/icons";
import { buttonClass, CtaCheck, cn, frameClass } from "@/components/ui";
import { authorizeCliAction } from "@/lib/actions";
import { signInWithGithubAction, signInWithGoogleAction } from "@/lib/actions";
import { getAccountContext } from "@/lib/queries";
import { OAuthSignInForm } from "@/components/oauth-sign-in-form";
import { secondaryButtonClass } from "@/components/ui";

export const metadata = {
  title: "Activate CLI",
  robots: { index: false, follow: false },
};

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    complete?: string;
    error?: string;
    authError?: string;
  }>;
}) {
  const [account, params] = await Promise.all([
    getAccountContext(),
    searchParams,
  ]);
  const code = (params.code ?? "").toUpperCase();
  const next = `/activate?code=${encodeURIComponent(code)}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader account={account.userId ? account : undefined} next={next} />
      <main className="mx-auto flex w-full max-w-xl flex-1 px-4 py-12 sm:px-6 sm:py-20">
        <section className={cn(frameClass, "w-full self-start p-6 sm:p-8")}>
          {params.complete ? (
            <div className="text-center">
              <CheckCircleIcon
                aria-hidden
                weight="fill"
                className="mx-auto size-9 text-emerald-400"
              />
              <h1 className="mt-4 text-xl font-medium text-neutral-100">
                CLI authorized
              </h1>
              <p className="mt-2 text-sm leading-6 text-neutral-400 text-pretty">
                Return to your terminal. The command you were running continues
                automatically.
              </p>
            </div>
          ) : !account.userId ? (
            <>
              <LockKeyIcon aria-hidden className="size-7 text-blue-400" />
              <h1 className="mt-4 text-xl font-medium text-neutral-100">
                Sign in before authorizing
              </h1>
              <p className="mt-2 text-sm leading-6 text-neutral-400 text-pretty">
                Sign in to Sodium first. You will return here to review and
                approve the CLI code shown in your terminal.
              </p>
              <p className="my-6 rounded-md border border-white/10 bg-black/25 px-4 py-5 text-center font-mono text-3xl tracking-[0.18em] text-neutral-100 tabular-nums">
                {code || "NO CODE"}
              </p>
              {params.authError && params.authError !== "required" && (
                <p
                  role="alert"
                  className="mb-4 flex items-start gap-1.5 text-sm text-red-400 text-pretty"
                >
                  <WarningCircleIcon
                    aria-hidden
                    weight="fill"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  {params.authError}
                </p>
              )}
              <div className="grid gap-2">
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
              <p className="mt-4 text-xs leading-5 text-faint text-pretty">
                Signing in does not authorize the CLI. Approval remains a
                separate step on the next screen.
              </p>
            </>
          ) : (
            <>
              <TerminalWindowIcon
                aria-hidden
                className="size-7 text-blue-400"
              />
              <h1 className="mt-4 text-xl font-medium text-neutral-100">
                Authorize the Sodium CLI
              </h1>
              <p className="mt-2 text-sm leading-6 text-neutral-400 text-pretty">
                Confirm the code your terminal is showing. This creates a
                revocable CLI token for this machine. It grants no repository
                access.
              </p>
              {/* The code is the whole point of the page, so it gets the one
                  oversized measure on it: wide tracking, tabular figures, and
                  nothing competing for the line. */}
              <p className="my-6 rounded-md border border-white/10 bg-black/25 px-4 py-5 text-center font-mono text-3xl tracking-[0.18em] text-neutral-100 tabular-nums">
                {code || "NO CODE"}
              </p>
              {params.error && (
                <p
                  role="alert"
                  className="mb-4 flex items-start gap-1.5 text-sm text-red-400 text-pretty"
                >
                  <WarningCircleIcon
                    aria-hidden
                    weight="fill"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  This code is invalid, expired, or already used. Run the
                  command again to get a fresh one.
                </p>
              )}
              <form action={authorizeCliAction}>
                <input type="hidden" name="code" value={code} />
                <button
                  className={cn(buttonClass, "w-full py-2")}
                  type="submit"
                  disabled={!code}
                >
                  Authorize this device
                  <CtaCheck />
                </button>
              </form>
              <p className="mt-4 flex items-start gap-1.5 text-xs leading-5 text-faint text-pretty">
                <LockKeyIcon
                  aria-hidden
                  weight="fill"
                  className="mt-0.5 size-3.5 shrink-0"
                />
                Only authorize a code you can see in your own terminal.
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
