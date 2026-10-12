-- Atomic corrections. No existing financial records are modified on install.
CREATE OR REPLACE FUNCTION public.protect_funding_activity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.brokerage_entry_id IS NOT NULL AND NOT (
    current_user = 'postgres' AND COALESCE(current_setting('app.correct_funding', true), '') = 'on'
  ) THEN RAISE EXCEPTION 'A broker funding transfer cannot be changed on only one side'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_broker_cash_movement(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE e public.brokerage_cash_entries%ROWTYPE; c public.cash_activities%ROWTYPE; balance numeric;
BEGIN
  SELECT * INTO e FROM public.brokerage_cash_entries WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF e.trade_id IS NOT NULL THEN RAISE EXCEPTION 'Delete the linked trade instead'; END IF;
  SELECT * INTO c FROM public.cash_activities WHERE brokerage_entry_id=p_id AND user_id=auth.uid();
  IF c.bucket_id IS NOT NULL THEN
    PERFORM 1 FROM public.money_buckets WHERE id=c.bucket_id AND user_id=auth.uid() FOR UPDATE;
  END IF;
  PERFORM 1 FROM public.brokerage_accounts WHERE id=e.brokerage_account_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended(e.brokerage_account_id::text,0));
  PERFORM set_config('app.correct_funding','on',true);
  PERFORM set_config('app.allow_brokerage_ledger_mutation','on',true);
  DELETE FROM public.bucket_activities WHERE brokerage_entry_id=p_id AND user_id=auth.uid();
  DELETE FROM public.cash_activities WHERE brokerage_entry_id=p_id AND user_id=auth.uid();
  DELETE FROM public.brokerage_cash_entries WHERE id=p_id AND user_id=auth.uid();
  IF EXISTS (SELECT 1 FROM public.brokerage_account_balances WHERE brokerage_account_id=e.brokerage_account_id AND cash_balance < -0.000001)
  THEN RAISE EXCEPTION 'Insufficient brokerage cash to reverse this deposit'; END IF;
  IF c.bucket_id IS NOT NULL AND c.type IN ('INCOME','DEPOSIT') THEN
    SELECT COALESCE(sum((CASE WHEN type IN ('INCOME','DEPOSIT') THEN 1 ELSE -1 END) *
      CASE WHEN currency=c.currency AND original_amount IS NOT NULL THEN original_amount ELSE amount * c.rate_at_time END),0)
    INTO balance FROM public.cash_activities WHERE bucket_id=c.bucket_id AND user_id=auth.uid();
    IF balance < -0.01 THEN RAISE EXCEPTION 'Insufficient Bucket balance to reverse this transfer'; END IF;
  END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.transfer_broker_to_bucket(p_id uuid,p_account_id uuid,p_bucket_id uuid,p_amount numeric,p_rate numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.brokerage_accounts%ROWTYPE; b public.money_buckets%ROWTYPE; usd numeric; received numeric; note_text text;
BEGIN
  IF auth.uid() IS NULL OR p_id IS NULL OR p_amount IS NULL OR p_rate IS NULL OR p_amount<=0 OR p_rate<=0
    OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_rate::text IN ('NaN','Infinity','-Infinity')
  THEN RAISE EXCEPTION 'Invalid transfer'; END IF;
  SELECT * INTO b FROM public.money_buckets WHERE id=p_bucket_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR b.currency IS NULL OR b.currency NOT IN ('USD','THB') OR NOT EXISTS(SELECT 1 FROM public.portfolios WHERE id=b.portfolio_id AND user_id=auth.uid() AND kind='cash_management') THEN RAISE EXCEPTION 'Invalid Bucket'; END IF;
  SELECT * INTO a FROM public.brokerage_accounts WHERE id=p_account_id AND user_id=auth.uid() AND kind='cash' FOR UPDATE;
  IF NOT FOUND OR a.currency NOT IN ('USD','THB') THEN RAISE EXCEPTION 'Invalid broker account'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(a.id::text,0));
  IF EXISTS(SELECT 1 FROM public.brokerage_cash_entries WHERE id=p_id) THEN
    IF EXISTS(SELECT 1 FROM public.cash_activities WHERE id=p_id AND user_id=auth.uid() AND bucket_id=b.id
      AND funding_details=jsonb_build_object('account_id',a.id,'amount',p_amount,'rate',p_rate)) THEN RETURN true; END IF;
    RAISE EXCEPTION 'Transfer ID conflict';
  END IF;
  IF (SELECT cash_balance FROM public.brokerage_account_balances WHERE brokerage_account_id=a.id)<p_amount THEN RAISE EXCEPTION 'Insufficient brokerage cash'; END IF;
  usd:=p_amount / CASE WHEN a.currency='USD' THEN 1 ELSE p_rate END;
  received:=round(usd * CASE WHEN b.currency='USD' THEN 1 ELSE p_rate END,2);
  IF received<=0 THEN RAISE EXCEPTION 'Received amount too small'; END IF;
  note_text:=format('Broker %s → Bucket %s · %s %s → %s %s',a.name,b.name,p_amount,a.currency,received,b.currency);
  INSERT INTO public.brokerage_cash_entries(id,user_id,portfolio_id,brokerage_account_id,type,amount,currency,note)
    VALUES(p_id,auth.uid(),a.portfolio_id,a.id,'WITHDRAW',p_amount,a.currency,note_text);
  INSERT INTO public.cash_activities(id,user_id,portfolio_id,type,amount,category,date,bucket_id,is_transfer,currency,rate_at_time,original_amount,note,brokerage_entry_id,funding_details)
    VALUES(p_id,auth.uid(),b.portfolio_id,'DEPOSIT',usd,'โอนจากโบรก',now(),b.id,true,b.currency,CASE WHEN b.currency='USD' THEN 1 ELSE p_rate END,received,note_text,p_id,jsonb_build_object('account_id',a.id,'amount',p_amount,'rate',p_rate));
  INSERT INTO public.bucket_activities(id,user_id,portfolio_id,bucket_id,type,amount,date,currency,rate_at_time,original_amount,note,brokerage_entry_id)
    VALUES(p_id,auth.uid(),b.portfolio_id,b.id,'deposit',received,now(),b.currency,CASE WHEN b.currency='USD' THEN 1 ELSE p_rate END,received,note_text,p_id);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_trade_journal_transactions(p_id uuid)
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.trade_journal%ROWTYPE; ids uuid[]; acct uuid; n integer; levels text[];
BEGIN
  SELECT * INTO j FROM public.trade_journal WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Journal not found'; END IF;
  SELECT array_agg(value->>'level') INTO levels FROM jsonb_array_elements(COALESCE(j.entries,'[]'::jsonb));
  -- New journals store the exact source purchase ID. Legacy DCA journals use
  -- the unique lot tag, but are refused when that tag has been reused.
  IF EXISTS (SELECT 1 FROM unnest(levels) level WHERE
    (SELECT count(*) FROM public.trades WHERE user_id=auth.uid() AND portfolio_id=j.portfolio_id
      AND upper(symbol)=upper(j.symbol) AND type='BUY' AND tags @> ARRAY['DCA entry '||level]) > 1)
    THEN RAISE EXCEPTION 'Ambiguous legacy journal: delete individual trades in Ledger'; END IF;
  SELECT array_agg(t.id) INTO ids FROM public.trades t WHERE t.user_id=auth.uid() AND t.portfolio_id=j.portfolio_id AND upper(t.symbol)=upper(j.symbol) AND (
    t.id::text IN (SELECT e->>'trade_id' FROM jsonb_array_elements(COALESCE(j.entries,'[]'::jsonb)) e)
    OR t.tags && ARRAY(SELECT 'DCA entry '||(e->>'level') FROM jsonb_array_elements(COALESCE(j.entries,'[]'::jsonb)) e WHERE e->>'trade_id' IS NULL)
    OR t.tags && ARRAY(SELECT 'DCA partial exit from entry '||unnest(levels))
  );
  FOR acct IN SELECT DISTINCT brokerage_account_id FROM public.trades WHERE id=ANY(ids) AND brokerage_account_id IS NOT NULL ORDER BY brokerage_account_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(acct::text,0));
  END LOOP;
  PERFORM set_config('app.allow_brokerage_ledger_mutation','on',true);
  DELETE FROM public.brokerage_cash_entries WHERE trade_id=ANY(ids) AND user_id=auth.uid();
  DELETE FROM public.trades WHERE id=ANY(ids) AND user_id=auth.uid();
  IF (SELECT COALESCE(sum(CASE WHEN type IN ('BUY','IMPORT') THEN quantity WHEN type='SELL' THEN -quantity ELSE 0 END),0) FROM public.trades WHERE user_id=auth.uid() AND portfolio_id=j.portfolio_id AND upper(symbol)=upper(j.symbol)) < -0.000001
    THEN RAISE EXCEPTION 'Other sales depend on these purchases; correct them in Ledger first'; END IF;
  IF EXISTS(SELECT 1 FROM public.brokerage_account_balances WHERE portfolio_id=j.portfolio_id AND user_id=auth.uid() AND cash_balance < -0.000001)
    THEN RAISE EXCEPTION 'Insufficient cash to reverse these trades'; END IF;
  DELETE FROM public.trade_journal WHERE id=p_id AND user_id=auth.uid();
  RETURN COALESCE(ids,ARRAY[]::uuid[]);
END; $$;

REVOKE ALL ON FUNCTION public.delete_broker_cash_movement(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.transfer_broker_to_bucket(uuid,uuid,uuid,numeric,numeric) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_trade_journal_transactions(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_broker_cash_movement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_broker_to_bucket(uuid,uuid,uuid,numeric,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_trade_journal_transactions(uuid) TO authenticated;
