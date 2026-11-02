-- Native NAV metadata survives refresh; USD projections remain compatible.
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS currency text CHECK (currency IN ('USD','THB','EUR','JPY')),
  ADD COLUMN IF NOT EXISTS native_price numeric CHECK (native_price > 0),
  ADD COLUMN IF NOT EXISTS native_day_change numeric,
  ADD COLUMN IF NOT EXISTS quote_as_of date,
  ADD COLUMN IF NOT EXISTS quote_source text,
  ADD COLUMN IF NOT EXISTS exclude_from_total boolean NOT NULL DEFAULT false;
ALTER TABLE public.assets ALTER COLUMN current_price TYPE numeric;
ALTER TABLE public.assets ALTER COLUMN avg_purchase_price TYPE numeric;
-- Preserve the source identity when historical imports are normalized for a
-- corporate action. Re-importing the source file must still skip the same lot.
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS import_identity jsonb;
CREATE OR REPLACE FUNCTION trade_import_private.import_history(p_port uuid, p_rows jsonb, p_sale_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  owner_id uuid := auth.uid(); row_data jsonb; source_row integer; sym text; side text; ccy text;
  day date; occurred timestamptz; q numeric; px numeric; fee numeric; fx numeric; gross numeric;
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
        jsonb_build_object('source','Excel import','quantity',row_data->>'quantity','row',source_row)::text,jsonb_build_object('quantity',q,'price',px,'fees',fee));
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
