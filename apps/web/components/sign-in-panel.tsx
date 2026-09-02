import { GithubSignInForm } from "./github-sign-in-form";
import { signInWithGithubAction } from "@/lib/actions";
import { heroButtonClass } from "./ui";
import { CheckCircleIcon, GithubMarkIcon, WarningCircleIcon } from "./icons";

export function SignInPanel({
  params,
}: {
  params: { deleted?: string; error?: string; next?: string };
}) {
  return (
    <div className="frame flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
      <GithubMarkIcon aria-hidden className="size-9 text-white" />
      <h2 className="mt-4 text-lg font-medium text-neutral-100">
        Open your Sodium dashboard
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-neutral-400">
        GitHub is used only for identity. Sodium never requests repository
        access or reads your code.
      </p>
      <GithubSignInForm
        action={signInWithGithubAction}
        next={params.next ?? "/"}
        className={heroButtonClass}
        formClassName="mt-5"
        label="Continue with GitHub"
      />
      {params.error && (
        <p
          role="alert"
          className="mt-4 inline-flex items-center gap-2 text-sm text-red-400"
        >
          <WarningCircleIcon aria-hidden className="size-4" /> {params.error}
        </p>
      )}
      {params.deleted && (
        <p
          role="status"
          className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-400"
        >
          <CheckCircleIcon aria-hidden className="size-4" /> Your Sodium account
          was deleted.
        </p>
      )}
    </div>
  );
}
