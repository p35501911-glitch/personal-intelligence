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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const key = serviceKey || publishableKey;

  if (!url || !key) {
    throw new Error(
      "Supabase configuration missing: NEXT_PUBLIC_SUPABASE_URL or API key is not defined."
    );
  }

  if (!serviceKey) {
    console.warn(
      "[Supabase] WARNING: SUPABASE_SERVICE_ROLE_KEY is not defined. Falling back to publishable key. Ingestion persistence requires service role key for table writes under RLS."
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

/**
 * Resets the cached server client instance. Useful in testing environments
 * or when dynamic configuration changes occur.
 */
export function resetServerSupabaseClient(): void {
  serverClientInstance = null;
}
