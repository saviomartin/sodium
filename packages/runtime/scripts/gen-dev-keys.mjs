/**
 * Generates the INSECURE development manifest-signing keypair committed at
 * packages/runtime/keys/. Local development and tests only: apps/web refuses
 * to start in production with the dev keyId (see env validation).
 *
 * Usage: node scripts/gen-dev-keys.mjs
 */
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const keysDir = join(dirname(fileURLToPath(import.meta.url)), "..", "keys");
mkdirSync(keysDir, { recursive: true });

const keyId = "dev-insecure-1";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");

writeFileSync(
  join(keysDir, "dev-manifest-key.json"),
  JSON.stringify(
    {
      WARNING: "INSECURE development signing key. Never use in production.",
      keyId,
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    },
    null,
    2,
  ) + "\n",
);

writeFileSync(
  join(keysDir, "dev-jwks.json"),
  JSON.stringify({ [keyId]: publicKey.export({ format: "jwk" }) }, null, 2) + "\n",
);

console.log(`wrote dev keypair (keyId=${keyId}) to ${keysDir}`);
