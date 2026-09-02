import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readInit, suggestedProjectName, writeInit } from "../src/files";

describe("project initialization metadata", () => {
  it("suggests the unscoped package name and persists the chosen name", async () => {
    const root = await mkdtemp(join(tmpdir(), "sodium-name-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "@acme/store" }),
    );

    await expect(suggestedProjectName(root)).resolves.toBe("store");
    await writeInit(root, { projectName: "Acme storefront" });
    await expect(readInit(root)).resolves.toEqual({
      projectName: "Acme storefront",
    });
    await expect(
      readFile(join(root, ".sodium", "init.json"), "utf8"),
    ).resolves.toContain('"projectName": "Acme storefront"');
  });
});
