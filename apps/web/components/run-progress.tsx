"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ANALYSIS_STAGES,
  RUN_PROGRESS_EVENT,
  runChannel,
  type RunProgressEvent,
} from "@sodium/contracts";
import { createClient } from "@/lib/supabase/client";
import { cn } from "./ui";
import {
  BroadcastIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  CircleNotchIcon,
  CubeIcon,
  FlaskIcon,
  GithubLogoIcon,
  MagnifyingGlassIcon,
  MinusCircleIcon,
  XCircleIcon,
} from "./icons";

const STAGE_LABELS: Record<string, string> = {
  clone: "Snapshot repository",
  static: "Static analysis",
  synthesize: "Tool synthesis",
  validate: "Validation & evals",
};

/** One glyph per stage, so a glance says which step of the pipeline is which. */
const STAGE_ICONS: Record<string, typeof CubeIcon> = {
  clone: GithubLogoIcon,
  static: MagnifyingGlassIcon,
  synthesize: CubeIcon,
  validate: FlaskIcon,
};

/** Status is carried by the leading mark rather than a bare colored dot. */
const STATUS_MARKS = {
  succeeded: { icon: CheckCircleIcon, className: "text-emerald-400" },
  skipped: { icon: MinusCircleIcon, className: "text-neutral-500" },
  running: { icon: CircleNotchIcon, className: "text-blue-400", spin: true },
  failed: { icon: XCircleIcon, className: "text-red-400" },
  pending: { icon: CircleDashedIcon, className: "text-white/25" },
} as const;

interface StageState {
  status?: string;
  message?: string;
}

/**
 * Realtime is the fast path; database reconciliation is the durable path.
 * Broadcasts can be missed while a tab sleeps or connects, so active runs
 * also refresh at a low frequency and whenever the tab regains focus.
 */
export function RunProgress({
  runId,
  initialStageStatuses,
  runStatus,
}: {
  runId: string;
  initialStageStatuses: Record<string, StageState>;
  runStatus: string;
}) {
  const router = useRouter();
  const [live, setLive] = useState<Record<string, StageState>>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (
      runStatus === "succeeded" ||
      runStatus === "failed" ||
      runStatus === "canceled"
    )
      return;
    const supabase = createClient();
    let disposed = false;

    const reconcile = () => {
      if (!disposed) router.refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") reconcile();
    };
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", onVisibility);
    const refreshTimer = setInterval(reconcile, 2500);

    const channel = supabase.channel(runChannel(runId), {
      config: { private: true },
    });
    void supabase.realtime.setAuth().then(() => {
      channel
        .on("broadcast", { event: RUN_PROGRESS_EVENT }, (message) => {
          const event = message.payload as RunProgressEvent;
          setLive((previous) => ({
            ...previous,
            [event.stage]: { status: event.status, message: event.message },
          }));
          reconcile();
        })
        .subscribe((status) => {
          if (!disposed) {
            setConnected(status === "SUBSCRIBED");
            if (status === "SUBSCRIBED") reconcile();
          }
        });
    });

    return () => {
      disposed = true;
      clearInterval(refreshTimer);
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [runId, runStatus, router]);

  const merged = { ...initialStageStatuses, ...live };
  const running = runStatus === "queued" || runStatus === "running";

  return (
    <ol className="space-y-2" aria-label="Analysis stages">
      {ANALYSIS_STAGES.map((stage) => {
        const state = merged[stage];
        const status = state?.status ?? "pending";
        const mark =
          STATUS_MARKS[status as keyof typeof STATUS_MARKS] ??
          STATUS_MARKS.pending;
        const StatusIcon = mark.icon;
        const StageIcon = STAGE_ICONS[stage] ?? CubeIcon;
        const spinning = "spin" in mark && mark.spin;
        return (
          <li key={stage} className="flex items-center gap-3 text-sm">
            <StatusIcon
              aria-hidden
              weight={spinning ? "bold" : "fill"}
              className={cn(
                "size-4 shrink-0",
                mark.className,
                spinning && "animate-spin motion-reduce:animate-none",
              )}
            />
            <span className="flex w-44 shrink-0 items-center gap-1.5">
              <StageIcon aria-hidden className="size-4 shrink-0 text-faint" />
              {STAGE_LABELS[stage]}
            </span>
            <span className="text-xs text-neutral-400 truncate">
              {status === "pending" ? "—" : status}
              {state?.message ? ` · ${state.message}` : ""}
            </span>
          </li>
        );
      })}
      {running && (
        <li
          className="flex items-center gap-1.5 pt-1 text-xs text-faint"
          aria-live="polite"
        >
          <BroadcastIcon
            aria-hidden
            className={cn(
              "size-3.5 shrink-0",
              connected
                ? "text-emerald-400"
                : "animate-pulse text-amber-300 motion-reduce:animate-none",
            )}
          />
          {connected
            ? "Live updates connected"
            : "Reconnecting live updates · database sync remains active"}
        </li>
      )}
    </ol>
  );
}
