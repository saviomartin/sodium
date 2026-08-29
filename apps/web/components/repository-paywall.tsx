"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import type { BillingStatus } from "@/lib/billing-state";
import { billingStatusLabel } from "@/lib/billing-state";
import { trackProductEvent } from "@/lib/product-analytics";
import {
  openRepositoryBillingPortalAction,
  startRepositoryCheckoutAction,
} from "@/lib/actions";
import { ActionForm, SubmitButton } from "./action-form";
import { buttonClass, secondaryButtonClass } from "./ui";

const FEATURES = [
  "Enable and publish AI tools",
  "Automatic analysis on every push",
  "Edit generated tool definitions",
  "Manage versions and rollbacks",
  "Track tool usage and failures",
] as const;

export function RepositoryBillingControl({
  repositoryId,
  repositoryName,
  paid,
  status,
  cancelAtPeriodEnd,
  currentPeriodEnd,
  checkoutState,
  label = "Enable tools",
}: {
  repositoryId: string;
  repositoryName: string;
  paid: boolean;
  status: BillingStatus | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  checkoutState?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (paid || !["success", "pending"].includes(checkoutState ?? "")) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= 20) window.clearInterval(timer);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [checkoutState, paid, router]);

  if (paid) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
          <span className="size-1.5 rounded-full bg-green-500" aria-hidden />
          {billingStatusLabel(status)}
        </span>
        <ActionForm
          action={openRepositoryBillingPortalAction}
          submitEvent={{ name: "Billing Management Requested" }}
        >
          <input type="hidden" name="repositoryId" value={repositoryId} />
          <SubmitButton className={secondaryButtonClass} pendingText="Opening…">
            Manage billing
          </SubmitButton>
        </ActionForm>
        {cancelAtPeriodEnd && currentPeriodEnd ? (
          <span className="w-full text-right text-xs text-neutral-500">
            Access ends {new Date(currentPeriodEnd).toLocaleDateString()}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          trackProductEvent({
            name: "Pricing Viewed",
            properties: { priceUsd: 49 },
          });
        }
      }}
    >
      <Dialog.Trigger asChild>
        <button type="button" className={buttonClass}>
          {label}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold tracking-tight text-balance">
                Unlock AI capabilities
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-neutral-500 text-pretty">
                Activate every generated tool for {repositoryName}.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-2 focus-visible:outline-blue-600"
              aria-label="Close pricing"
            >
              <span aria-hidden className="text-xl leading-none">
                ×
              </span>
            </Dialog.Close>
          </div>

          <div className="mt-6 flex items-end gap-2 border-b border-neutral-100 pb-5">
            <span className="text-4xl font-semibold tracking-tight tabular-nums">
              $49
            </span>
            <span className="pb-1 text-sm text-neutral-500">
              / month / repository
            </span>
          </div>

          <ul className="my-5 space-y-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm">
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m4 10 4 4 8-9" />
                </svg>
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <ActionForm
            action={startRepositoryCheckoutAction}
            submitEvent={{
              name: "Checkout Initiated",
              properties: { priceUsd: 49 },
            }}
          >
            <input type="hidden" name="repositoryId" value={repositoryId} />
            <SubmitButton
              className={`${buttonClass} min-h-10 w-full`}
              pendingText="Opening secure checkout…"
            >
              Unlock AI capabilities for your site →
            </SubmitButton>
          </ActionForm>
          <p className="mt-3 text-center text-xs text-neutral-400 text-pretty">
            Secure checkout by Stripe. Cancel anytime. This subscription unlocks
            only {repositoryName}.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function CheckoutStatusNotice({
  state,
  paid,
}: {
  state?: string;
  paid: boolean;
}) {
  if (paid && state === "success") {
    return (
      <p
        role="status"
        className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
      >
        Subscription active. This repository’s tools are unlocked.
      </p>
    );
  }
  if (!paid && ["success", "pending"].includes(state ?? "")) {
    return (
      <p
        role="status"
        className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800"
      >
        Payment received. Waiting for Stripe to confirm the subscription…
      </p>
    );
  }
  if (state === "canceled") {
    return (
      <p
        role="status"
        className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600"
      >
        Checkout canceled. No charge was made.
      </p>
    );
  }
  return null;
}
