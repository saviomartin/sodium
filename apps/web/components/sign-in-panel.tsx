import { GithubSignInForm } from "@/components/github-sign-in-form";
import { signInWithGithubAction } from "@/lib/actions";
import { heroButtonClass } from "@/components/ui";
import {
  CheckCircleIcon,
  GithubMarkIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@/components/icons";

/**
 * The signed-out contents of the home page's one changing panel. Signing in
 * swaps this for the repository list; nothing else on the page moves.
 */
export function SignInPanel({
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
    <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
      <GithubMarkIcon aria-hidden className="size-10 text-white" />
      <h2 className="mt-4 text-lg font-medium text-neutral-100">
        Connect your repository
      </h2>
      <GithubSignInForm
        action={signInWithGithubAction}
        next={params.next ?? "/"}
        className={heroButtonClass}
        formClassName="mt-5"
        label="Login with GitHub"
      />
      <p className="mt-4 max-w-md text-xs leading-5 text-neutral-500 text-pretty">
        {/* Inline, not a flex row: the shield leads the first line and the
            text wraps under itself rather than around a gutter. */}
        <ShieldCheckIcon
          aria-hidden
          weight="fill"
          className="mr-1.5 inline size-3.5 align-[-0.15em] text-neutral-400"
        />
        Sodium analyzes your repository to automatically generate the required
        tool calls. It&apos;s secure and never runs your code or pushes changes.
      </p>
      {notice && NoticeIcon && (
        <p
          role={notice.role}
          className={`mt-4 inline-flex items-center gap-1.5 text-sm ${notice.tone}`}
        >
          <NoticeIcon aria-hidden weight="fill" className="size-4 shrink-0" />
          {notice.text}
        </p>
      )}
    </div>
  );
}
