-- Private, audited reconciliation for verified imported history only. No API grant.
CREATE TABLE trade_import_private.cost_reconcile_context (
  pid integer NOT NULL, tx bigint NOT NULL, owner uuid NOT NULL, portfolio uuid NOT NULL,
  PRIMARY KEY(pid,tx,owner,portfolio)
);
ALTER TABLE trade_import_private.cost_reconcile_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trade_import_private.cost_reconcile_context FROM PUBLIC,anon,authenticated;

CREATE FUNCTION trade_import_private.reconcile_cost_history(p_port uuid,p_method text,p_include_fees boolean,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid:=auth.uid(); sym text; item jsonb; t public.trades%ROWTYPE; gross numeric;
  before_states jsonb:='{}'; after_states jsonb:='{}'; original_trades jsonb; original_sales jsonb; old_portfolio jsonb;
  lots jsonb; allocated_cuts jsonb; cut jsonb; idx integer; snapshot jsonb;
  before_cash text; after_cash text; original_fees numeric; new_fees numeric; old_qty numeric; new_qty numeric;
BEGIN
  IF owner_id IS NULL OR p_method IS NULL OR p_method NOT IN ('COMPRESSED_FIFO','FIFO','PROPORTIONAL') OR p_include_fees IS NULL THEN RAISE EXCEPTION 'Invalid reconciliation'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text||p_port::text||'trade-history-import',0));
  SELECT to_jsonb(p) INTO old_portfolio FROM public.portfolios p WHERE id=p_port AND user_id=owner_id AND kind='trading' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Portfolio access denied'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)=0 OR jsonb_array_length(p_rows)<> (SELECT count(*) FROM public.trades WHERE user_id=owner_id AND portfolio_id=p_port)
    OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_rows))<>jsonb_array_length(p_rows) THEN RAISE EXCEPTION 'Supply one verified source row for every imported trade'; END IF;
  IF EXISTS(SELECT 1 FROM public.trades WHERE user_id=owner_id AND portfolio_id=p_port AND (brokerage_account_id IS NOT NULL OR NOT coalesce('Excel import'=ANY(tags),false) OR type NOT IN ('IMPORT','SELL','DIVIDEND'))) THEN RAISE EXCEPTION 'Only imported history without cash settlement can be reconciled'; END IF;
  FOR sym IN SELECT DISTINCT upper(symbol) FROM public.trades WHERE user_id=owner_id AND portfolio_id=p_port ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text||p_port::text||sym,0));
    before_states:=before_states||jsonb_build_object(sym,public.cb_replay(owner_id,p_port,sym));
  END LOOP;
  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.execution_date,r.created_at,r.id),coalesce(sum(fees),0) INTO original_trades,original_fees FROM public.trades r WHERE user_id=owner_id AND portfolio_id=p_port;
  SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sell_id) INTO original_sales FROM public.cost_basis_sales s JOIN public.trades r ON r.id=s.sell_id WHERE r.user_id=owner_id AND r.portfolio_id=p_port;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]')::text) INTO before_cash FROM public.brokerage_cash_entries e WHERE e.user_id=owner_id AND e.portfolio_id=p_port;
  INSERT INTO trade_import_private.cost_reconcile_context VALUES(pg_backend_pid(),txid_current(),owner_id,p_port);
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    SELECT * INTO t FROM public.trades WHERE id=(item->>'id')::uuid AND user_id=owner_id AND portfolio_id=p_port FOR UPDATE;
    IF NOT FOUND OR t.quantity IS DISTINCT FROM (item->>'old_quantity')::numeric OR t.amount_usd IS DISTINCT FROM (item->>'old_amount')::numeric OR coalesce(t.fees,0) IS DISTINCT FROM (item->>'old_fee')::numeric THEN RAISE EXCEPTION 'Trade changed since verification'; END IF;
    gross:=(item->>'gross')::numeric;
    IF gross IS NULL OR gross<=0 OR gross::text IN ('NaN','Infinity','-Infinity') OR t.exchange_rate_at_time<=0 THEN RAISE EXCEPTION 'Invalid verified gross'; END IF;
    UPDATE public.trades SET amount_usd=gross/t.exchange_rate_at_time,original_amount=gross,
      price_at_execution=CASE WHEN t.quantity>0 THEN gross/t.exchange_rate_at_time/t.quantity ELSE gross/t.exchange_rate_at_time END,
      import_identity=coalesce(t.import_identity,jsonb_build_object('quantity',t.quantity,'price',t.price_at_execution*t.exchange_rate_at_time,'fees',coalesce(t.fees,0)*t.exchange_rate_at_time))||jsonb_build_object('verified_gross',gross)
      WHERE id=t.id;
  END LOOP;
  DELETE FROM trade_import_private.cost_reconcile_context WHERE pid=pg_backend_pid() AND tx=txid_current() AND owner=owner_id AND portfolio=p_port;
  UPDATE public.portfolios SET import_cost_method=p_method,cost_include_fees=p_include_fees WHERE id=p_port AND user_id=owner_id;
  FOR sym IN SELECT DISTINCT upper(symbol) FROM public.trades WHERE user_id=owner_id AND portfolio_id=p_port ORDER BY 1 LOOP
    lots:='[]';
    FOR t IN SELECT * FROM public.trades WHERE user_id=owner_id AND portfolio_id=p_port AND upper(symbol)=sym AND type IN ('IMPORT','SELL') ORDER BY execution_date,created_at,id LOOP
      IF t.type='IMPORT' THEN
        lots:=lots||jsonb_build_array(jsonb_build_object('id',t.id,'date',t.execution_date,'remaining',t.quantity::text));
      ELSE
        allocated_cuts:=trade_import_private.allocate_sale(lots,t.quantity,p_method);
        UPDATE public.cost_basis_sales SET method='SPECIFIC_LOT',selections=allocated_cuts,request=request||jsonb_build_object('closeMode',p_method,'selections',allocated_cuts,'reconciled',true) WHERE sell_id=t.id AND user_id=owner_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Sale allocation missing'; END IF;
        FOR cut IN SELECT value FROM jsonb_array_elements(allocated_cuts) LOOP
          SELECT ordinality::integer-1 INTO idx FROM jsonb_array_elements(lots) WITH ORDINALITY WHERE value->>'id'=cut->>'lotId';
          lots:=jsonb_set(lots,ARRAY[idx::text,'remaining'],to_jsonb(((lots->idx->>'remaining')::numeric-(cut->>'qty')::numeric)::text));
        END LOOP;
      END IF;
    END LOOP;
    snapshot:=public.cb_replay(owner_id,p_port,sym);
    SELECT coalesce(sum((value->>'remaining')::numeric),0) INTO old_qty FROM jsonb_array_elements(before_states->sym->'lots');
    SELECT coalesce(sum((value->>'remaining')::numeric),0) INTO new_qty FROM jsonb_array_elements(snapshot->'lots');
    IF old_qty<>new_qty THEN RAISE EXCEPTION 'Reconciliation changed holdings'; END IF;
    after_states:=after_states||jsonb_build_object(sym,snapshot);
    UPDATE public.assets SET quantity=new_qty,avg_purchase_price=CASE WHEN new_qty>0 THEN (SELECT sum((value->>'cost')::numeric) FROM jsonb_array_elements(snapshot->'lots'))/new_qty ELSE 0 END,
      value_usd=coalesce(current_price,0)*new_qty,is_active=new_qty>0,updated_at=now() WHERE user_id=owner_id AND portfolio_id=p_port AND upper(symbol)=sym;
    INSERT INTO public.cost_basis_revisions(user_id,portfolio_id,symbol,reason,snapshot) VALUES(owner_id,p_port,sym,'VERIFIED IMPORT COST RECONCILIATION',jsonb_build_object('before',before_states->sym,'after',snapshot,'previousPortfolio',old_portfolio,'originalTrades',original_trades,'originalSales',original_sales,'verifiedRows',p_rows));
  END LOOP;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]')::text) INTO after_cash FROM public.brokerage_cash_entries e WHERE e.user_id=owner_id AND e.portfolio_id=p_port;
  SELECT coalesce(sum(fees),0) INTO new_fees FROM public.trades WHERE user_id=owner_id AND portfolio_id=p_port;
  IF before_cash<>after_cash OR original_fees<>new_fees THEN RAISE EXCEPTION 'Reconciliation changed cash or recorded fees'; END IF;
  RETURN jsonb_build_object('before',before_states,'after',after_states,'cashUnchanged',true,'feesUnchanged',true);
