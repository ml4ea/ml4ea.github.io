import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

let client: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (!isSupabaseConfigured) return null;

  if (!client) {
    client = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        detectSessionInUrl: true,
        flowType: 'implicit',
        persistSession: true,
      },
    });
  }

  return client;
}
