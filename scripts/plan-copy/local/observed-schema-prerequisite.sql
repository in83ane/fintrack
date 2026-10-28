-- LOCAL SYNTHETIC BOOTSTRAP ONLY. After 008; before 009.
-- Reconstructed from the owner's read-only production structure report.
-- NOT original migration DDL. Grants/comments/other triggers were not supplied.
-- Do not apply to production, infer missing objects, or replace old migrations.
CREATE TABLE public.user_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type varchar NOT NULL,
  label varchar NOT NULL,
  icon varchar NOT NULL DEFAULT '🏷️',
  created_at timestamptz NOT NULL DEFAULT now(),
  portfolio_id uuid NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  CONSTRAINT user_categories_type_check CHECK ((type)::text = ANY (ARRAY['INCOME','EXPENSE']::text[])),
  CONSTRAINT user_categories_user_id_type_label_key UNIQUE (user_id,type,label)
);
CREATE INDEX idx_user_categories_user_type ON public.user_categories USING btree(user_id,type);
CREATE INDEX idx_user_categories_user_portfolio ON public.user_categories USING btree(user_id,portfolio_id);
ALTER TABLE public.user_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own categories" ON public.user_categories
  FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
ALTER TABLE public.assets ADD COLUMN allocation text NULL;
