# Database dictionary — schema ที่ผู้ใช้แนบ

เอกสารอ้างอิงเท่านั้น ไม่ใช่ migration และไม่ได้ query ฐานข้อมูลจริง วันที่จัดทำ 2026-10-13

`auth.users` แสดงเฉพาะ id ซึ่งถูก FK อ้างถึง ไม่ได้สรุปคอลัมน์ภายใน Supabase Auth

## public.profiles

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| email | `text NOT NULL` | ไม่ได้ | — |
| full_name | `text` | ได้ | — |
| avatar_url | `text` | ได้ | — |
| language | `text DEFAULT 'th'::text` | ได้ | — |
| currency | `text DEFAULT 'USD'::text` | ได้ | — |
| email_verified | `boolean DEFAULT false` | ได้ | — |
| account_status | `text DEFAULT 'active'::text` | ได้ | — |
| registration_ip | `inet` | ได้ | — |
| device_fingerprint | `text` | ได้ | — |
| user_agent | `text` | ได้ | — |
| last_login_at | `timestamp with time zone` | ได้ | — |
| created_at | `timestamp with time zone DEFAULT now()` | ได้ | — |
| updated_at | `timestamp with time zone DEFAULT now()` | ได้ | — |
| terminal_symbol | `text DEFAULT 'XAUUSD'::text` | ได้ | — |
| terminal_interval | `text DEFAULT '60'::text` | ได้ | — |

## public.assets

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `uuid NOT NULL DEFAULT uuid_generate_v4()` | ไม่ได้ | — |
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| name | `text NOT NULL` | ไม่ได้ | — |
| symbol | `text NOT NULL` | ไม่ได้ | — |
| asset_type | `text DEFAULT 'stock'::text` | ได้ | — |
| value_usd | `numeric NOT NULL DEFAULT 0` | ไม่ได้ | — |
| quantity | `numeric DEFAULT 0` | ได้ | — |
| avg_purchase_price | `numeric` | ได้ | — |
| current_price | `numeric` | ได้ | — |
| change_24h | `numeric` | ได้ | — |
| change_percentage | `numeric` | ได้ | — |
| allocation_target | `numeric DEFAULT 0` | ได้ | — |
| allocation_current | `numeric DEFAULT 0` | ได้ | — |
| sector | `text` | ได้ | — |
| country | `text` | ได้ | — |
| notes | `text` | ได้ | — |
| is_active | `boolean DEFAULT true` | ได้ | — |
| created_at | `timestamp with time zone DEFAULT now()` | ได้ | — |
| updated_at | `timestamp with time zone DEFAULT now()` | ได้ | — |
| is_favorite | `boolean DEFAULT false` | ได้ | — |
| sort_order | `integer DEFAULT 0` | ได้ | — |
| allocation | `text` | ได้ | — |
| portfolio_id | `uuid` | ได้ | public.portfolios.id |
| brokerage_account_id | `uuid` | ได้ | public.brokerage_accounts.id |

## public.trades

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `uuid NOT NULL DEFAULT uuid_generate_v4()` | ไม่ได้ | — |
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| asset_id | `uuid` | ได้ | public.assets.id |
| asset_name | `text NOT NULL` | ไม่ได้ | — |
| symbol | `text NOT NULL` | ไม่ได้ | — |
| type | `text NOT NULL CHECK (type = ANY (ARRAY['BUY'::text, 'SELL'::text, 'DIVIDEND'::text, 'SHORT'::text, 'COVER'::text, 'IMPORT'::text]))` | ไม่ได้ | — |
| amount_usd | `numeric NOT NULL` | ไม่ได้ | — |
| quantity | `numeric NOT NULL` | ไม่ได้ | — |
| price_at_execution | `numeric NOT NULL` | ไม่ได้ | — |
| currency | `text DEFAULT 'USD'::text` | ได้ | — |
| exchange_rate_at_time | `numeric DEFAULT 1` | ได้ | — |
| fees | `numeric DEFAULT 0` | ได้ | — |
| taxes | `numeric DEFAULT 0` | ได้ | — |
| total_cost | `numeric` | ได้ | — |
| profit_loss | `numeric` | ได้ | — |
| profit_loss_percentage | `numeric` | ได้ | — |
| execution_date | `timestamp with time zone DEFAULT now()` | ได้ | — |
| settlement_date | `timestamp with time zone` | ได้ | — |
| status | `text DEFAULT 'completed'::text` | ได้ | — |
| notes | `text` | ได้ | — |
| tags | `ARRAY` | ได้ | — |
| created_at | `timestamp with time zone DEFAULT now()` | ได้ | — |
| updated_at | `timestamp with time zone DEFAULT now()` | ได้ | — |
| original_amount | `numeric` | ได้ | — |
| portfolio_id | `uuid` | ได้ | public.portfolios.id |
| brokerage_account_id | `uuid` | ได้ | public.brokerage_accounts.id |

