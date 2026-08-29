import { describe, expect, it } from "vitest";
import {
  answerEngineAttribution,
  answerEngineFromReferrer,
} from "../src/telemetry";

describe("answerEngineFromReferrer", () => {
  it.each([
    ["https://chatgpt.com/c/abc", "ChatGPT"],
    ["https://www.perplexity.ai/search/example", "Perplexity"],
    ["https://claude.ai/new", "Claude"],
    ["https://gemini.google.com/app", "Gemini"],
    ["https://copilot.microsoft.com/", "Copilot"],
  ])("classifies %s", (referrer, expected) => {
    expect(answerEngineFromReferrer(referrer)).toBe(expected);
  });

  it("does not classify search or malformed referrers", () => {
    expect(
      answerEngineFromReferrer("https://www.google.com/search?q=shop"),
    ).toBeNull();
    expect(answerEngineFromReferrer("not a url")).toBeNull();
  });
});

describe("answerEngineAttribution", () => {
  it("prefers a recognized browser referrer", () => {
    expect(
      answerEngineAttribution(
        "https://chatgpt.com/c/abc",
        "https://shop.example/products?utm_source=perplexity",
      ),
    ).toEqual({ engine: "ChatGPT", method: "referrer" });
  });

  it.each([
    ["utm_source=chatgpt.com", "ChatGPT"],
    ["source=perplexity", "Perplexity"],
    ["ref=anthropic", "Claude"],
    ["referrer=https%3A%2F%2Fgemini.google.com%2Fapp", "Gemini"],
  ])("uses an explicit source tag from %s", (query, expected) => {
    expect(
      answerEngineAttribution("", `https://shop.example/?${query}`),
    ).toEqual({ engine: expected, method: "campaign" });
  });

  it("does not guess from unrelated source values", () => {
    expect(
      answerEngineAttribution(
        "",
        "https://shop.example/?utm_source=newsletter",
      ),
    ).toBeNull();
  });
});
