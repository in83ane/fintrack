-- Persist the Terminal DCA assistant per user and symbol.
-- `entries` contains the entry lots, optional portfolio budget, and partial exits.

CREATE TABLE IF NOT EXISTS public.dca_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dca_drafts_user_symbol_key UNIQUE (user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_dca_drafts_user_symbol
ON public.dca_drafts (user_id, symbol);

ALTER TABLE public.dca_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own DCA drafts" ON public.dca_drafts;
CREATE POLICY "Users can manage own DCA drafts"
ON public.dca_drafts FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Some deployments created trade_journal from the standalone schema file.
-- Make the DCA assistant's signal snapshot safe on both fresh and existing DBs.
  CREATE TABLE IF NOT EXISTS public.trade_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  market text NOT NULL,
  timeframe text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  stop_loss numeric,
  take_profits jsonb NOT NULL DEFAULT '[]'::jsonb,
  avg_entry numeric,
  total_pnl numeric NOT NULL DEFAULT 0,
  signal_data jsonb,
  notes text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trade_journal
ADD COLUMN IF NOT EXISTS signal_data jsonb;

CREATE INDEX IF NOT EXISTS idx_trade_journal_user_closed
ON public.trade_journal (user_id, closed_at DESC);

ALTER TABLE public.trade_journal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own trade journal" ON public.trade_journal;
CREATE POLICY "Users can manage own trade journal"
ON public.trade_journal FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