## public.allocations

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `uuid NOT NULL DEFAULT uuid_generate_v4()` | ไม่ได้ | — |
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| label | `text NOT NULL` | ไม่ได้ | — |
| value | `numeric DEFAULT 0` | ได้ | — |
| color | `text` | ได้ | — |
| created_at | `timestamp with time zone DEFAULT now()` | ได้ | — |
| updated_at | `timestamp with time zone DEFAULT now()` | ได้ | — |
| portfolio_id | `uuid` | ได้ | public.portfolios.id |

## public.money_buckets

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `uuid NOT NULL DEFAULT uuid_generate_v4()` | ไม่ได้ | — |
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| name | `text NOT NULL` | ไม่ได้ | — |
| target_percent | `numeric DEFAULT 0` | ได้ | — |
| current_amount | `numeric DEFAULT 0` | ได้ | — |
| color | `text` | ได้ | — |
| icon | `text` | ได้ | — |
| linked_to_expenses | `boolean DEFAULT false` | ได้ | — |
| created_at | `timestamp with time zone DEFAULT now()` | ได้ | — |
| updated_at | `timestamp with time zone DEFAULT now()` | ได้ | — |
| target_amount | `numeric DEFAULT 0` | ได้ | — |
| currency | `character varying NOT NULL DEFAULT 'USD'::character varying` | ไม่ได้ | — |
| portfolio_id | `uuid` | ได้ | public.portfolios.id |

## public.bucket_activities

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `uuid NOT NULL DEFAULT uuid_generate_v4()` | ไม่ได้ | — |
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| bucket_id | `uuid` | ได้ | public.money_buckets.id |
| type | `text NOT NULL CHECK (type = ANY (ARRAY['deposit'::text, 'withdraw'::text, 'income_split'::text, 'invest'::text, 'profit_split'::text]))` | ไม่ได้ | — |
| amount | `numeric NOT NULL` | ไม่ได้ | — |
| note | `text` | ได้ | — |
| date | `timestamp with time zone NOT NULL` | ไม่ได้ | — |
| created_at | `timestamp with time zone DEFAULT now()` | ได้ | — |
| currency | `character varying` | ได้ | — |
| rate_at_time | `numeric` | ได้ | — |
| original_amount | `numeric` | ได้ | — |
| portfolio_id | `uuid` | ได้ | public.portfolios.id |
| brokerage_entry_id | `uuid` | ได้ | public.brokerage_cash_entries.id |

## public.cash_activities

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `uuid NOT NULL DEFAULT uuid_generate_v4()` | ไม่ได้ | — |
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| type | `text NOT NULL CHECK (type = ANY (ARRAY['INCOME'::text, 'EXPENSE'::text, 'DEPOSIT'::text, 'WITHDRAW'::text]))` | ไม่ได้ | — |
| amount | `numeric NOT NULL` | ไม่ได้ | — |
| category | `text NOT NULL` | ไม่ได้ | — |
| note | `text` | ได้ | — |
| date | `timestamp with time zone NOT NULL` | ไม่ได้ | — |
| created_at | `timestamp with time zone DEFAULT now()` | ได้ | — |
| time | `text` | ได้ | — |
| bucket_id | `uuid` | ได้ | public.money_buckets.id |
| is_transfer | `boolean DEFAULT false` | ได้ | — |
| currency | `character varying` | ได้ | — |
| rate_at_time | `numeric` | ได้ | — |
| original_amount | `numeric` | ได้ | — |
| portfolio_id | `uuid` | ได้ | public.portfolios.id |
| brokerage_entry_id | `uuid` | ได้ | public.brokerage_cash_entries.id |
| funding_details | `jsonb` | ได้ | — |

