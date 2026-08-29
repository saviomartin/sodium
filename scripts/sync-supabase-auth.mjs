import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
const environments = {
  development: {
    projectRef: "laqlbydlawieccohknsj",
    siteUrl: "http://localhost:3000",
    redirects: [
      "http://localhost:3000/auth/callback",
      "http://localhost:3000/auth/confirm",
      "https://*-foundative.vercel.app/**",
    ],
  },
  production: {
    projectRef: "wsacbkkbvkcuqgiagxms",
    siteUrl: "https://sodium-webmcp.vercel.app",
    redirects: [
      "https://sodium-webmcp.vercel.app/auth/callback",
      "https://sodium-webmcp.vercel.app/auth/confirm",
    ],
  },
};

if (!(target in environments)) {
  console.error(
    "Usage: node scripts/sync-supabase-auth.mjs development|production",
  );
  process.exit(1);
}
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN is required for the Management API");
  process.exit(1);
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "sodium-auth-env-"));
const pulledPath = join(temporaryDirectory, `${target}.env`);

try {
  const args = ["env", "pull", pulledPath, `--environment=${target}`, "--yes"];
  let pull = spawnSync(
    "vercel",
    args,
    { cwd: root, stdio: "inherit" },
  );
  if (pull.error?.code === "ENOENT") {
    pull = spawnSync("pnpm", ["dlx", "vercel@59.10.0", ...args], {
      cwd: root,
      stdio: "inherit",
    });
  }
  if (pull.status !== 0) process.exit(pull.status ?? 1);

  const environment = parse(readFileSync(pulledPath, "utf8"));
  const credentialPath = join(root, "supabase", `.env.${target}.local`);
  let credentials = existsSync(credentialPath)
    ? parse(readFileSync(credentialPath, "utf8"))
    : environment;

  const usable = (value) => Boolean(value && value !== "[SENSITIVE]");
  if (
    target === "production" &&
    (!usable(credentials.SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID) ||
      !usable(credentials.SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET)) &&
    existsSync(join(root, ".env"))
  ) {
    const legacy = parse(readFileSync(join(root, ".env"), "utf8"));
    if (
      usable(legacy.SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID) &&
      usable(legacy.SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET)
    ) {
      credentials = legacy;
      writeFileSync(
        credentialPath,
        [
          `SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID=${JSON.stringify(legacy.SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID)}`,
          `SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET=${JSON.stringify(legacy.SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET)}`,
          "",
        ].join("\n"),
        { mode: 0o600 },
      );
      chmodSync(credentialPath, 0o600);
    }
  }

  const clientId = credentials.SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID;
  const secret = credentials.SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET;
  if (!usable(clientId) || !usable(secret)) {
    throw new Error(`Vercel ${target} is missing GitHub Auth credentials`);
  }

  const config = environments[target];
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${config.projectRef}/config/auth`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        site_url: config.siteUrl,
        uri_allow_list: config.redirects.join(","),
        external_github_enabled: true,
        external_github_client_id: clientId,
        external_github_secret: secret,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Supabase Auth update failed (${response.status}): ${await response.text()}`,
    );
  }

  const verified = await fetch(
    `https://api.supabase.com/v1/projects/${config.projectRef}/config/auth`,
    {
      headers: {
        authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      },
    },
  );
  if (!verified.ok) {
    throw new Error(`Supabase Auth verification failed (${verified.status})`);
  }
  const body = await verified.json();
  if (
    body.site_url !== config.siteUrl ||
    body.uri_allow_list !== config.redirects.join(",") ||
    body.external_github_enabled !== true
  ) {
    throw new Error(`Supabase Auth verification did not match ${target}`);
  }
  console.log(
    `${target} Auth configured on ${config.projectRef} with ${config.redirects.length} isolated redirect rule(s).`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
