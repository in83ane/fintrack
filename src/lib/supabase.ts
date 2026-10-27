import { createBucketCommander } from './bucket-command';
import { DATA_RESET_DISABLED_CODE, dataResetCopy } from './data-reset-policy';
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
  terminal_symbol: string | null;
  terminal_interval: string | null;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string; // uuid
  user_id: string;
  portfolio_id?: string | null;
  brokerage_account_id?: string | null;
  name: string;
  symbol: string;
  asset_type: string | null;
  value_usd: number;
  quantity: number;
  avg_purchase_price: number | null;
  current_price: number | null;
  change_24h: number | null;
  change_percentage: number | null;
  allocation_target: number | null;
  allocation_current: number | null;
  allocation: string | null;
  sector: string | null;
  country: string | null;
  notes: string | null;
  is_active: boolean;
  is_favorite: boolean;
  exclude_from_total: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Trade {
  id: string; // uuid
  user_id: string;
  portfolio_id?: string | null;
  asset_id: string | null;
  symbol: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'IMPORT';
  amount_usd: number;
  quantity: number | null;
  price_per_unit: number | null;
  date: string;
  rate_at_time: number | null;
  currency: string | null;
  original_amount: number | null;
  source_bucket_id: string | null;
  brokerage_account_id?: string | null;
  tag: string | null;
  created_at: string;
}

export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
  color: string;
  is_default: boolean;
  kind: 'trading' | 'cash_management';
  created_at: string;
  updated_at: string;
}

export interface BrokerageAccount {
  id: string;
  user_id: string;
  portfolio_id: string;
  name: string;
  broker: string | null;
  currency: 'USD' | 'THB' | 'JPY' | 'EUR';
  color: string;
  kind: 'cash' | 'asset_group';
  created_at: string;
  updated_at: string;
}

export interface BrokerageCashEntry {
  id: string;
  user_id: string;
  portfolio_id: string;
  brokerage_account_id: string;
  type: 'DEPOSIT' | 'WITHDRAW' | 'TRADE_BUY' | 'TRADE_SELL' | 'ADJUSTMENT';
  amount: number;
  currency: 'USD' | 'THB' | 'JPY' | 'EUR';
  trade_id: string | null;
  occurred_at: string;
  note: string | null;
  created_at: string;
}

export interface Allocation {
  id: string; // uuid
  user_id: string;
  portfolio_id?: string | null;
  label: string;
  value: number;
  color: string;
}

export interface MoneyBucket {
  id: string; // uuid
  user_id: string;
  portfolio_id?: string | null;
  name: string;
  target_percent: number;
  target_amount?: number;
  current_amount: number;
  currency: string | null;
  color: string;
  icon: string;
  linked_to_expenses: boolean;
  created_at: string;
}

export interface BucketActivity {
  id: string; // uuid
  user_id: string;
  portfolio_id?: string | null;
  bucket_id: string;
  type: 'deposit' | 'withdraw' | 'income_split' | 'invest' | 'profit_split';
  amount: number;
  note: string | null;
  date: string;
  currency: string | null;
  rate_at_time: number | null;
  original_amount: number | null;
  created_at: string;
}

export interface CashActivity {
  id: string; // uuid
  user_id: string;
  portfolio_id?: string | null;
  type: 'INCOME' | 'EXPENSE' | 'DEPOSIT' | 'WITHDRAW';
  amount: number;
  category: string;
  note: string | null;
  date: string;
  time: string | null;
  bucket_id: string | null;
  is_transfer: boolean;
  currency: string | null;
  rate_at_time: number | null;
  original_amount: number | null;
  created_at: string;
}

