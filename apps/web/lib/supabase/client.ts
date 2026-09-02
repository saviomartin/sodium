import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "sodium-webmcp-spec/database";
import { publicEnv } from "../public-env";

export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
