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

const STAGE_LABELS: Record<string, string> = {
  clone: "Snapshot repository",
  static: "Static analysis",
  synthesize: "Tool synthesis",
  validate: "Validation & evals",
};

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
        return (
          <li key={stage} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full",
                status === "succeeded" && "bg-green-500",
                status === "skipped" && "bg-neutral-300",
                status === "running" && "bg-blue-500",
                status === "failed" && "bg-red-500",
                status === "pending" && "bg-neutral-200",
              )}
            />
            <span className="w-44 shrink-0">{STAGE_LABELS[stage]}</span>
            <span className="text-xs text-neutral-500 truncate">
              {status === "pending" ? "—" : status}
              {state?.message ? ` · ${state.message}` : ""}
            </span>
          </li>
        );
      })}
      {running && (
        <li className="pt-1 text-xs text-neutral-400" aria-live="polite">
          {connected
            ? "Live updates connected"
            : "Reconnecting live updates · database sync remains active"}
        </li>
      )}
    </ol>
  );
}
