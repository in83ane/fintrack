import { createClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseAnonKey } from './env';

const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = getSupabaseAnonKey();

// Create a mock client for development/build when credentials are missing
const createMockClient = () => {
  return {
    auth: {
      signInWithOAuth: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: () => ({ data: [], error: null }),
      insert: () => ({ error: null }),
      update: () => ({ error: null }),
      delete: () => ({ error: null }),
    }),
  } as any;
};

let supabaseClient;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Using mock client. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  supabaseClient = createMockClient();
} else {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  });
}

export const supabase = supabaseClient;
