-- Retain source precision across repeated forward split conversions.
CREATE OR REPLACE FUNCTION trade_import_private.apply_splits(p_port uuid,p_splits jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 owner_id uuid:=auth.uid(); action jsonb; sym text; day date; num integer; den integer;
 factor numeric; old_action public.stock_splits; t public.trades; metadata jsonb;
 before_state jsonb; after_state jsonb; originals jsonb; old_selections jsonb;
 new_qty numeric; base_qty numeric; cumulative_factor numeric; final_qty numeric; final_cost numeric; applied integer:=0; skipped integer:=0;
BEGIN
 IF owner_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.portfolios WHERE id=p_port AND user_id=owner_id AND kind='trading') THEN RAISE EXCEPTION 'Portfolio access denied'; END IF;
 IF jsonb_typeof(p_splits) IS DISTINCT FROM 'array' OR jsonb_array_length(p_splits)>100 THEN RAISE EXCEPTION 'Invalid stock split list'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text||p_port::text||'trade-history-import',0));
 FOR sym IN SELECT DISTINCT upper(trim(value->>'symbol')) FROM jsonb_array_elements(p_splits) ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text||p_port::text||sym,0));
 END LOOP;
 FOR action IN SELECT value FROM jsonb_array_elements(p_splits) ORDER BY value->>'date',value->>'symbol' LOOP
  sym:=upper(trim(action->>'symbol')); day:=(action->>'date')::date;
  num:=(action->>'numerator')::integer; den:=(action->>'denominator')::integer;
  IF sym IS NULL OR sym !~ '^[A-Z0-9.^=-]{1,30}$' OR day IS NULL OR day<'1900-01-01'
   OR day>(now() AT TIME ZONE 'Asia/Bangkok')::date OR num IS NULL OR den IS NULL
   OR num NOT BETWEEN 1 AND 1000000 OR den NOT BETWEEN 1 AND 1000000 OR num=den
   OR coalesce(length(trim(action->>'source')),0) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid split symbol, date, ratio or source'; END IF;
  SELECT * INTO old_action FROM public.stock_splits WHERE user_id=owner_id AND portfolio_id=p_port AND symbol=sym AND effective_date=day;
  IF FOUND THEN
   IF old_action.numerator::numeric*den<>num::numeric*old_action.denominator THEN RAISE EXCEPTION 'Conflicting stock split for % on %',sym,day; END IF;
   skipped:=skipped+1; CONTINUE;
  END IF;
  IF EXISTS(SELECT 1 FROM public.trades WHERE user_id=owner_id AND portfolio_id=p_port AND upper(symbol)=sym AND type IN ('SHORT','COVER')) THEN RAISE EXCEPTION 'Short positions require separate corporate-action reconciliation'; END IF;
  factor:=num::numeric/den;
  before_state:=public.cb_replay(owner_id,p_port,sym);
  SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO originals FROM public.trades r WHERE r.user_id=owner_id AND r.portfolio_id=p_port AND upper(r.symbol)=sym;
  SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO old_selections FROM public.cost_basis_sales s JOIN public.trades r ON r.id=s.sell_id WHERE r.user_id=owner_id AND r.portfolio_id=p_port AND upper(r.symbol)=sym;
  INSERT INTO trade_import_private.split_write_context VALUES(pg_backend_pid(),txid_current(),owner_id,p_port,sym);
  FOR t IN SELECT * FROM public.trades WHERE user_id=owner_id AND portfolio_id=p_port AND upper(symbol)=sym AND type IN ('BUY','IMPORT','SELL') AND (execution_date AT TIME ZONE 'Asia/Bangkok')::date<day ORDER BY execution_date,created_at,id FOR UPDATE LOOP
   -- Files explicitly supplied in an already-adjusted share basis are not split again.
   IF coalesce((t.import_identity->>'basis_date')::date,(t.execution_date AT TIME ZONE 'Asia/Bangkok')::date)>=day THEN CONTINUE; END IF;
   -- Adopt prior audited one-off corrections without multiplying them twice.
   BEGIN metadata:=t.notes::jsonb; EXCEPTION WHEN OTHERS THEN metadata:=NULL; END;
   IF metadata->>'normalization'='stock split' AND metadata->>'effective_date'=day::text AND (metadata->>'ratio')::numeric=factor AND t.import_identity IS NOT NULL THEN CONTINUE; END IF;
   base_qty:=coalesce((t.import_identity->>'split_base_quantity')::numeric,t.amount_usd/nullif(t.price_at_execution,0),t.quantity);
   IF t.import_identity->>'split_base_quantity' IS NULL AND round(base_qty,6)<>t.quantity THEN base_qty:=t.quantity; END IF;
   cumulative_factor:=coalesce((t.import_identity->>'split_factor')::numeric,1)*factor;
   new_qty:=base_qty*cumulative_factor;
   IF (factor<1 AND new_qty<>round(new_qty,6)) OR round(new_qty,6)<=0 THEN RAISE EXCEPTION 'Split for % needs broker fractional-share reconciliation (more than 6 decimals)',sym; END IF;
   new_qty:=round(new_qty,6);
   IF EXISTS(SELECT 1 FROM public.cost_basis_sales s CROSS JOIN LATERAL jsonb_array_elements(s.selections) c WHERE s.sell_id=t.id AND (c->>'qty')::numeric*factor<>round((c->>'qty')::numeric*factor,6)) THEN RAISE EXCEPTION 'Split allocation needs broker fractional-share reconciliation'; END IF;
   UPDATE public.cost_basis_sales s SET selections=(SELECT coalesce(jsonb_agg(c||jsonb_build_object('qty',((c->>'qty')::numeric*factor)::text)),'[]') FROM jsonb_array_elements(s.selections) c) WHERE s.sell_id=t.id;
   UPDATE public.trades SET quantity=new_qty,price_at_execution=coalesce(amount_usd,quantity*price_at_execution)/new_qty,
    import_identity=coalesce(import_identity,jsonb_build_object('quantity',quantity,'price',price_at_execution*exchange_rate_at_time,'fees',coalesce(fees,0)*exchange_rate_at_time))||jsonb_build_object('split_base_quantity',base_qty,'split_factor',cumulative_factor)
   WHERE id=t.id;
  END LOOP;
  DELETE FROM trade_import_private.split_write_context WHERE pid=pg_backend_pid() AND tx=txid_current() AND owner=owner_id AND portfolio=p_port AND symbol=sym;
  after_state:=public.cb_replay(owner_id,p_port,sym);
  IF abs((before_state->>'invested')::numeric-(after_state->>'invested')::numeric)>0.00000001 THEN RAISE EXCEPTION 'Split changed invested cost'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(before_state->'allocations') b JOIN jsonb_array_elements(after_state->'allocations') a ON a->>'sellId'=b->>'sellId' AND a->>'lotId'=b->>'lotId' WHERE (b->>'date')::timestamptz < day::timestamp AT TIME ZONE 'Asia/Bangkok' AND abs((a->>'realizedPnl')::numeric-(b->>'realizedPnl')::numeric)>0.00000001) THEN RAISE EXCEPTION 'Split changed profit realized before the action'; END IF;
  INSERT INTO public.stock_splits(user_id,portfolio_id,symbol,effective_date,numerator,denominator,source) VALUES(owner_id,p_port,sym,day,num,den,trim(action->>'source'));
  INSERT INTO public.cost_basis_revisions(user_id,portfolio_id,symbol,reason,snapshot) VALUES(owner_id,p_port,sym,'STOCK SPLIT '||day||' '||num||':'||den,jsonb_build_object('action',action,'originalTrades',originals,'originalSales',old_selections,'before',before_state,'after',after_state));
  SELECT coalesce(sum((value->>'remaining')::numeric),0),coalesce(sum((value->>'cost')::numeric),0) INTO final_qty,final_cost FROM jsonb_array_elements(after_state->'lots');
  UPDATE public.assets SET quantity=final_qty,avg_purchase_price=CASE WHEN final_qty>0 THEN final_cost/final_qty ELSE 0 END,value_usd=coalesce(current_price,0)*final_qty,is_active=final_qty>0,updated_at=now() WHERE user_id=owner_id AND portfolio_id=p_port AND upper(symbol)=sym;
  applied:=applied+1;
 END LOOP;
 RETURN jsonb_build_object('applied',applied,'skipped',skipped);
