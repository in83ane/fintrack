-- Keep equal-date purchases in execution order for FIFO in previews and posted sales.
CREATE OR REPLACE FUNCTION trade_import_private.allocate_sale(p_lots jsonb,p_quantity numeric,p_method text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE groups record; lot jsonb; held numeric; available numeric; remaining numeric;
  left_qty numeric:=p_quantity; group_qty numeric; group_left numeric; capacity numeric; cut numeric; selections jsonb:='[]';
BEGIN
  IF p_method IS NULL OR p_method NOT IN ('PROPORTIONAL','FIFO','COMPRESSED_FIFO') OR p_quantity IS NULL
    OR p_quantity<=0 OR p_quantity<>round(p_quantity,6) OR p_quantity::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid sale method or quantity'; END IF;
  SELECT coalesce(sum((value->>'remaining')::numeric),0) INTO available FROM jsonb_array_elements(p_lots);
  IF p_quantity>available THEN RAISE EXCEPTION 'Sale exceeds available shares'; END IF;
  FOR groups IN
    SELECT CASE p_method WHEN 'PROPORTIONAL' THEN 'all' WHEN 'FIFO' THEN value->>'id' ELSE ((value->>'date')::timestamptz AT TIME ZONE 'Asia/Bangkok')::date::text END AS group_key,
      min((value->>'date')::timestamptz) first_date, min(ordinality) first_order,
      jsonb_agg(value ORDER BY (value->>'date')::timestamptz,ordinality) lots,
      sum((value->>'remaining')::numeric) quantity
    FROM jsonb_array_elements(p_lots) WITH ORDINALITY WHERE (value->>'remaining')::numeric>0
    GROUP BY 1 ORDER BY first_date,first_order
  LOOP
    EXIT WHEN left_qty=0;
    held:=groups.quantity; group_qty:=least(left_qty,held); group_left:=group_qty; capacity:=held;
    FOR lot IN SELECT value FROM jsonb_array_elements(groups.lots) LOOP
      remaining:=(lot->>'remaining')::numeric; capacity:=capacity-remaining;
      cut:=least(remaining,group_left,greatest(trunc(group_qty*remaining/held,6),group_left-capacity));
      IF cut>0 THEN selections:=selections||jsonb_build_array(jsonb_build_object('lotId',lot->>'id','qty',cut::text)); END IF;
      group_left:=group_left-cut;
    END LOOP;
    IF group_left<>0 THEN RAISE EXCEPTION 'Incomplete allocation'; END IF;
    left_qty:=left_qty-group_qty;
  END LOOP;
  IF left_qty<>0 THEN RAISE EXCEPTION 'Incomplete allocation'; END IF;
  RETURN selections;
END $$;
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
  IF EXISTS(SELECT 1 FROM public.portfolios WHERE id=p_port AND import_cost_method<>p_sale_mode)
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) WHERE upper(value->>'type')='SELL') THEN
    RAISE EXCEPTION 'Import must use the saved portfolio cost policy';
  END IF;
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
      gross := coalesce((row_data->>'gross')::numeric,CASE WHEN side='DIVIDEND' THEN px ELSE px*(row_data->>'quantity')::numeric END);
      IF gross IS NULL OR gross<=0 OR gross::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid gross amount'; END IF;
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
      IF existing>=occurrence THEN
        IF row_data->>'gross' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.trades t
          WHERE t.user_id=owner_id AND t.portfolio_id=p_port AND upper(t.symbol)=sym
            AND t.type=CASE WHEN side='BUY' THEN 'IMPORT' ELSE side END AND 'Excel import'=ANY(t.tags) AND t.currency=ccy
            AND (t.execution_date AT TIME ZONE 'Asia/Bangkok')::date=day
            AND coalesce((t.import_identity->>'quantity')::numeric,t.quantity)=source_q
            AND abs(coalesce((t.import_identity->>'price')::numeric,t.price_at_execution*t.exchange_rate_at_time)-source_px)<0.00000001
            AND abs(t.amount_usd*t.exchange_rate_at_time-gross)<0.00000001) THEN
          RAISE EXCEPTION 'Imported trade already exists with a different gross amount; reconcile the original instead of duplicating it';
        END IF;
        skipped:=skipped+1; CONTINUE;
      END IF;
      IF side<>'DIVIDEND' THEN
       q:=round((row_data->>'quantity')::numeric*factor,6);
       IF q<=0 THEN RAISE EXCEPTION 'Split leaves less than the supported fractional share precision'; END IF;
       px:=gross/q;
      END IF;
      -- A date-only file orders executions within a trading day by its row order.
      -- Append to earlier date-only imports without crossing genuine timed executions.
      SELECT coalesce(max(t.execution_date)+interval '1 microsecond',occurred) INTO occurred
        FROM public.trades t WHERE t.portfolio_id=p_port AND t.user_id=owner_id AND upper(t.symbol)=sym
        AND 'Excel import'=ANY(t.tags) AND t.execution_date>=occurred AND t.execution_date<occurred+interval '1 second';
      trade_id := gen_random_uuid(); selections := '[]';
      IF side='SELL' THEN
        IF p_sale_mode IS NULL OR p_sale_mode NOT IN ('PROPORTIONAL','FIFO','COMPRESSED_FIFO') THEN RAISE EXCEPTION 'Confirm cost allocation for imported sales'; END IF;
        IF EXISTS (SELECT 1 FROM public.trades WHERE user_id=owner_id AND portfolio_id=p_port AND upper(symbol)=sym AND type='SELL' AND execution_date>occurred) THEN
          RAISE EXCEPTION 'An existing later sale requires correction review before importing this backdated sale';
        END IF;
        state := public.cb_replay(owner_id,p_port,sym);
        SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]'),coalesce(sum((value->>'remaining')::numeric),0)
          INTO eligible,held FROM jsonb_array_elements(state->'lots') WITH ORDINALITY
          WHERE (value->>'date')::timestamptz<=occurred AND (value->>'remaining')::numeric>0;
        IF q>held THEN RAISE EXCEPTION 'Sale quantity % exceeds % held on %',q,held,day; END IF;
        selections:=trade_import_private.allocate_sale(eligible,q,p_sale_mode);
        PERFORM set_config('app.cost_basis_write','on',true);
      END IF;
      INSERT INTO public.trades(id,user_id,portfolio_id,asset_name,symbol,type,quantity,price_at_execution,amount_usd,fees,currency,exchange_rate_at_time,original_amount,execution_date,tags,status,notes,created_at,import_identity)
      VALUES(trade_id,owner_id,p_port,sym,sym,CASE WHEN side='BUY' THEN 'IMPORT' ELSE side END,q,px/fx,gross/fx,fee/fx,ccy,fx,gross,occurred,ARRAY['Excel import'],'completed',
        jsonb_build_object('source','Excel import','quantity',row_data->>'quantity','row',source_row)::text,clock_timestamp(),jsonb_build_object('quantity',source_q,'price',source_px,'fees',fee,'basis_date',basis_day,'split_base_quantity',(row_data->>'quantity')::numeric,'split_factor',factor));
      IF side='SELL' THEN
        INSERT INTO public.cost_basis_sales(sell_id,user_id,method,selections,request)
        VALUES(trade_id,owner_id,'SPECIFIC_LOT',selections,jsonb_build_object('source','Excel import','closeMode',p_sale_mode,'row',row_data,'selections',selections));
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

