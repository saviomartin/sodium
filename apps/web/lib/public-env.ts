import { z } from "zod";
import {
  assertSupabaseEnvironment,
  SODIUM_ENVIRONMENTS,
} from "sodium-webmcp-spec";

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SODIUM_ENVIRONMENT: z.enum(SODIUM_ENVIRONMENTS),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

const parsed = PublicEnvSchema.safeParse({
  NEXT_PUBLIC_SODIUM_ENVIRONMENT: process.env.NEXT_PUBLIC_SODIUM_ENVIRONMENT,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

if (!parsed.success) {
  throw new Error(
    `invalid public environment:\n${parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n")}`,
  );
}

assertSupabaseEnvironment(
  parsed.data.NEXT_PUBLIC_SODIUM_ENVIRONMENT,
  parsed.data.NEXT_PUBLIC_SUPABASE_URL,
);

export const publicEnv = parsed.data;