export interface HistoryEvent {
  id: string;
  user_id: string;
  portfolio_id: string | null;
  source_table: 'trades';
  source_record_id: string;
  action: 'CREATED' | 'UPDATED' | 'DELETED';
  transaction_type: string;
  asset_symbol: string | null;
  quantity: number | null;
  price: number | null;
  gross_amount: number;
  fees: number;
  taxes: number;
  net_amount: number;
  currency: string | null;
  exchange_rate: number | null;
  realized_pnl: number | null;
  unrealized_pnl: number | null;
  category: string | null;
  related_bucket_id: string | null;
  note: string | null;
  occurred_at: string;
  recorded_at: string;
  metadata: Record<string, unknown>;
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

const executeBucketCommand=createBucketCommander(async args=>await supabase.rpc('write_bucket_cash',args));

// Database helper functions
export const db = {
  bucketWriter: {
    execute: async (owner:string,command:any)=>executeBucketCommand(owner,command),
    save: async (requestId:string,id:string,details:any,rate?:number)=>await supabase.rpc('save_cash_bucket',{request_id:requestId,bucket_id:id,details,opening_rate:rate??null}),
  },
  // Immutable trade ledger. The database is the writer (via trade triggers);
  // clients can only read a bounded, indexed page.
  history: {
    getPage: async (
      userId: string,
      portfolioId?: string | null,
      from?: string,
      to?: string,
      limit = 250,
    ) => {
      let query = supabase
        .from('history_events')
        .select('*')
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      if (from) query = query.gte('occurred_at', from);
      if (to) query = query.lt('occurred_at', to);
      return await query;
    },
  },

  // Assets
  assets: {
    getAll: async (userId: string, portfolioId?: string | null, range?: { from: number; to: number }) => {
      let query = supabase
        .from('assets')
        .select('*')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      if (range) query = query.order('id').range(range.from, range.to);
      return await query;
    },
    insert: async (asset: Omit<Asset, 'id' | 'created_at' | 'updated_at'>) => {
      return await supabase
        .from('assets')
        .insert(asset)
        .select()
        .single();
    },
    update: async (id: string, updates: Partial<Asset>) => {
      return await supabase
        .from('assets')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
    },
    delete: async (id: string) => {
      return await supabase.from('assets').delete().eq('id', id);
    },
    softDeleteBySymbol: async (userId: string, symbol: string, portfolioId?: string | null) => {
      let query = supabase
        .from('assets')
        .update({ is_active: false })
        .eq('user_id', userId)
        .ilike('symbol', symbol);
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      return await query;
    },
    upsert: async (asset: Omit<Asset, 'id' | 'created_at' | 'updated_at'>) => {
      // Manual upsert since there is no unique constraint on user_id,symbol
      let existingQuery = supabase
        .from('assets')
        .select('id')
        .eq('user_id', asset.user_id)
        .ilike('symbol', asset.symbol)
        .limit(1);
      if (asset.portfolio_id) existingQuery = existingQuery.eq('portfolio_id', asset.portfolio_id);
      const existing = await existingQuery.maybeSingle();
        
      if (existing.data?.id) {
        return await supabase
          .from('assets')
          .update({ ...asset, updated_at: new Date().toISOString() })
          .eq('id', existing.data.id)
          .select()
          .single();
      } else {
        return await supabase
          .from('assets')
          .insert(asset)
          .select()
          .single();
      }
    },
    bulkUpdate: async (assets: Partial<Asset> & { id: string }[]) => {
      const promises = assets.map(a =>
        supabase.from('assets').update({ ...a, updated_at: new Date().toISOString() }).eq('id', a.id)
      );
      return await Promise.all(promises);
    },
  },

  // Trades
  trades: {
    getAll: async (userId: string, portfolioId?: string | null, range?: { from: number; to: number }) => {
      let query = supabase
        .from('trades')
        .select('*, cost_basis_sales(method,selections,request)')
        .eq('user_id', userId)
        .order('execution_date', { ascending: false });
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      if (range) query = query.order('id').range(range.from, range.to);
      return await query;
    },
    insert: async (trade: Omit<Trade, 'id' | 'created_at'>) => {
      return await supabase.from('trades').insert(trade).select().single();
    },
    update: async (id: string, updates: Partial<Trade>) => {
      return await supabase.from('trades').update(updates).eq('id', id).select().single();
    },
    delete: async (id: string) => {
      return await supabase.from('trades').delete().eq('id', id);
    },
    deleteWithBrokerageCash: async (id: string) => {
      return await supabase.rpc('delete_trade_with_brokerage_cash', { p_trade_id: id });
    },
    deletePositionWithBrokerageCash: async (symbol: string, portfolioId: string) => {
      return await supabase.rpc('delete_position_with_brokerage_cash', {
        p_symbol: symbol,
        p_portfolio_id: portfolioId,
      });
    },
    replaceWithBrokerageCash: async (input: {
      id: string;
      symbol: string;
      executionDate: string;
      quantity: number;
      priceAtExecution: number;
      amountUSD: number;
      originalAmount: number;
    }) => {
      return await supabase.rpc('replace_brokerage_trade', {
        p_trade_id: input.id,
        p_symbol: input.symbol,
        p_execution_date: input.executionDate,
        p_quantity: input.quantity,
        p_price_at_execution: input.priceAtExecution,
        p_amount_usd: input.amountUSD,
        p_original_amount: input.originalAmount,
      });
    },
    deleteBySymbol: async (userId: string, symbol: string, portfolioId?: string | null) => {
      let query = supabase
        .from('trades')
        .delete()
        .eq('user_id', userId)
        .ilike('symbol', symbol);
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      return await query;
    },
    bulkInsert: async (trades: Omit<Trade, 'id' | 'created_at'>[]) => {
      return await supabase.from('trades').insert(trades).select();
    },
  },

  portfolios: {
    getAll: async (userId: string) => {
      return await supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
    },
    insert: async (portfolio: Omit<Portfolio, 'id' | 'created_at' | 'updated_at'>) => {
      return await supabase.from('portfolios').insert(portfolio).select().single();
    },
    update: async (id: string, updates: Partial<Portfolio>) => {
      return await supabase
        .from('portfolios')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
    },
    delete: async (id: string) => {
      return await supabase.from('portfolios').delete().eq('id', id);
    },
  },

  // Brokerage cash accounts belong only to trading portfolios. Their balance
  // is calculated from the append-only brokerage_cash_entries ledger.
  brokerageAccounts: {
    getAll: async (userId: string, portfolioId?: string | null, range?: { from: number; to: number }) => {
      let query = supabase
        .from('brokerage_accounts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at');
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      if (range) query = query.order('id').range(range.from, range.to);
      return await query;
    },
    insert: async (account: Omit<BrokerageAccount, 'id' | 'created_at' | 'updated_at'>) => {
      return await supabase.from('brokerage_accounts').insert(account).select().single();
    },
    update: async (id: string, updates: Partial<BrokerageAccount>) => {
      return await supabase
        .from('brokerage_accounts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
    },
  },

  brokerageCashEntries: {
    transferFromBucket: async (transfer: { id: string; bucketId: string; accountId: string; sourceAmount: number; receivedAmount: number; fee: number; thbPerUsd: number; legacyThbPerUsd: number }) => {
      return await supabase.rpc('transfer_bucket_to_broker', {
        p_transfer_id: transfer.id,
        p_bucket_id: transfer.bucketId,
        p_account_id: transfer.accountId,
        p_source_amount: transfer.sourceAmount,
        p_received_amount: transfer.receivedAmount,
        p_fee: transfer.fee,
        p_thb_per_usd: transfer.thbPerUsd,
        p_legacy_thb_per_usd: transfer.legacyThbPerUsd,
      });
    },
    insert: async (entry: Omit<BrokerageCashEntry, 'id' | 'created_at'>) => {
      return await supabase.from('brokerage_cash_entries').insert(entry).select().single();
    },
    getBalances: async (userId: string, portfolioId?: string | null, range?: { from: number; to: number }) => {
      let query = supabase
        .from('brokerage_account_balances')
        .select('*')
        .eq('user_id', userId);
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      if (range) query = query.order('brokerage_account_id').range(range.from, range.to);
      return await query;
    },
    getAll: async (userId: string, portfolioId?: string | null, range?: { from: number; to: number }) => {
      let query = supabase
        .from('brokerage_cash_entries')
        .select('*')
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false });
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      if (range) query = query.order('id').range(range.from, range.to);
      return await query;
    },
  },