## public.trade_journal

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `uuid NOT NULL DEFAULT gen_random_uuid()` | ไม่ได้ | — |
| user_id | `uuid` | ได้ | auth.users.id |
| symbol | `text NOT NULL` | ไม่ได้ | — |
| market | `text NOT NULL` | ไม่ได้ | — |
| timeframe | `text NOT NULL` | ไม่ได้ | — |
| status | `text DEFAULT 'OPEN'::text` | ได้ | — |
| entries | `jsonb DEFAULT '[]'::jsonb` | ได้ | — |
| stop_loss | `numeric` | ได้ | — |
| take_profits | `jsonb DEFAULT '[]'::jsonb` | ได้ | — |
| avg_entry | `numeric` | ได้ | — |
| total_pnl | `numeric DEFAULT 0` | ได้ | — |
| notes | `text` | ได้ | — |
| opened_at | `timestamp with time zone DEFAULT now()` | ได้ | — |
| closed_at | `timestamp with time zone` | ได้ | — |
| created_at | `timestamp with time zone DEFAULT now()` | ได้ | — |
| signal_data | `jsonb` | ได้ | — |
| portfolio_id | `uuid` | ได้ | public.portfolios.id |

## public.dca_drafts

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `uuid NOT NULL DEFAULT gen_random_uuid()` | ไม่ได้ | — |
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| symbol | `text NOT NULL` | ไม่ได้ | — |
| entries | `jsonb NOT NULL DEFAULT '[]'::jsonb` | ไม่ได้ | — |
| updated_at | `timestamp with time zone DEFAULT now()` | ได้ | — |
| portfolio_id | `uuid` | ได้ | public.portfolios.id |

## public.portfolio_snapshots

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `uuid NOT NULL DEFAULT uuid_generate_v4()` | ไม่ได้ | — |
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| total_value | `numeric NOT NULL DEFAULT 0` | ไม่ได้ | — |
| date | `date NOT NULL` | ไม่ได้ | — |
| created_at | `timestamp with time zone DEFAULT now()` | ได้ | — |

## public.user_categories

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `uuid NOT NULL DEFAULT gen_random_uuid()` | ไม่ได้ | — |
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| type | `character varying NOT NULL CHECK (type::text = ANY (ARRAY['INCOME'::character varying, 'EXPENSE'::character varying]::text[]))` | ไม่ได้ | — |
| label | `character varying NOT NULL` | ไม่ได้ | — |
| icon | `character varying NOT NULL DEFAULT '🏷️'::character varying` | ไม่ได้ | — |
| created_at | `timestamp with time zone NOT NULL DEFAULT now()` | ไม่ได้ | — |
| portfolio_id | `uuid` | ได้ | public.portfolios.id |

## public.portfolios

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `uuid NOT NULL DEFAULT gen_random_uuid()` | ไม่ได้ | — |
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| name | `text NOT NULL CHECK (char_length(TRIM(BOTH FROM name)) >= 1 AND char_length(TRIM(BOTH FROM name)) <= 80)` | ไม่ได้ | — |
| color | `text NOT NULL DEFAULT '#ADC6FF'::text` | ไม่ได้ | — |
| is_default | `boolean NOT NULL DEFAULT false` | ไม่ได้ | — |
| created_at | `timestamp with time zone NOT NULL DEFAULT now()` | ไม่ได้ | — |
| updated_at | `timestamp with time zone NOT NULL DEFAULT now()` | ไม่ได้ | — |
| kind | `text NOT NULL DEFAULT 'trading'::text CHECK (kind = ANY (ARRAY['trading'::text, 'cash_management'::text]))` | ไม่ได้ | — |

## public.history_events

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `uuid NOT NULL DEFAULT gen_random_uuid()` | ไม่ได้ | — |
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| portfolio_id | `uuid` | ได้ | — |
| source_table | `text NOT NULL CHECK (source_table = 'trades'::text)` | ไม่ได้ | — |
| source_record_id | `uuid NOT NULL` | ไม่ได้ | — |
| action | `text NOT NULL CHECK (action = ANY (ARRAY['CREATED'::text, 'UPDATED'::text, 'DELETED'::text]))` | ไม่ได้ | — |
| transaction_type | `text NOT NULL` | ไม่ได้ | — |
| asset_symbol | `text` | ได้ | — |
| quantity | `numeric` | ได้ | — |
| price | `numeric` | ได้ | — |
| gross_amount | `numeric NOT NULL DEFAULT 0` | ไม่ได้ | — |
| fees | `numeric NOT NULL DEFAULT 0` | ไม่ได้ | — |
| taxes | `numeric NOT NULL DEFAULT 0` | ไม่ได้ | — |
| net_amount | `numeric NOT NULL DEFAULT 0` | ไม่ได้ | — |
| currency | `text` | ได้ | — |
| exchange_rate | `numeric` | ได้ | — |
| realized_pnl | `numeric` | ได้ | — |
| unrealized_pnl | `numeric` | ได้ | — |
| category | `text` | ได้ | — |
| related_bucket_id | `uuid` | ได้ | — |
| note | `text` | ได้ | — |
| occurred_at | `timestamp with time zone NOT NULL` | ไม่ได้ | — |
| recorded_at | `timestamp with time zone NOT NULL DEFAULT now()` | ไม่ได้ | — |
| metadata | `jsonb NOT NULL DEFAULT '{}'::jsonb` | ไม่ได้ | — |

