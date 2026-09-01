import { describe, expect, it } from "vitest";
import { normalizeProjectRoot } from "../lib/project-root";

describe("normalizeProjectRoot", () => {
  it("supports auto-detection, explicit repository root, and nested apps", () => {
    expect(normalizeProjectRoot("")).toEqual({ ok: true, value: null });
    expect(normalizeProjectRoot("  ")).toEqual({ ok: true, value: null });
    expect(normalizeProjectRoot(".")).toEqual({ ok: true, value: "." });
    expect(normalizeProjectRoot(" apps/store ")).toEqual({
      ok: true,
      value: "apps/store",
    });
  });

  it.each([
    "/apps/store",
    "apps/store/",
    "apps//store",
    "apps\\store",
    "../store",
    "apps/../store",
    "apps/./store",
    "apps/\u0000store",
  ])("rejects unsafe or non-canonical path %j", (value) => {
    expect(normalizeProjectRoot(value).ok).toBe(false);
  });

  it("rejects roots longer than the database limit", () => {
    expect(normalizeProjectRoot("a".repeat(513)).ok).toBe(false);
  });
});