END $$;
REVOKE ALL ON FUNCTION trade_import_private.reconcile_cost_history(uuid,text,boolean,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cost_basis_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE state jsonb;
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text||NEW.portfolio_id::text||upper(NEW.symbol),0));
  IF NEW.type='SELL' AND coalesce(current_setting('app.cost_basis_write',true),'')<>'on' THEN RAISE EXCEPTION 'Use cost-basis sale preview'; END IF;
  IF NEW.type IN ('BUY','IMPORT') AND EXISTS(SELECT 1 FROM public.trades WHERE user_id=NEW.user_id AND portfolio_id=NEW.portfolio_id AND upper(symbol)=upper(NEW.symbol) AND type='SELL' AND execution_date>=NEW.execution_date) THEN RAISE EXCEPTION 'Backdated buy would change posted sales: ledger replay review required'; END IF;
  RETURN NEW;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(OLD.user_id::text||OLD.portfolio_id::text||upper(OLD.symbol),0));
 IF TG_OP='UPDATE' AND OLD.user_id=auth.uid() AND EXISTS(
   SELECT 1 FROM trade_import_private.cost_reconcile_context c WHERE c.pid=pg_backend_pid() AND c.tx=txid_current() AND c.owner=OLD.user_id AND c.portfolio=OLD.portfolio_id
 ) THEN
   IF OLD.brokerage_account_id IS NOT NULL OR (to_jsonb(NEW)-ARRAY['amount_usd','price_at_execution','original_amount','import_identity']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['amount_usd','price_at_execution','original_amount','import_identity']) THEN RAISE EXCEPTION 'Reconciliation may only correct verified imported gross amounts'; END IF;
   RETURN NEW;
 END IF;
 -- Only the owner-scoped split writer can change units on allocated lots.
 IF TG_OP='UPDATE' AND OLD.user_id=auth.uid() AND EXISTS(
  SELECT 1 FROM trade_import_private.split_write_context c WHERE c.pid=pg_backend_pid() AND c.tx=txid_current() AND c.owner=OLD.user_id AND c.portfolio=OLD.portfolio_id AND c.symbol=upper(OLD.symbol)
 ) THEN
  IF (to_jsonb(NEW)-ARRAY['quantity','price_at_execution','import_identity']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['quantity','price_at_execution','import_identity']) THEN RAISE EXCEPTION 'Split writer may only change share units'; END IF;
  RETURN NEW;
 END IF;
 IF EXISTS(SELECT 1 FROM public.cost_basis_sales WHERE sell_id=OLD.id) THEN RAISE EXCEPTION 'Posted sale is append-only; use a ledger correction'; END IF;
 IF OLD.type IN ('BUY','IMPORT') THEN
  state:=public.cb_replay(OLD.user_id,OLD.portfolio_id,OLD.symbol);
  IF jsonb_array_length(state->'allocations')>0 THEN
    IF TG_OP='UPDATE' AND coalesce(current_setting('app.cost_basis_correct',true),'')='on' AND NEW.quantity=OLD.quantity AND NEW.symbol=OLD.symbol AND NEW.portfolio_id=OLD.portfolio_id AND NEW.execution_date=OLD.execution_date THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Lot has sales: original quantity is immutable; use correction/replay for price';
  END IF;
 END IF;
 IF OLD.type='SELL' THEN RAISE EXCEPTION 'Posted sale is append-only; use a ledger correction'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $function$;
