import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  applyCanonicalSubscription: vi.fn(),
  canonicalSubscription: vi.fn(),
  constructEvent: vi.fn(),
  ensurePaidRepositoryAnalysis: vi.fn(),
  kickAnalysisWorker: vi.fn(),
  retrieveSubscription: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("../lib/billing-state", () => ({
  hasPaidRepositoryAccess: (status: string) =>
    ["active", "trialing", "past_due"].includes(status),
}));
vi.mock("../lib/paid-analysis", () => ({
  ensurePaidRepositoryAnalysis: mocks.ensurePaidRepositoryAnalysis,
  kickAnalysisWorker: mocks.kickAnalysisWorker,
}));
vi.mock("../lib/stripe", () => ({
  applyCanonicalSubscription: mocks.applyCanonicalSubscription,
  canonicalSubscription: mocks.canonicalSubscription,
  stripeBillingConfig: () => ({
    priceId: "price_test",
    webhookSecret: "whsec_test",
  }),
  stripe: () => ({
    webhooks: { constructEvent: mocks.constructEvent },
    subscriptions: { retrieve: mocks.retrieveSubscription },
  }),
}));

import { POST } from "../app/api/webhooks/stripe/route";

const canonical = {
  repositoryId: "repo-1",
  orgId: "org-1",
  purchasedBy: "user-1",
  customerId: "cus_test",
  subscriptionId: "sub_test",
  priceId: "price_test",
  status: "active",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  livemode: false,
};

function request() {
  return new Request("https://sodium.result.dev/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "valid" },
    body: "signed-body",
  });
}

describe("Stripe billing webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.constructEvent.mockReturnValue({
      id: "evt_checkout",
      type: "checkout.session.completed",
      livemode: false,
      data: { object: { id: "cs_test", subscription: "sub_test" } },
    });
    mocks.retrieveSubscription.mockResolvedValue({ id: "sub_test" });
    mocks.canonicalSubscription.mockReturnValue(canonical);
    mocks.applyCanonicalSubscription.mockResolvedValue(true);
    mocks.ensurePaidRepositoryAnalysis.mockResolvedValue("run-1");
  });

  it("grants access and enqueues analysis in the same durable delivery", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      applied: true,
      analysisRunId: "run-1",
    });
    expect(mocks.ensurePaidRepositoryAnalysis).toHaveBeenCalledWith("repo-1");
    expect(mocks.after).toHaveBeenCalledOnce();
  });

  it("does not enqueue analysis when paid access is not granted", async () => {
    mocks.canonicalSubscription.mockReturnValue({
      ...canonical,
      status: "incomplete",
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.ensurePaidRepositoryAnalysis).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
