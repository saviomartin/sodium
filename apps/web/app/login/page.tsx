import { redirect } from "next/navigation";
import { signInWithGithubAction } from "@/lib/actions";
import { currentUserId } from "@/lib/supabase/server";
import { buttonClass } from "@/components/ui";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  if (await currentUserId())
    redirect(
      next && next.startsWith("/") && !next.startsWith("//")
        ? next
        : "/dashboard",
    );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-lg font-semibold text-balance">Sodium</h1>
        <p className="mt-1 text-sm text-neutral-500 text-pretty">
          Turn an existing site into a reviewed, verified, WebMCP-enabled
          application.
        </p>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <form action={signInWithGithubAction}>
          <input type="hidden" name="next" value={next ?? "/dashboard"} />
          <button type="submit" className={`${buttonClass} w-full`}>
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="size-4"
              fill="currentColor"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            Continue with GitHub
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700 text-pretty">
            {error}
          </p>
        )}
      </div>
      <p className="text-xs text-neutral-400 text-pretty">
        GitHub is the only sign-in method. Signing in identifies you;
        repository access is granted separately, per repository, by installing
        the GitHub App during onboarding. If you see &ldquo;provider is not
        enabled&rdquo;, finish the one-time GitHub OAuth setup in the README.
      </p>
    </main>
  );
}
