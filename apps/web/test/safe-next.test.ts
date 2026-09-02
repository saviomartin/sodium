import { describe, expect, it } from "vitest";
import { pathWithError, safeNextPath } from "@/lib/safe-next";

describe("safeNextPath", () => {
  it("preserves an application-local activation path", () => {
    expect(safeNextPath("/activate?code=ABCD-EFGH")).toBe(
      "/activate?code=ABCD-EFGH",
    );
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/safe#unexpected-fragment",
  ])("rejects an unsafe redirect target: %s", (target) => {
    expect(safeNextPath(target)).toBe("/");
  });

  it("adds an encoded error without losing the device code", () => {
    expect(
      pathWithError(
        "/activate?code=ABCD-EFGH",
        "authError",
        "Sign-in was cancelled",
      ),
    ).toBe("/activate?code=ABCD-EFGH&authError=Sign-in+was+cancelled");
  });
});
