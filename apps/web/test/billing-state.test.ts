import { describe, expect, it } from "vitest";
import {
  billingStatusLabel,
  hasPaidRepositoryAccess,
} from "../lib/billing-state";

describe("repository billing state", () => {
  it.each(["active", "trialing", "past_due"] as const)(
    "keeps %s subscriptions enabled",
    (status) => expect(hasPaidRepositoryAccess(status)).toBe(true),
  );

  it.each([
    null,
    "none",
    "incomplete",
    "incomplete_expired",
    "canceled",
    "unpaid",
    "paused",
  ] as const)("keeps %s subscriptions locked", (status) => {
    expect(hasPaidRepositoryAccess(status)).toBe(false);
  });

  it("communicates the retry state without revoking access", () => {
    expect(billingStatusLabel("past_due")).toBe("Payment retrying");
  });
});
