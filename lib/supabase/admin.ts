import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "[ASARVO ADMIN] Brak NEXT_PUBLIC_SUPABASE_URL."
    );
  }

  if (!supabaseSecretKey) {
    throw new Error(
      "[ASARVO ADMIN] Brak SUPABASE_SECRET_KEY."
    );
  }

  if (!adminClient) {
    adminClient = createClient(
      supabaseUrl,
      supabaseSecretKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    );
  }

  return adminClient;
}