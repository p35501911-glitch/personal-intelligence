import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let serverClientInstance: SupabaseClient<Database> | null = null;

/**
 * Returns a Supabase client configured for server-side operations.
 * Uses SUPABASE_SERVICE_ROLE_KEY if available (bypassing RLS for ingestion workers),
 * falling back to NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
 */
export function getServiceSupabaseClient(): SupabaseClient<Database> {
  if (serverClientInstance) {
    return serverClientInstance;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase configuration missing: NEXT_PUBLIC_SUPABASE_URL or API key is not defined."
    );
  }

  serverClientInstance = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return serverClientInstance;
}
