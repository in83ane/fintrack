import { createClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseAnonKey } from './env';

// Types for database tables
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  language: string | null;
  currency: string | null;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: number;
  user_id: string;
  symbol: string;
  name: string;
  shares: number;
  avg_cost: number;
  created_at: string;
  updated_at: string;
}

export interface Trade {
  id: number;
  user_id: string;
  asset_symbol: string;
  type: 'BUY' | 'SELL';
  amount_usd: number;
  shares: number | null;
  price_per_unit: number | null;
  date: string;
  rate_at_time: number | null;
  currency: string | null;
  created_at: string;
}

export interface Allocation {
  id: number;
  user_id: string;
  label: string;
  value: number;
  color: string;
}

export interface MoneyBucket {
  id: number;
  user_id: string;
  name: string;
  target_percent: number;
  current_amount: number;
  color: string;
  icon: string;
  linked_to_expenses: boolean;
}

export interface BucketActivity {
  id: number;
  user_id: string;
  bucket_id: number;
  type: 'deposit' | 'withdraw' | 'income_split' | 'invest' | 'profit_split';
  amount: number;
  note: string | null;
  created_at: string;
}

export interface CashActivity {
  id: number;
  user_id: string;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  category: string;
  note: string | null;
  date: string;
  created_at: string;
}

// Create Supabase client with validation
const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = getSupabaseAnonKey();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase credentials missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
  global: {
    headers: {
      'X-Client-Info': 'fintrack-web',
    },
  },
});

// Database helper functions
export const db = {
  // Assets
  assets: {
    getAll: async (userId: string) => {
      return await supabase
        .from('assets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    },
    insert: async (asset: Omit<Asset, 'id' | 'created_at' | 'updated_at'>) => {
      return await supabase
        .from('assets')
        .insert(asset)
        .select()
        .single();
    },
    update: async (id: number, updates: Partial<Asset>) => {
      return await supabase
        .from('assets')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
    },
    delete: async (id: number) => {
      return await supabase.from('assets').delete().eq('id', id);
    },
    upsert: async (asset: Omit<Asset, 'id' | 'created_at' | 'updated_at'>) => {
      return await supabase
        .from('assets')
        .upsert(asset, { onConflict: 'user_id,symbol' })
        .select()
        .single();
    },
  },

  // Trades
  trades: {
    getAll: async (userId: string) => {
      return await supabase
        .from('trades')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });
    },
    insert: async (trade: Omit<Trade, 'id' | 'created_at'>) => {
      return await supabase.from('trades').insert(trade).select().single();
    },
    delete: async (id: number) => {
      return await supabase.from('trades').delete().eq('id', id);
    },
    bulkInsert: async (trades: Omit<Trade, 'id' | 'created_at'>[]) => {
      return await supabase.from('trades').insert(trades).select();
    },
  },

  // Allocations
  allocations: {
    getAll: async (userId: string) => {
      return await supabase
        .from('allocations')
        .select('*')
        .eq('user_id', userId)
        .order('label');
    },
    upsert: async (allocation: Omit<Allocation, 'id'>) => {
      return await supabase
        .from('allocations')
        .upsert(allocation, { onConflict: 'user_id,label' })
        .select()
        .single();
    },
    bulkUpsert: async (allocations: Omit<Allocation, 'id'>[]) => {
      return await supabase.from('allocations').upsert(allocations, { onConflict: 'user_id,label' }).select();
    },
    delete: async (userId: string, label: string) => {
      return await supabase.from('allocations').delete().eq('user_id', userId).eq('label', label);
    },
  },

  // Money Buckets
  buckets: {
    getAll: async (userId: string) => {
      return await supabase
        .from('money_buckets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at');
    },
    insert: async (bucket: Omit<MoneyBucket, 'id'>) => {
      return await supabase.from('money_buckets').insert(bucket).select().single();
    },
    update: async (id: number, updates: Partial<MoneyBucket>) => {
      return await supabase.from('money_buckets').update(updates).eq('id', id).select().single();
    },
    delete: async (id: number) => {
      return await supabase.from('money_buckets').delete().eq('id', id);
    },
  },

  // Bucket Activities
  bucketActivities: {
    getAll: async (userId: string) => {
      return await supabase
        .from('bucket_activities')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    },
    insert: async (activity: Omit<BucketActivity, 'id'>) => {
      return await supabase.from('bucket_activities').insert(activity).select().single();
    },
  },

  // Cash Activities
  cashActivities: {
    getAll: async (userId: string) => {
      return await supabase
        .from('cash_activities')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });
    },
    insert: async (activity: Omit<CashActivity, 'id' | 'created_at'>) => {
      return await supabase.from('cash_activities').insert(activity).select().single();
    },
    delete: async (id: number) => {
      return await supabase.from('cash_activities').delete().eq('id', id);
    },
  },

  // Profile
  profile: {
    get: async (userId: string) => {
      return await supabase.from('profiles').select('*').eq('id', userId).single();
    },
    update: async (userId: string, updates: Partial<Profile>) => {
      return await supabase.from('profiles').update(updates).eq('id', userId).select().single();
    },
  },
};

// Check if Supabase is properly configured
export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl && !!supabaseAnonKey;
}
