"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/actions";
import {
  trackProductEvent,
  type ProductAnalyticsEvent,
} from "@/lib/product-analytics";
import { cn } from "./ui";
import {
  CheckCircleIcon,
  CircleNotchIcon,
  WarningCircleIcon,
} from "./icons";

/**
 * Small client wrapper for server actions: pending state on the submit button
 * and errors rendered next to where the action happens.
 */

type ServerAction = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

export function ActionForm({
  action,
  children,
  className,
  successMessage,
  submitEvent,
}: {
  action: ServerAction;
  children: React.ReactNode;
  className?: string;
  successMessage?: string;
  submitEvent?: ProductAnalyticsEvent;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={() => {
        if (submitEvent) trackProductEvent(submitEvent);
      }}
    >
      {children}
      {state && !state.ok && state.error && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 text-sm text-red-400 text-pretty"
        >
          <WarningCircleIcon
            aria-hidden
            weight="fill"
            className="mt-0.5 size-4 shrink-0"
          />
          {state.error}
        </p>
      )}
      {state?.ok && (state.error || successMessage) && (
        <p
          role="status"
          className="mt-2 flex items-start gap-1.5 text-sm text-emerald-400 text-pretty"
        >
          <CheckCircleIcon
            aria-hidden
            weight="fill"
            className="mt-0.5 size-4 shrink-0"
          />
          {state.error ?? successMessage}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  className,
  pendingText = "Working…",
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(className)}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <CircleNotchIcon
            aria-hidden
            weight="bold"
            className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
          />
          {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}
