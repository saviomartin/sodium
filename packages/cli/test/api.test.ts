import { describe, expect, it, vi } from "vitest";
import { SodiumApi } from "../src/api";

describe("Sodium API", () => {
  it("retrieves the authenticated CLI account", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ id: "user-1", email: "dev@example.com" }),
    );
    const api = new SodiumApi("https://sodium.example", "sod_cli_token", fetcher);

    await expect(api.me()).resolves.toEqual({
      id: "user-1",
      email: "dev@example.com",
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://sodium.example/api/cli/me"),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer sod_cli_token",
        }),
      }),
    );
  });

  it("preserves the HTTP status for expired-login recovery", async () => {
    const api = new SodiumApi(
      "https://sodium.example",
      "sod_cli_token",
      async () => Response.json({ error: "invalid API token" }, { status: 401 }),
    );

    await expect(api.me()).rejects.toEqual(
      expect.objectContaining({
        name: "SodiumApiError",
        message: "invalid API token",
        status: 401,
      }),
    );
  });
});
