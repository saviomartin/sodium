import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "dotenv";

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  throw new Error(
    "SUPABASE_ACCESS_TOKEN is required for environment verification",
  );
}

const projectRefs = {
  development: "laqlbydlawieccohknsj",
  production: "wsacbkkbvkcuqgiagxms",
};
const requiredEverywhere = [
  "CRON_SECRET",
  "GITHUB_WEBHOOK_SECRET",
  "LOG_LEVEL",
  "MANIFEST_SIGNING_KEY_ID",
  "MANIFEST_SIGNING_PRIVATE_KEY",
  "NEXT_PUBLIC_SODIUM_ENVIRONMENT",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SODIUM_ENVIRONMENT",
  "SODIUM_MANIFEST_JWKS",
  "STRIPE_MODE",
  "STRIPE_PORTAL_CONFIGURATION_ID",
  "STRIPE_REPOSITORY_PRICE_ID",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID",
  "SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET",
  "SUPABASE_DB_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_URL",
  "WORK_DIR",
];
const requiredByTarget = {
  development: [...requiredEverywhere, "SITE_URL", "SODIUM_PUBLIC_URL"],
  preview: requiredEverywhere,
  production: [...requiredEverywhere, "SITE_URL", "SODIUM_PUBLIC_URL"],
};
const forbidden = [
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "NEXT_PUBLIC_GITHUB_APP_SLUG",
];

function runVercel(args, options = {}) {
  const result = spawnSync("pnpm", ["exec", "vercel", ...args], {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      result.stderr || result.stdout || `vercel ${args.join(" ")} failed`,
    );
  }
  return result.stdout;
}

function targetsFor(rows, key) {
  return new Set(
    rows.filter((row) => row.key === key).flatMap((row) => row.target ?? []),
  );
}

async function authConfig(ref) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/config/auth`,
    {
      headers: {
        authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      },
    },
  );
  if (!response.ok) throw new Error(`could not read Auth config for ${ref}`);
  return response.json();
}

async function githubAuthorize(ref, redirectTo) {
  const url = new URL(`https://${ref}.supabase.co/auth/v1/authorize`);
  url.searchParams.set("provider", "github");
  url.searchParams.set("redirect_to", redirectTo);
  url.searchParams.set("scopes", "repo user:email");
  const response = await fetch(url, { redirect: "manual" });
  const location = response.headers.get("location");
  if (response.status !== 302 || !location) {
    throw new Error(`${ref} did not redirect to GitHub OAuth`);
  }
  const github = new URL(location);
  const scopes = new Set((github.searchParams.get("scope") ?? "").split(" "));
  if (
    github.hostname !== "github.com" ||
    github.pathname !== "/login/oauth/authorize" ||
    !scopes.has("repo") ||
    !scopes.has("user:email")
  ) {
    throw new Error(`${ref} GitHub OAuth redirect is missing required scopes`);
  }
  return github.searchParams.get("client_id");
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "sodium-env-verify-"));
try {
  const list = JSON.parse(runVercel(["env", "ls", "--json"]));
  const rows = list.envs ?? [];
  for (const [target, keys] of Object.entries(requiredByTarget)) {
    const missing = keys.filter((key) => !targetsFor(rows, key).has(target));
    if (missing.length > 0) {
      throw new Error(`Vercel ${target} is missing: ${missing.join(", ")}`);
    }
  }
  const obsolete = forbidden.filter((key) => targetsFor(rows, key).size > 0);
  if (obsolete.length > 0) {
    throw new Error(
      `obsolete GitHub App variables remain: ${obsolete.join(", ")}`,
    );
  }

  const pulled = {};
  for (const target of ["development", "production"]) {
    const path = join(temporaryDirectory, `${target}.env`);
    runVercel(["env", "pull", path, `--environment=${target}`, "--yes"]);
    pulled[target] = parse(readFileSync(path, "utf8"));
  }
  if (
    pulled.development.SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID !==
    pulled.production.SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID
  ) {
    throw new Error(
      "Development and Production must use the same Sodium OAuth App",
    );
  }
  if (
    pulled.development.NEXT_PUBLIC_SUPABASE_URL !==
      `https://${projectRefs.development}.supabase.co` ||
    pulled.production.NEXT_PUBLIC_SUPABASE_URL !==
      `https://${projectRefs.production}.supabase.co`
  ) {
    throw new Error("Vercel Supabase project isolation is incorrect");
  }

  const [developmentAuth, productionAuth] = await Promise.all([
    authConfig(projectRefs.development),
    authConfig(projectRefs.production),
  ]);
  if (
    !developmentAuth.external_github_enabled ||
    !productionAuth.external_github_enabled ||
    developmentAuth.external_github_client_id !==
      productionAuth.external_github_client_id ||
    developmentAuth.external_github_client_id !==
      pulled.production.SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID
  ) {
    throw new Error("Supabase Auth is not using the shared Sodium OAuth App");
  }
  if (
    developmentAuth.site_url !== "http://localhost:3000" ||
    productionAuth.site_url !== "https://sodium-webmcp.vercel.app"
  ) {
    throw new Error("Supabase Auth site URLs are incorrect");
  }
  const expectedDevelopmentRedirects = [
    "http://localhost:3000/auth/callback",
    "http://localhost:3000/auth/confirm",
    "https://*-foundative.vercel.app/**",
  ];
  const expectedProductionRedirects = [
    "https://sodium-webmcp.vercel.app/auth/callback",
    "https://sodium-webmcp.vercel.app/auth/confirm",
  ];
  if (
    developmentAuth.uri_allow_list !== expectedDevelopmentRedirects.join(",") ||
    productionAuth.uri_allow_list !== expectedProductionRedirects.join(",")
  ) {
    throw new Error("Supabase Auth redirect allow lists are incorrect");
  }

  const [developmentClient, productionClient] = await Promise.all([
    githubAuthorize(
      projectRefs.development,
      "http://localhost:3000/auth/callback",
    ),
    githubAuthorize(
      projectRefs.production,
      "https://sodium-webmcp.vercel.app/auth/callback",
    ),
  ]);
  if (!developmentClient || developmentClient !== productionClient) {
    throw new Error(
      "Supabase environments redirect to different GitHub OAuth Apps",
    );
  }

  console.log(
    "Environment verification passed for local Development, Preview, and Production.",
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