  // Allocations
  allocations: {
    getAll: async (userId: string, portfolioId?: string | null, range?: { from: number; to: number }) => {
      let query = supabase
        .from('allocations')
        .select('*')
        .eq('user_id', userId)
        .order('label');
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      if (range) query = query.order('id').range(range.from, range.to);
      return await query;
    },
    upsert: async (allocation: Omit<Allocation, 'id'>) => {
      return await supabase
        .from('allocations')
        .upsert(allocation, { onConflict: allocation.portfolio_id ? 'user_id,portfolio_id,label' : 'user_id,label' })
        .select()
        .single();
    },
    bulkUpsert: async (allocations: Omit<Allocation, 'id'>[]) => {
      const portfolioId = allocations[0]?.portfolio_id;
      return await supabase.from('allocations').upsert(allocations, { onConflict: portfolioId ? 'user_id,portfolio_id,label' : 'user_id,label' }).select();
    },
    delete: async (userId: string, label: string) => {
      return await supabase.from('allocations').delete().eq('user_id', userId).eq('label', label);
    },
  },

  // Money Buckets
  buckets: {
    getAll: async (userId: string, portfolioId?: string | null, range?: { from: number; to: number }) => {
      let query = supabase
        .from('money_buckets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at');
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      if (range) query = query.order('id').range(range.from, range.to);
      return await query;
    },
    insert: async (bucket: Omit<MoneyBucket, 'id' | 'created_at'>) => {
      throw new Error('Use save_cash_bucket');
    },
    update: async (id: string, updates: Partial<MoneyBucket>) => {
      throw new Error('Use save_cash_bucket');
    },
    delete: async (id: string) => {
      return await supabase.rpc('remove_empty_cash_bucket',{bucket_id:id});
    },
  },