ALTER FUNCTION public.import_trade_history_with_policy(uuid,jsonb,jsonb,jsonb) SET SCHEMA trade_import_private;
CREATE OR REPLACE FUNCTION trade_import_private.import_trade_history_with_policy(p_port uuid,p_rows jsonb,p_policy jsonb,p_splits jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.portfolios%ROWTYPE; method text:=p_policy->>'method'; include_fees boolean; imported jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before importing'; END IF;
  IF method IS NULL OR method NOT IN ('PROPORTIONAL','FIFO','COMPRESSED_FIFO') OR jsonb_typeof(p_policy->'includeFees') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Confirm a cost method and fee policy before importing'; END IF;
  include_fees:=(p_policy->>'includeFees')::boolean;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_port::text||'trade-history-import',0));
  SELECT * INTO p FROM public.portfolios WHERE id=p_port AND user_id=auth.uid() AND kind='trading' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Portfolio access denied'; END IF;
  IF EXISTS(SELECT 1 FROM public.trades WHERE user_id=auth.uid() AND portfolio_id=p_port)
    AND (p.cost_include_fees<>include_fees OR (p.import_cost_method IS NOT NULL AND p.import_cost_method<>method)
      OR (p.import_cost_method IS NULL AND method<>'PROPORTIONAL' AND EXISTS(
        SELECT 1 FROM public.trades WHERE user_id=auth.uid() AND portfolio_id=p_port AND type='SELL'))) THEN
    RAISE EXCEPTION 'Existing portfolio uses a different cost policy. Reconcile its history before changing methods, or import into a new portfolio.';
  END IF;
  UPDATE public.portfolios SET import_cost_method=method,cost_include_fees=include_fees WHERE id=p_port;
  imported:=trade_import_private.import_with_splits(p_port,p_rows,method,p_splits);
  RETURN imported||jsonb_build_object('costPolicy',p_policy);
END $$;

CREATE FUNCTION public.import_trade_history_with_policy(p_port uuid,p_rows jsonb,p_policy jsonb,p_splits jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT trade_import_private.import_trade_history_with_policy(p_port,p_rows,p_policy,p_splits)
$$;
REVOKE ALL ON FUNCTION public.import_trade_history_with_policy(uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_trade_history_with_policy(uuid,jsonb,jsonb,jsonb) TO authenticated;
