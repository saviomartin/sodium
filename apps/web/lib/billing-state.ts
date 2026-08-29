import type { Database } from "@sodium/contracts/database";

export type BillingStatus =
  Database["public"]["Enums"]["billing_subscription_status"];

export const PAID_BILLING_STATUSES = [
  "active",
  "trialing",
  "past_due",
] as const satisfies readonly BillingStatus[];

/** Stripe retries past-due invoices before access is revoked. */
export function hasPaidRepositoryAccess(
  status: BillingStatus | null | undefined,
): boolean {
  return status != null && PAID_BILLING_STATUSES.includes(status as never);
}

export function billingStatusLabel(status: BillingStatus | null | undefined) {
  switch (status) {
    case "active":
    case "trialing":
      return "Active";
    case "past_due":
      return "Payment retrying";
    case "canceled":
      return "Canceled";
    case "unpaid":
      return "Payment failed";
    case "incomplete":
      return "Checkout incomplete";
    case "paused":
      return "Paused";
    default:
      return "Not subscribed";
  }
}
