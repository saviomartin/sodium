import type { CanonicalSubscription } from "../lib/stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/env", () => ({
  env: {
    STRIPE_MODE: "test",
    STRIPE_REPOSITORY_PRICE_ID: "price_test",
    STRIPE_PORTAL_CONFIGURATION_ID: "bpc_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_SECRET_KEY: "sk_test_value",
  },
  siteUrl: () => "https://sodium.result.dev",
}));
vi.mock("../lib/supabase/service", () => ({
  createServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import { applyCanonicalSubscription } from "../lib/stripe";

const subscription: CanonicalSubscription = {
  repositoryId: "repo_deleted",
  orgId: "org_deleted",
  purchasedBy: null,
  customerId: "cus_test",
  subscriptionId: "sub_test",
  priceId: "price_test",
  status: "canceled",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  livemode: false,
};

describe("applyCanonicalSubscription", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.rpc.mockReset();
  });

  it("acknowledges a cancellation after its repository was deleted", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    mocks.from.mockReturnValue({ select });

    await expect(
      applyCanonicalSubscription(
        {
          id: "evt_deleted",
          type: "customer.subscription.deleted",
          livemode: false,
        },
        subscription,
        null,
      ),
    ).resolves.toBe(false);
    expect(mocks.from).toHaveBeenCalledWith("repositories");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
