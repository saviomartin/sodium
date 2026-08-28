import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@sodium/contracts/database";
import { env } from "../env";

/**
 * Service-role client: BYPASSES RLS. Only for code paths that have already
 * authorized the caller explicitly (role checked via the user-context client)
 * or that serve public, signed data. Never import from client components.
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
