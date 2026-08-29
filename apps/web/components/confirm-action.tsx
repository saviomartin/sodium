"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/actions";
import {
  trackProductEvent,
  type ProductAnalyticsEvent,
} from "@/lib/product-analytics";
import {
  buttonClass,
  CtaArrow,
  dangerButtonClass,
  frameClass,
  secondaryButtonClass,
} from "./ui";
import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  TrashIcon,
  WarningIcon,
  WarningCircleIcon,
  XIcon,
} from "./icons";
import { usePaywall } from "./repository-paywall";
import { useRepositorySettingsState } from "./repository-settings-state";

type ServerAction = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

/**
 * Named rather than passed as a component: this is a client boundary, and a
 * server page cannot hand a component reference across it.
 *
 * Only destructive triggers take one. A trigger carries either a leading glyph
 * or a trailing arrow, never both, and a forward arrow is the wrong promise on
 * an action that deletes or rewinds.
 */
const TRIGGER_ICONS = {
  delete: TrashIcon,
  rollback: ArrowCounterClockwiseIcon,
} as const;

export type ConfirmTriggerIcon = keyof typeof TRIGGER_ICONS;

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
      {pending ? (
        <>
          <CircleNotchIcon
            aria-hidden
            weight="bold"
            className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
          />
          Working…
        </>
      ) : (
        <>
          <CheckIcon aria-hidden weight="bold" className="size-4 shrink-0" />
          {label}
        </>
      )}
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
  triggerIcon,
  title,
  description,
  confirmLabel,
  danger = false,
  triggerVariant = "primary",
  blockWhileEdits = false,
  subscriberAction,
  fields,
  successEvent,
}: {
  action: ServerAction;
  trigger: string;
  triggerIcon?: ConfirmTriggerIcon;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  triggerVariant?: "primary" | "secondary";
  blockWhileEdits?: boolean;
  /** What this action does, for the prompt shown to non-subscribers. */
  subscriberAction?: string;
  fields: Record<string, string>;
  successEvent?: ProductAnalyticsEvent;
}) {
  const { editPending } = useRepositorySettingsState();
  const { requireSubscription } = usePaywall();
  const blocked = blockWhileEdits && editPending;
  const [open, setOpen] = useState(false);
  const TriggerIcon = triggerIcon ? TRIGGER_ICONS[triggerIcon] : null;
  const [state, formAction] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.ok) {
        if (successEvent) trackProductEvent(successEvent);
        setOpen(false);
      }
      return result;
    },
    null,
  );

  return (
    <div>
      <AlertDialog.Root open={open} onOpenChange={setOpen}>
        <AlertDialog.Trigger
          disabled={blocked}
          onClick={(event) => {
            // Non-subscribers keep a live trigger; it opens pricing instead.
            if (subscriberAction && !requireSubscription(subscriberAction)) {
              event.preventDefault();
            }
          }}
          className={
            danger
              ? dangerButtonClass
              : triggerVariant === "secondary"
                ? secondaryButtonClass
                : buttonClass
          }
        >
          {danger && TriggerIcon ? (
            <TriggerIcon aria-hidden className="size-4 shrink-0" />
          ) : null}
          {trigger}
          {!danger && <CtaArrow />}
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="modal-fade fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm" />
          <AlertDialog.Content
            className={`modal-fade fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 shadow-lg shadow-black/40 ${frameClass}`}
          >
            <AlertDialog.Title className="flex items-center gap-2 text-sm font-medium text-balance">
              <WarningIcon
                aria-hidden
                weight="fill"
                className={`size-4 shrink-0 ${danger ? "text-red-400" : "text-amber-300"}`}
              />
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-neutral-400 text-pretty">
              {description}
            </AlertDialog.Description>
            <form action={formAction} className="mt-4">
              {Object.entries(fields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              {state && !state.ok && state.error && (
                <p
                  role="alert"
                  className="mb-3 flex items-start gap-1.5 text-sm text-red-400 text-pretty"
                >
                  <WarningCircleIcon
                    aria-hidden
                    weight="fill"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  {state.error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <AlertDialog.Cancel
                  className={secondaryButtonClass}
                  type="button"
                >
                  <XIcon
                    aria-hidden
                    weight="bold"
                    className="size-4 shrink-0"
                  />
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
        <p
          role="status"
          className="mt-2 inline-flex items-center gap-1.5 text-sm text-emerald-400"
        >
          <CheckCircleIcon
            aria-hidden
            weight="fill"
            className="size-4 shrink-0"
          />
          Done.
        </p>
      )}
    </div>
  );
}
