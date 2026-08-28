import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ToolManifestSchema } from "@sodium/contracts";
import { signManifest } from "@sodium/contracts/signing";
import { FIXTURE_SITE_ID, fixtureTools } from "../../sodium/manifest-tools";

/**
 * Fixture-local manifest endpoint: signs the committed tool set with the
 * repo's INSECURE dev key so the fixture works without the platform running.
 * Test hooks: ?origin= overrides the bound origin (cross-origin rejection
 * test) and ?tamper=1 corrupts the signature (fail-closed test).
 */

function devKey(): { keyId: string; privateKeyPem: string } {
  const path =
    process.env.SODIUM_DEV_KEY_FILE ??
    join(
      process.cwd(),
      "..",
      "..",
      "packages",
      "runtime",
      "keys",
      "dev-manifest-key.json",
    );
  return JSON.parse(readFileSync(path, "utf8")) as {
    keyId: string;
    privateKeyPem: string;
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.searchParams.get("origin") ?? url.origin;

  const manifest = ToolManifestSchema.parse({
    manifestVersion: 1,
    siteId: FIXTURE_SITE_ID,
    origins: [origin],
    version: 1,
    generatedAt: new Date().toISOString(),
    tools: fixtureTools,
  });

  const signed = signManifest(manifest, devKey());
  if (url.searchParams.get("tamper") === "1") {
    // Flip one signature character; the loader must reject this manifest.
    const chars = [...signed.signature];
    chars[0] = chars[0] === "A" ? "B" : "A";
    signed.signature = chars.join("");
  }

  return Response.json(signed, {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}
