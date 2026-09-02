import { cn } from "./ui";
import { CheckCircleIcon, WarningCircleIcon } from "./icons";

/**
 * The one-off messages the home page has to deliver on arrival.
 *
 * Four flows redirect here to say something and have nowhere else to say it:
 * a failed OAuth callback, a failed magic link, a deleted account, and a
 * deleted project. They used to ride inside the signed-out sign-in panel,
 * which meant a signed-in user deleting a project was told nothing at all.
 * This renders in both states instead, above the page's own content.
 */
export interface HomeParams {
  deleted?: string;
  error?: string;
  next?: string;
}

const DELETED: Record<string, string> = {
  // `1` is the account flow's original value; keep it working for links and
  // bookmarks already in the wild.
  "1": "Your Sodium account and all of its data were deleted.",
  account: "Your Sodium account and all of its data were deleted.",
  project: "The project and every event recorded for it were deleted.",
};

export function HomeNotice({ params }: { params: HomeParams }) {
  const notice = params.error
    ? {
        role: "alert" as const,
        tone: "border-red-500/30 bg-red-500/10 text-red-300",
        icon: WarningCircleIcon,
        // An error from a provider is arbitrary text, so it is rendered as
        // content and never as markup.
        text: params.error,
      }
    : params.deleted
      ? {
          role: "status" as const,
          tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
          icon: CheckCircleIcon,
          text: DELETED[params.deleted] ?? "That item was deleted.",
        }
      : null;

  if (!notice) return null;
  const Icon = notice.icon;

  return (
    <p
      role={notice.role}
      className={cn(
        "mx-auto flex w-full max-w-5xl items-start gap-2 rounded-md border px-3.5 py-2.5 text-sm text-pretty",
        notice.tone,
      )}
    >
      <Icon aria-hidden weight="fill" className="mt-0.5 size-4 shrink-0" />
      {notice.text}
    </p>
  );
}