  // Bucket Activities
  bucketActivities: {
    getAll: async (userId: string, portfolioId?: string | null, range?: { from: number; to: number }) => {
      let query = supabase
        .from('bucket_activities')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      if (range) query = query.order('id').range(range.from, range.to);
      return await query;
    },
    insert: async (activity: Omit<BucketActivity, 'id' | 'created_at'>) => {
      throw new Error('Use atomic bucket writer; mirror activities are database-owned');
    },
    delete: async (id: string) => {
      throw new Error('Use atomic bucket writer; mirror activities are database-owned');
    },
  },

  // Cash Activities
  cashActivities: {
    getAll: async (userId: string, portfolioId?: string | null, range?: { from: number; to: number }) => {
      let query = supabase
        .from('cash_activities')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      if (range) query = query.order('id').range(range.from, range.to);
      return await query;
    },
    insert: async (activity: Omit<CashActivity, 'id' | 'created_at'>) => {
      const {user_id,...row}=activity;const result=await executeBucketCommand(user_id,{op:'create',rows:[row]});return {...result,data:result.data?.[0]??null};
    },
    update: async (id: string, updates: Partial<CashActivity>) => {
      const {data:{user}}=await supabase.auth.getUser();const result=await executeBucketCommand(user?.id||'',{op:'edit',id,patch:updates});return {...result,data:result.data?.[0]??null};
    },
    delete: async (id: string) => {
      const {data:{user}}=await supabase.auth.getUser();return executeBucketCommand(user?.id||'',{op:'delete',id});
    },
  },

  // DCA Drafts (per user per symbol)
  dcaDrafts: {
    get: async (userId: string, symbol: string, portfolioId?: string | null) => {
      let query = supabase
        .from('dca_drafts')
        .select('entries')
        .eq('user_id', userId)
        .eq('symbol', symbol);
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      return await query.maybeSingle();
    },
    upsert: async (userId: string, symbol: string, entries: any[], portfolioId?: string | null) => {
      return await supabase
        .from('dca_drafts')
        .upsert(
          { user_id: userId, symbol, entries, portfolio_id: portfolioId || null, updated_at: new Date().toISOString() },
          { onConflict: portfolioId ? 'user_id,portfolio_id,symbol' : 'user_id,symbol' }
        );
    },
    delete: async (userId: string, symbol: string, portfolioId?: string | null) => {
      let query = supabase
        .from('dca_drafts')
        .delete()
        .eq('user_id', userId)
        .eq('symbol', symbol);
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      return await query;
    },
  },

  // Temporarily unavailable in this app. Do not call Auth/RPC or clear local data.
  deleteAllUserData: async (userId: string) => {
    void userId;
    return {
      data: null,
      error: {
        code: DATA_RESET_DISABLED_CODE,
        message: dataResetCopy.en.description,
      },
    };
  },

  // User Custom Categories (for Ledger)
  userCategories: {
    getAll: async (userId: string, portfolioId?: string | null, range?: { from: number; to: number }) => {
      let query = supabase
        .from('user_categories')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      if (range) query = query.order('id').range(range.from, range.to);
      return await query;
    },
    insert: async (userId: string, type: 'INCOME' | 'EXPENSE', label: string, icon: string, portfolioId?: string | null) => {
      return await supabase
        .from('user_categories')
        .insert({ user_id: userId, portfolio_id: portfolioId || null, type, label, icon })
        .select()
        .single();
    },
    delete: async (id: string) => {
      return await supabase.from('user_categories').delete().eq('id', id);
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
 
