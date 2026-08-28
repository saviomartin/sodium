"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/actions";
import { cn } from "./ui";

/**
 * Small client bridge for server actions: pending state on the submit button
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
}: {
  action: ServerAction;
  children: React.ReactNode;
  className?: string;
  successMessage?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state && !state.ok && state.error && (
        <p role="alert" className="mt-2 text-sm text-red-700 text-pretty">
          {state.error}
        </p>
      )}
      {state?.ok && (state.error || successMessage) && (
        <p role="status" className="mt-2 text-sm text-green-700 text-pretty">
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
      {pending ? pendingText : children}
    </button>
  );
}
