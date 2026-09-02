import { describe, expect, it } from "vitest";
import { UsageEventSchema } from "../lib/usage-event-schema";

const base = {
  projectId: "prj_abcdefghijkl",
  key: `sod_pk_${"a".repeat(32)}`,
  sdkVersion: "0.1.0",
  ts: Date.now(),
};

describe("UsageEventSchema", () => {
  it("accepts a privacy-safe answer-engine referral", () => {
    expect(
      UsageEventSchema.safeParse({
        ...base,
        event: "answer_engine_referral",
        sessionId: "11111111-1111-4111-8111-111111111111",
        answerEngine: "ChatGPT",
        attributionMethod: "referrer",
      }).success,
    ).toBe(true);
  });

  it("requires an anonymous session and attribution for referrals", () => {
    expect(
      UsageEventSchema.safeParse({
        ...base,
        event: "answer_engine_referral",
      }).success,
    ).toBe(false);
  });

  it("rejects attribution on unrelated events", () => {
    expect(
      UsageEventSchema.safeParse({
        ...base,
        event: "sdk_ready",
        answerEngine: "Claude",
        attributionMethod: "campaign",
      }).success,
    ).toBe(false);
  });

  it("rejects raw referrer URLs and other undeclared data", () => {
    expect(
      UsageEventSchema.safeParse({
        ...base,
        event: "answer_engine_referral",
        sessionId: "11111111-1111-4111-8111-111111111111",
        answerEngine: "Perplexity",
        attributionMethod: "referrer",
        referrer: "https://perplexity.ai/search/private-query",
      }).success,
    ).toBe(false);
  });
});