END $$;
REVOKE ALL ON FUNCTION trade_import_private.apply_splits(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trade_import_private.apply_splits(uuid,jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION trade_import_private.import_history(p_port uuid, p_rows jsonb, p_sale_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  owner_id uuid := auth.uid(); row_data jsonb; source_row integer; sym text; side text; ccy text;
  day date; basis_day date; factor numeric; split_row record; source_q numeric; source_px numeric; occurred timestamptz; q numeric; px numeric; fee numeric; fx numeric; gross numeric;
  imported integer := 0; skipped integer := 0; occurrence integer; existing integer;
  seen jsonb := '{}'; row_key text; trade_id uuid; state jsonb; eligible jsonb; lot jsonb;
  held numeric; capacity numeric; left_qty numeric; cut numeric; remaining numeric;
  selections jsonb; final_qty numeric; final_cost numeric; touched text[] := '{}';
  previous_write text := coalesce(current_setting('app.cost_basis_write',true),'off');
BEGIN
  IF owner_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.portfolios WHERE id=p_port AND user_id=owner_id AND kind='trading') THEN
    RAISE EXCEPTION 'Portfolio access denied';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Import must contain 1 to 2000 rows';
  END IF;
  -- Serialize concurrent imports and take the same symbol locks as live trades.
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text||p_port::text||'trade-history-import',0));
  FOR sym IN SELECT DISTINCT upper(trim(value->>'symbol')) FROM jsonb_array_elements(p_rows) ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text||p_port::text||sym,0));
  END LOOP;
  FOR row_data IN SELECT value FROM jsonb_array_elements(p_rows) WITH ORDINALITY ORDER BY value->>'date',ordinality LOOP
    source_row := (row_data->>'row')::integer;
    BEGIN
      sym := upper(trim(row_data->>'symbol')); side := upper(row_data->>'type'); ccy := row_data->>'currency';
      IF sym IS NULL OR sym='' OR side IS NULL OR side NOT IN ('BUY','SELL','DIVIDEND') OR ccy IS NULL OR ccy NOT IN ('USD','THB') THEN
        RAISE EXCEPTION 'Invalid symbol, action or currency';
      END IF;
      IF (row_data->>'date') IS NULL OR (row_data->>'date') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid trade date'; END IF;
      day := (row_data->>'date')::date; occurred := day::timestamp AT TIME ZONE 'Asia/Bangkok';
      q := round((row_data->>'quantity')::numeric,6); px := (row_data->>'price')::numeric;
      fee := (row_data->>'fees')::numeric; fx := (row_data->>'rate')::numeric;
      IF q IS NULL OR px IS NULL OR fee IS NULL OR fx IS NULL OR q::text IN ('NaN','Infinity','-Infinity')
        OR px::text IN ('NaN','Infinity','-Infinity') OR fee::text IN ('NaN','Infinity','-Infinity') OR fx::text IN ('NaN','Infinity','-Infinity')
        OR px<=0 OR fee<0 OR fx<=0 OR (ccy='USD' AND fx<>1)
        OR (side<>'DIVIDEND' AND q<=0) OR (side='DIVIDEND' AND q<>0) THEN RAISE EXCEPTION 'Invalid quantity, price, fees or exchange rate'; END IF;
      basis_day:=coalesce((row_data->>'basisDate')::date,day);
      IF basis_day<day OR basis_day>(now() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION 'Invalid share basis date'; END IF;
      source_q:=q; source_px:=px;
      factor:=1;
      IF side<>'DIVIDEND' THEN
       FOR split_row IN SELECT numerator,denominator FROM public.stock_splits WHERE user_id=owner_id AND portfolio_id=p_port AND symbol=sym AND effective_date>basis_day ORDER BY effective_date LOOP
        factor:=factor*split_row.numerator/split_row.denominator;
       END LOOP;
      END IF;
      -- Preserve the source gross value even when share storage rounds to six decimals.
      gross := CASE WHEN side='DIVIDEND' THEN px ELSE px*(row_data->>'quantity')::numeric END;
      row_key := md5(jsonb_build_array(sym,side,day,q,px,fee,ccy)::text);
      occurrence := coalesce((seen->>row_key)::integer,0)+1;
      seen := jsonb_set(seen,ARRAY[row_key],to_jsonb(occurrence));
      -- Match historical imports in native currency, independent of today's FX.
      -- Count occurrences, so identical genuine rows in one file remain separate.
      SELECT count(*) INTO existing FROM public.trades t
      WHERE t.user_id=owner_id AND t.portfolio_id=p_port AND upper(t.symbol)=sym
        AND t.type=CASE WHEN side='BUY' THEN 'IMPORT' ELSE side END
        AND 'Excel import'=ANY(t.tags) AND t.currency=ccy
        AND (t.execution_date AT TIME ZONE 'Asia/Bangkok')::date=day AND coalesce((t.import_identity->>'quantity')::numeric,t.quantity)=q
        AND abs(coalesce((t.import_identity->>'price')::numeric,t.price_at_execution*t.exchange_rate_at_time)-px)<0.00000001
        AND abs(coalesce((t.import_identity->>'fees')::numeric,coalesce(t.fees,0)*t.exchange_rate_at_time)-fee)<0.00000001;
      IF existing>=occurrence THEN skipped:=skipped+1; CONTINUE; END IF;
      IF side<>'DIVIDEND' THEN
       q:=round((row_data->>'quantity')::numeric*factor,6);
       IF q<=0 THEN RAISE EXCEPTION 'Split leaves less than the supported fractional share precision'; END IF;
       px:=gross/q;
      END IF;
      trade_id := gen_random_uuid(); selections := '[]';
      IF side='SELL' THEN
        IF p_sale_mode IS DISTINCT FROM 'PROPORTIONAL' THEN RAISE EXCEPTION 'Confirm proportional cost allocation for imported sales'; END IF;
        IF EXISTS (SELECT 1 FROM public.trades WHERE user_id=owner_id AND portfolio_id=p_port AND upper(symbol)=sym AND type='SELL' AND execution_date>occurred) THEN
          RAISE EXCEPTION 'An existing later sale requires correction review before importing this backdated sale';
        END IF;
        state := public.cb_replay(owner_id,p_port,sym);
        SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]'),coalesce(sum((value->>'remaining')::numeric),0)
          INTO eligible,held FROM jsonb_array_elements(state->'lots') WITH ORDINALITY
          WHERE (value->>'date')::timestamptz<=occurred AND (value->>'remaining')::numeric>0;
        IF q>held THEN RAISE EXCEPTION 'Sale quantity % exceeds % held on %',q,held,day; END IF;
        capacity:=held; left_qty:=q;
        FOR lot IN SELECT value FROM jsonb_array_elements(eligible) LOOP
          remaining := (lot->>'remaining')::numeric; capacity:=capacity-remaining;
          cut := least(remaining,left_qty,greatest(trunc(q*remaining/held,6),left_qty-capacity));
          IF cut>0 THEN selections:=selections||jsonb_build_array(jsonb_build_object('lotId',lot->>'id','qty',cut::text)); END IF;
          left_qty:=left_qty-cut;
        END LOOP;
        IF left_qty<>0 THEN RAISE EXCEPTION 'Unable to allocate sale quantity'; END IF;
        PERFORM set_config('app.cost_basis_write','on',true);
      END IF;
      INSERT INTO public.trades(id,user_id,portfolio_id,asset_name,symbol,type,quantity,price_at_execution,amount_usd,fees,currency,exchange_rate_at_time,original_amount,execution_date,tags,status,notes,import_identity)
      VALUES(trade_id,owner_id,p_port,sym,sym,CASE WHEN side='BUY' THEN 'IMPORT' ELSE side END,q,px/fx,gross/fx,fee/fx,ccy,fx,gross,occurred,ARRAY['Excel import'],'completed',
        jsonb_build_object('source','Excel import','quantity',row_data->>'quantity','row',source_row)::text,jsonb_build_object('quantity',source_q,'price',source_px,'fees',fee,'basis_date',basis_day,'split_base_quantity',(row_data->>'quantity')::numeric,'split_factor',factor));
      IF side='SELL' THEN
        INSERT INTO public.cost_basis_sales(sell_id,user_id,method,selections,request)
        VALUES(trade_id,owner_id,'SPECIFIC_LOT',selections,jsonb_build_object('source','Excel import','closeMode','PROPORTIONAL','row',row_data,'selections',selections));
        state:=public.cb_replay(owner_id,p_port,sym);
        INSERT INTO public.cost_basis_revisions(user_id,portfolio_id,symbol,reason,snapshot)
          VALUES(owner_id,p_port,sym,'IMPORT SELL '||trade_id,state);
        PERFORM set_config('app.cost_basis_write',previous_write,true);
      END IF;
      IF NOT sym=ANY(touched) THEN touched:=array_append(touched,sym); END IF;
      imported:=imported+1;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Import row % (%): %',source_row,sym,SQLERRM;
    END;
  END LOOP;
  FOREACH sym IN ARRAY touched LOOP
    state:=public.cb_replay(owner_id,p_port,sym);
    SELECT coalesce(sum((value->>'remaining')::numeric),0),coalesce(sum((value->>'cost')::numeric),0)
      INTO final_qty,final_cost FROM jsonb_array_elements(state->'lots');
    UPDATE public.assets SET quantity=final_qty,avg_purchase_price=CASE WHEN final_qty>0 THEN final_cost/final_qty ELSE 0 END,
      value_usd=coalesce(current_price,0)*final_qty,is_active=final_qty>0,updated_at=now()
      WHERE user_id=owner_id AND portfolio_id=p_port AND upper(symbol)=sym;
  END LOOP;
  RETURN jsonb_build_object('imported',imported,'skipped',skipped);
END $$;
REVOKE ALL ON FUNCTION trade_import_private.import_history(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trade_import_private.import_history(uuid,jsonb,text) TO authenticated;
