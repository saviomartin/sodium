import { describe, expect, it } from "vitest";
import { isPublicPath } from "../lib/public-routes";

describe("session proxy route boundary", () => {
  it.each([
    "/",
    "/activate",
    "/api/cli/auth/start",
    "/api/cli/auth/token",
    "/api/events",
    "/api/v1/projects",
    "/schema/v1.json",
  ])("allows public transport route %s", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(["/projects/prj_abcdefgh", "/settings", "/dashboard"])(
    "protects account route %s",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );
});
