import { AppHeader } from "@/components/app-header";
import { GithubSignInForm } from "@/components/github-sign-in-form";
import { signInWithGithubAction } from "@/lib/actions";
import { frameClass, heroButtonClass } from "@/components/ui";
import {
  CheckCircleIcon,
  GithubLogoIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@/components/icons";

/** Signed-out home. */
export function Landing({
  params,
}: {
  params: { deleted?: string; error?: string; next?: string };
}) {
  const notice = params.error
    ? {
        role: "alert" as const,
        tone: "text-red-400",
        text: params.error,
        icon: WarningCircleIcon,
      }
    : params.deleted
      ? {
          role: "status" as const,
          tone: "text-emerald-400",
          text: "Your Sodium account and its data were deleted.",
          icon: CheckCircleIcon,
        }
      : null;
  const NoticeIcon = notice?.icon;

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader next={params.next ?? "/"} />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-16 sm:px-6 sm:py-24">
        <header className="max-w-3xl">
          <p className="text-xs font-medium uppercase text-neutral-400">
            Website tools, made visible
          </p>
          <h1 className="mt-5 text-4xl font-medium text-neutral-100 text-balance sm:text-5xl">
            Turn your website into tools ChatGPT can use.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-300 text-pretty sm:text-lg">
            Connect a GitHub repository. Sodium finds useful actions, lets you
            approve them, and gives you one script to add to your site.
          </p>
        </header>

        <section className={`mt-10 sm:mt-12 ${frameClass}`}>
          <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-neutral-100 text-ink-950">
              <GithubLogoIcon aria-hidden weight="fill" className="size-6" />
            </div>
            <h2 className="mt-4 text-lg font-medium text-neutral-100">
              Start with GitHub
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-neutral-400 text-pretty">
              One GitHub sign-in gives Sodium your email and repository
              access, then loads your repositories on the next screen.
            </p>
            <GithubSignInForm
              action={signInWithGithubAction}
              next={params.next ?? "/"}
              className={heroButtonClass}
              formClassName="mt-5"
            />
            {notice && NoticeIcon && (
              <p
                role={notice.role}
                className={`mt-4 inline-flex items-center gap-1.5 text-sm ${notice.tone}`}
              >
                <NoticeIcon
                  aria-hidden
                  weight="fill"
                  className="size-4 shrink-0"
                />
                {notice.text}
              </p>
            )}
          </div>
        </section>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-neutral-400">
          <ShieldCheckIcon
            aria-hidden
            weight="fill"
            className="size-4 shrink-0 text-faint"
          />
          Source is analyzed as data. Sodium never executes repository code.
        </p>
      </main>
    </div>
  );
}