## public.brokerage_accounts

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `uuid NOT NULL DEFAULT gen_random_uuid()` | ไม่ได้ | — |
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| portfolio_id | `uuid NOT NULL` | ไม่ได้ | public.portfolios.id |
| name | `text NOT NULL CHECK (char_length(TRIM(BOTH FROM name)) >= 1 AND char_length(TRIM(BOTH FROM name)) <= 80)` | ไม่ได้ | — |
| broker | `text` | ได้ | — |
| currency | `text NOT NULL DEFAULT 'USD'::text CHECK (currency = ANY (ARRAY['USD'::text, 'THB'::text, 'JPY'::text, 'EUR'::text]))` | ไม่ได้ | — |
| color | `text NOT NULL DEFAULT '#ADC6FF'::text` | ไม่ได้ | — |
| created_at | `timestamp with time zone NOT NULL DEFAULT now()` | ไม่ได้ | — |
| updated_at | `timestamp with time zone NOT NULL DEFAULT now()` | ไม่ได้ | — |
| kind | `text NOT NULL DEFAULT 'cash'::text CHECK (kind = ANY (ARRAY['cash'::text, 'asset_group'::text]))` | ไม่ได้ | — |

## public.brokerage_cash_entries

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `uuid NOT NULL DEFAULT gen_random_uuid()` | ไม่ได้ | — |
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| portfolio_id | `uuid NOT NULL` | ไม่ได้ | public.portfolios.id |
| brokerage_account_id | `uuid NOT NULL` | ไม่ได้ | public.brokerage_accounts.id |
| type | `text NOT NULL CHECK (type = ANY (ARRAY['DEPOSIT'::text, 'WITHDRAW'::text, 'TRADE_BUY'::text, 'TRADE_SELL'::text, 'ADJUSTMENT'::text]))` | ไม่ได้ | — |
| amount | `numeric NOT NULL CHECK (amount >= 0::numeric)` | ไม่ได้ | — |
| currency | `text NOT NULL CHECK (currency = ANY (ARRAY['USD'::text, 'THB'::text, 'JPY'::text, 'EUR'::text]))` | ไม่ได้ | — |
| trade_id | `uuid` | ได้ | public.trades.id |
| occurred_at | `timestamp with time zone NOT NULL DEFAULT now()` | ไม่ได้ | — |
| note | `text` | ได้ | — |
| created_at | `timestamp with time zone NOT NULL DEFAULT now()` | ไม่ได้ | — |

## public.cost_basis_methods

Primary key: `user_id, portfolio_id, symbol`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| portfolio_id | `uuid NOT NULL` | ไม่ได้ | public.portfolios.id |
| symbol | `text NOT NULL` | ไม่ได้ | — |
| method | `text NOT NULL CHECK (method = ANY (ARRAY['SPECIFIC_LOT'::text, 'FIFO'::text, 'HIFO'::text, 'AVERAGE'::text]))` | ไม่ได้ | — |

## public.cost_basis_sales

Primary key: `sell_id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| sell_id | `uuid NOT NULL` | ไม่ได้ | public.trades.id |
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| method | `text NOT NULL CHECK (method = ANY (ARRAY['SPECIFIC_LOT'::text, 'FIFO'::text, 'HIFO'::text, 'AVERAGE'::text]))` | ไม่ได้ | — |
| selections | `jsonb NOT NULL DEFAULT '[]'::jsonb` | ไม่ได้ | — |
| request | `jsonb NOT NULL DEFAULT '{}'::jsonb` | ไม่ได้ | — |

## public.cost_basis_revisions

Primary key: `id`

| คอลัมน์ | Type / default / constraint ตามเอกสาร | NULL ได้ | FK |
|---|---|---|---|
| id | `bigint GENERATED ALWAYS AS IDENTITY NOT NULL` | ไม่ได้ | — |
| user_id | `uuid NOT NULL` | ไม่ได้ | auth.users.id |
| portfolio_id | `uuid NOT NULL` | ไม่ได้ | public.portfolios.id |
| symbol | `text NOT NULL` | ไม่ได้ | — |
| reason | `text NOT NULL` | ไม่ได้ | — |
| snapshot | `jsonb NOT NULL` | ไม่ได้ | — |
| created_at | `timestamp with time zone NOT NULL DEFAULT now()` | ไม่ได้ | — |


