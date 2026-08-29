"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/actions";
import { buttonClass, dangerButtonClass, secondaryButtonClass } from "./ui";
import { useRepositorySettingsState } from "./repository-settings-state";

type ServerAction = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

function ConfirmSubmit({
  label,
  danger,
  disabled,
}: {
  label: string;
  danger: boolean;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={danger ? dangerButtonClass : buttonClass}
    >
      {pending ? "Working…" : label}
    </button>
  );
}

/**
 * Consequential actions (publish, rollback) go through an explicit
 * AlertDialog confirmation with the effect spelled out. The dialog stays
 * open until the server action resolves (Radix's AlertDialog.Action would
 * close — and unmount the form — immediately), so errors render right where
 * the action happens.
 */
export function ConfirmAction({
  action,
  trigger,
  title,
  description,
  confirmLabel,
  danger = false,
  triggerVariant = "primary",
  blockWhileEdits = false,
  fields,
}: {
  action: ServerAction;
  trigger: string;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  triggerVariant?: "primary" | "secondary";
  blockWhileEdits?: boolean;
  fields: Record<string, string>;
}) {
  const { editPending } = useRepositorySettingsState();
  const blocked = blockWhileEdits && editPending;
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    null,
  );

  return (
    <div>
      <AlertDialog.Root open={open} onOpenChange={setOpen}>
        <AlertDialog.Trigger
          disabled={blocked}
          className={
            danger
              ? dangerButtonClass
              : triggerVariant === "secondary"
                ? secondaryButtonClass
                : buttonClass
          }
        >
          {trigger}
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-40 bg-neutral-900/40" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-200 bg-white p-5 shadow-lg">
            <AlertDialog.Title className="text-sm font-semibold text-balance">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-neutral-600 text-pretty">
              {description}
            </AlertDialog.Description>
            <form action={formAction} className="mt-4">
              {Object.entries(fields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              {state && !state.ok && state.error && (
                <p
                  role="alert"
                  className="mb-3 text-sm text-red-700 text-pretty"
                >
                  {state.error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <AlertDialog.Cancel
                  className={secondaryButtonClass}
                  type="button"
                >
                  Cancel
                </AlertDialog.Cancel>
                <ConfirmSubmit
                  label={confirmLabel}
                  danger={danger}
                  disabled={blocked}
                />
              </div>
            </form>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {state?.ok && (
        <p role="status" className="mt-2 text-sm text-green-700">
          Done.
        </p>
      )}
    </div>
  );
}
