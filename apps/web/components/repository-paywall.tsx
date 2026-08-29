"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import type { BillingStatus } from "@/lib/billing-state";
import { billingStatusLabel } from "@/lib/billing-state";
import { trackProductEvent } from "@/lib/product-analytics";
import { notifyUpgradeRequired } from "@/lib/upgrade-toast";
import {
  openRepositoryBillingPortalAction,
  startRepositoryCheckoutAction,
} from "@/lib/actions";
import { ActionForm, SubmitButton } from "./action-form";
import { buttonClass, CtaArrow, frameClass, secondaryButtonClass } from "./ui";
import {
  CheckCircleIcon,
  CircleNotchIcon,
  InfoIcon,
  SealCheckIcon,
  SparkleIcon,
  XIcon,
} from "./icons";

const FEATURES = [
  "Enable and publish AI tools",
  "Automatic analysis on every push",
  "Edit generated tool definitions",
  "Manage versions and rollbacks",
  "Track tool usage and failures",
] as const;

interface PaywallContextValue {
  paid: boolean;
  /**
   * Gate for a subscriber-only action. Returns true when the caller may go
   * ahead; otherwise it says what the subscription unlocks and opens pricing,
   * and the caller stops.
   */
  requireSubscription: (action: string) => boolean;
  openPricing: () => void;
}

/**
 * Outside a provider nothing is gated — sections that never sit behind the
 * paywall keep working without one.
 */
const PaywallContext = createContext<PaywallContextValue>({
  paid: true,
  requireSubscription: () => true,
  openPricing: () => {},
});

export function usePaywall(): PaywallContextValue {
  return useContext(PaywallContext);
}

/**
 * Owns the single pricing dialog for a repository page, and the gate every
 * locked control calls. Controls stay live whether or not the repository is
 * paid for: pressing one explains the block and offers the subscription,
 * which teaches more than a dead button does.
 */
export function RepositoryPaywall({
  repositoryId,
  repositoryName,
  paid,
  checkoutState,
  children,
}: {
  repositoryId: string;
  repositoryName: string;
  paid: boolean;
  checkoutState?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Stripe confirms the subscription out of band, so a fresh return from
  // checkout polls briefly for the webhook to land.
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

  const value = useMemo<PaywallContextValue>(
    () => ({
      paid,
      openPricing: () => setOpen(true),
      requireSubscription: (action: string) => {
        if (paid) return true;
        notifyUpgradeRequired(action);
        setOpen(true);
        return false;
      },
    }),
    [paid],
  );

  return (
    <PaywallContext.Provider value={value}>
      {children}
      <PricingDialog
        repositoryName={repositoryName}
        repositoryId={repositoryId}
        open={open}
        onOpenChange={setOpen}
      />
    </PaywallContext.Provider>
  );
}

function PricingDialog({
  repositoryId,
  repositoryName,
  open,
  onOpenChange,
}: {
  repositoryId: string;
  repositoryName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (nextOpen) {
          trackProductEvent({
            name: "Pricing Viewed",
            properties: { priceUsd: 49 },
          });
        }
      }}
    >
      <Dialog.Portal>
        {/* Same scrim as the app's other modals, and `dvh` so a phone's
            retracting browser chrome cannot push the dialog off-screen. */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm" />
        <Dialog.Content
          className={`fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-6 shadow-xl focus:outline-none ${frameClass}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-lg font-medium text-balance">
                <SparkleIcon
                  aria-hidden
                  weight="fill"
                  className="size-5 shrink-0 text-blue-400"
                />
                Unlock AI capabilities
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-neutral-400 text-pretty">
                Activate every generated tool for {repositoryName}.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="rounded-md p-1 text-faint hover:bg-white/[0.06] hover:text-neutral-300 focus-visible:outline-2 focus-visible:outline-blue-500"
              aria-label="Close pricing"
            >
              <XIcon aria-hidden weight="bold" className="size-4" />
            </Dialog.Close>
          </div>

          <div className="mt-6 flex items-end gap-2 border-b border-white/[0.07] pb-5">
            <span className="text-4xl font-medium tabular-nums">$49</span>
            <span className="pb-1 text-sm text-neutral-400">
              / month / repository
            </span>
          </div>

          <ul className="my-5 space-y-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm">
                <CheckCircleIcon
                  aria-hidden
                  weight="fill"
                  className="mt-0.5 size-4 shrink-0 text-emerald-400"
                />
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
              Unlock AI capabilities for your site
              <CtaArrow />
            </SubmitButton>
          </ActionForm>
          <p className="mt-3 text-center text-xs text-faint text-pretty">
            Secure checkout by Stripe. Cancel anytime. This subscription unlocks
            only {repositoryName}.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The repository's billing affordance: manage an active subscription, or open
 * the pricing dialog the provider owns.
 */
export function RepositoryBillingControl({
  repositoryId,
  paid,
  status,
  cancelAtPeriodEnd,
  currentPeriodEnd,
  label = "Enable tools",
}: {
  repositoryId: string;
  paid: boolean;
  status: BillingStatus | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  label?: string;
}) {
  const { openPricing } = usePaywall();

  if (paid) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
          <SealCheckIcon aria-hidden weight="fill" className="size-4" />
          {billingStatusLabel(status)}
        </span>
        <ActionForm
          action={openRepositoryBillingPortalAction}
          submitEvent={{ name: "Billing Management Requested" }}
        >
          <input type="hidden" name="repositoryId" value={repositoryId} />
          <SubmitButton className={secondaryButtonClass} pendingText="Opening…">
            Manage billing
            <CtaArrow />
          </SubmitButton>
        </ActionForm>
        {cancelAtPeriodEnd && currentPeriodEnd ? (
          <span className="w-full text-right text-xs text-neutral-400">
            Access ends {new Date(currentPeriodEnd).toLocaleDateString()}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <button type="button" className={buttonClass} onClick={openPricing}>
      {label}
      <CtaArrow />
    </button>
  );
}

/**
 * A control that only subscribers can act on. It looks and behaves normally;
 * without a subscription the press explains the block and opens pricing.
 */
export function PaywalledButton({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: ReactNode;
}) {
  const { requireSubscription } = usePaywall();
  return (
    <button
      type="button"
      className={className}
      onClick={() => requireSubscription(action)}
    >
      {children}
    </button>
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
        className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300"
      >
        <SealCheckIcon aria-hidden weight="fill" className="size-4 shrink-0" />
        Subscription active. This repository’s tools are unlocked.
      </p>
    );
  }
  if (!paid && ["success", "pending"].includes(state ?? "")) {
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/15 px-3 py-2 text-sm text-blue-300"
      >
        <CircleNotchIcon
          aria-hidden
          weight="bold"
          className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
        />
        Payment received. Waiting for Stripe to confirm the subscription…
      </p>
    );
  }
  if (state === "canceled") {
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-neutral-400"
      >
        <InfoIcon aria-hidden weight="fill" className="size-4 shrink-0" />
        Checkout canceled. No charge was made.
      </p>
    );
  }
  return null;
}
