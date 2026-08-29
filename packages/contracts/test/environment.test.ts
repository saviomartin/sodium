import { describe, expect, it } from "vitest";
import {
  assertSupabaseEnvironment,
  supabaseProjectRef,
} from "../src/environment";

describe("environment isolation", () => {
  it("accepts each environment's pinned Supabase project", () => {
    expect(() =>
      assertSupabaseEnvironment(
        "development",
        "https://laqlbydlawieccohknsj.supabase.co",
      ),
    ).not.toThrow();
    expect(() =>
      assertSupabaseEnvironment(
        "production",
        "https://wsacbkkbvkcuqgiagxms.supabase.co",
      ),
    ).not.toThrow();
  });

  it("rejects production data in development", () => {
    expect(() =>
      assertSupabaseEnvironment(
        "development",
        "https://wsacbkkbvkcuqgiagxms.supabase.co",
      ),
    ).toThrow(/environment mismatch/);
  });

  it("rejects non-Supabase hosts", () => {
    expect(supabaseProjectRef("https://example.com")).toBeNull();
  });
});
