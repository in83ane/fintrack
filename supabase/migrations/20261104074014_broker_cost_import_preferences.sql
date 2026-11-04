-- Broker display conventions do not change cash settlement or stored fees.
ALTER TABLE public.portfolios ADD COLUMN import_cost_method text
  CHECK (import_cost_method IN ('PROPORTIONAL','FIFO','COMPRESSED_FIFO'));
ALTER TABLE public.portfolios ADD COLUMN cost_include_fees boolean NOT NULL DEFAULT true;

CREATE FUNCTION trade_import_private.allocate_sale(p_lots jsonb,p_quantity numeric,p_method text)
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
      min((value->>'date')::timestamptz) first_date,
      jsonb_agg(value ORDER BY (value->>'date')::timestamptz,value->>'id') lots,
      sum((value->>'remaining')::numeric) quantity
    FROM jsonb_array_elements(p_lots) WHERE (value->>'remaining')::numeric>0
    GROUP BY 1 ORDER BY 2,1
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
REVOKE ALL ON FUNCTION trade_import_private.allocate_sale(jsonb,numeric,text) FROM PUBLIC,anon;


CREATE OR REPLACE FUNCTION public.cb_replay(p_user uuid, p_port uuid, p_symbol text, p_override jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE events jsonb; e jsonb; lots jsonb:='[]'; allocations jsonb:='[]'; l jsonb; cuts jsonb; c jsonb;
 i integer; idx integer; q numeric; px numeric; f numeric; cost numeric; avg numeric; held numeric; basis numeric;
 leftq numeric; used numeric; cps numeric; pnl numeric; sf numeric; realized numeric:=0; invested numeric:=0;
 include_fees boolean; method text; selections jsonb; lotid text; tag text; matches integer; saleid text;
BEGIN
 SELECT coalesce(cost_include_fees,true) INTO include_fees FROM public.portfolios WHERE id=p_port AND user_id=p_user;
 include_fees:=coalesce(include_fees,true);
 SELECT coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('method',s.method,'selections',s.selections) ORDER BY t.execution_date,t.created_at,t.id),'[]') INTO events
 FROM public.trades t LEFT JOIN public.cost_basis_sales s ON s.sell_id=t.id
 WHERE t.user_id=p_user AND t.portfolio_id=p_port AND upper(t.symbol)=upper(p_symbol) AND t.type IN ('BUY','IMPORT','SELL');
 IF p_override IS NOT NULL THEN
   SELECT coalesce(jsonb_agg(value ORDER BY (value->>'execution_date')::timestamptz,value->>'created_at',value->>'id'),'[]') INTO events
   FROM (SELECT CASE WHEN value->>'id'=p_override->>'id' THEN value||p_override ELSE value END value FROM jsonb_array_elements(events)
     UNION ALL SELECT p_override WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(events) WHERE value->>'id'=p_override->>'id')) x;
 END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(events) LOOP
  q:=(e->>'quantity')::numeric; px:=(e->>'price_at_execution')::numeric; f:=coalesce((e->>'fees')::numeric,0)+coalesce((e->>'taxes')::numeric,0);
  IF q<>round(q,6) THEN RAISE EXCEPTION 'Maximum quantity precision is 6 decimals at %',e->>'id'; END IF;
  IF q IS NULL OR q<=0 OR q::text IN ('NaN','Infinity','-Infinity') OR px IS NULL OR px<=0 OR px::text IN ('NaN','Infinity','-Infinity') OR f<0 OR f::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid ledger event %',e->>'id'; END IF;
  IF NOT include_fees THEN f:=0; END IF;
  IF e->>'type' IN ('BUY','IMPORT') THEN
    cost:=coalesce((e->>'amount_usd')::numeric,px*q)+f;
    lots:=lots||jsonb_build_array(jsonb_build_object('id',e->>'id','date',e->>'execution_date','qty',q::text,'remaining',q::text,'cost',cost::text,'originalCost',cost::text,'price',px::text,'fee',f::text,'tags',e->'tags'));
    invested:=invested+cost; CONTINUE;
  END IF;
  saleid:=e->>'id'; method:=e->>'method'; selections:=e->'selections';
  IF method IS NULL THEN
    SELECT value INTO tag FROM jsonb_array_elements_text(coalesce(e->'tags','[]')) WHERE value ~ '^DCA partial exit from entry -?[0-9]+$' LIMIT 1;
    IF tag IS NULL THEN RAISE EXCEPTION 'NEEDS_REVIEW: sale % has no proven lot method',saleid; END IF;
    tag:=regexp_replace(tag,'^DCA partial exit from entry ','');
    SELECT count(*),min(value->>'id') INTO matches,lotid FROM jsonb_array_elements(lots)
    WHERE (value->'tags') ? ('DCA entry '||tag) OR (tag::numeric<0 AND -(('x'||replace(left(value->>'id',8),'-',''))::bit(32)::bigint)=tag::numeric);
    IF matches<>1 THEN RAISE EXCEPTION 'NEEDS_REVIEW: sale % has ambiguous lot %',saleid,tag; END IF;
    method:='SPECIFIC_LOT'; selections:=jsonb_build_array(jsonb_build_object('lotId',lotid,'qty',q::text));
  END IF;
  IF method NOT IN ('SPECIFIC_LOT','FIFO','HIFO','AVERAGE') THEN RAISE EXCEPTION 'Invalid method'; END IF;
  SELECT coalesce(sum((value->>'remaining')::numeric),0),coalesce(sum((value->>'cost')::numeric),0) INTO held,basis FROM jsonb_array_elements(lots);
  IF q>held THEN RAISE EXCEPTION 'Oversell at %: requested %, remaining %',saleid,q,held; END IF;
  IF method='AVERAGE' THEN
    avg:=basis/held;
    FOR i IN 0..jsonb_array_length(lots)-1 LOOP
      lots:=jsonb_set(lots,ARRAY[i::text,'cost'],to_jsonb(((lots->i->>'remaining')::numeric*avg)::text));
    END LOOP;
  END IF;
  cuts:='[]'; leftq:=q;
  IF method='SPECIFIC_LOT' THEN
    IF selections IS NULL OR jsonb_typeof(selections)<>'array' THEN RAISE EXCEPTION 'Select lots'; END IF;
    IF (SELECT count(*)<>count(DISTINCT value->>'lotId') FROM jsonb_array_elements(selections)) THEN RAISE EXCEPTION 'Duplicate lot selection'; END IF;
    FOR c IN SELECT value FROM jsonb_array_elements(selections) LOOP
      used:=(c->>'qty')::numeric;
      SELECT ordinality::integer-1,value INTO idx,l FROM jsonb_array_elements(lots) WITH ORDINALITY WHERE value->>'id'=c->>'lotId';
      IF NOT FOUND OR used IS NULL OR used<=0 OR used<>round(used,6) OR used::text IN ('NaN','Infinity','-Infinity') OR used>(l->>'remaining')::numeric THEN RAISE EXCEPTION 'Invalid quantity or oversell at % for lot %',saleid,c->>'lotId'; END IF;
      cuts:=cuts||jsonb_build_array(jsonb_build_object('idx',idx,'qty',used::text)); leftq:=leftq-used;
    END LOOP;
    IF leftq<>0 THEN RAISE EXCEPTION 'Selected quantity differs from sale %',saleid; END IF;
  ELSE
    FOR c IN SELECT jsonb_build_object('idx',ordinality-1,'lot',value) FROM jsonb_array_elements(lots) WITH ORDINALITY
      WHERE (value->>'remaining')::numeric>0
      ORDER BY CASE WHEN method='HIFO' THEN (value->>'cost')::numeric/(value->>'remaining')::numeric ELSE 0 END DESC,ordinality LOOP
      EXIT WHEN leftq=0;
      used:=least(leftq,(c->'lot'->>'remaining')::numeric);
      cuts:=cuts||jsonb_build_array(jsonb_build_object('idx',(c->>'idx')::integer,'qty',used::text)); leftq:=leftq-used;
    END LOOP;
  END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(cuts) LOOP
    idx:=(c->>'idx')::integer; used:=(c->>'qty')::numeric; l:=lots->idx;
    cps:=(l->>'cost')::numeric/(l->>'remaining')::numeric;
    cost:=CASE WHEN used=(l->>'remaining')::numeric THEN (l->>'cost')::numeric ELSE cps*used END;
    sf:=f*used/q; pnl:=coalesce((e->>'amount_usd')::numeric,px*q)*used/q-cost-sf;
    allocations:=allocations||jsonb_build_array(jsonb_build_object('sellId',saleid,'lotId',l->>'id','date',e->>'execution_date','method',method,'qtyClosed',used::text,'costPerShare',cps::text,'cost',cost::text,'sellPrice',px::text,'sellFee',sf::text,'realizedPnl',pnl::text));
    lots:=jsonb_set(lots,ARRAY[idx::text,'remaining'],to_jsonb(((l->>'remaining')::numeric-used)::text));
    lots:=jsonb_set(lots,ARRAY[idx::text,'cost'],to_jsonb(((l->>'cost')::numeric-cost)::text));
    realized:=realized+pnl;
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('lots',lots,'allocations',allocations,'invested',invested::text,'realized',realized::text,'includeFees',include_fees,'fingerprint',md5(events::text||include_fees::text));
END $function$;

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
      INSERT INTO public.trades(id,user_id,portfolio_id,asset_name,symbol,type,quantity,price_at_execution,amount_usd,fees,currency,exchange_rate_at_time,original_amount,execution_date,tags,status,notes,import_identity)
      VALUES(trade_id,owner_id,p_port,sym,sym,CASE WHEN side='BUY' THEN 'IMPORT' ELSE side END,q,px/fx,gross/fx,fee/fx,ccy,fx,gross,occurred,ARRAY['Excel import'],'completed',
        jsonb_build_object('source','Excel import','quantity',row_data->>'quantity','row',source_row)::text,jsonb_build_object('quantity',source_q,'price',source_px,'fees',fee,'basis_date',basis_day,'split_base_quantity',(row_data->>'quantity')::numeric,'split_factor',factor));
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
REVOKE ALL ON FUNCTION trade_import_private.import_history(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trade_import_private.import_history(uuid,jsonb,text) TO authenticated;

CREATE FUNCTION public.import_trade_history_with_policy(p_port uuid,p_rows jsonb,p_policy jsonb,p_splits jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.portfolios%ROWTYPE; method text:=p_policy->>'method'; include_fees boolean; imported jsonb; split_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before importing'; END IF;
  IF method IS NULL OR method NOT IN ('PROPORTIONAL','FIFO','COMPRESSED_FIFO') OR jsonb_typeof(p_policy->'includeFees') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Confirm a cost method and fee policy before importing'; END IF;
  include_fees:=(p_policy->>'includeFees')::boolean;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_port::text||'trade-history-import',0));
  SELECT * INTO p FROM public.portfolios WHERE id=p_port AND user_id=auth.uid() AND kind='trading' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Portfolio access denied'; END IF;
  IF EXISTS(SELECT 1 FROM public.trades WHERE user_id=auth.uid() AND portfolio_id=p_port)
    AND (p.cost_include_fees<>include_fees OR (p.import_cost_method IS NOT NULL AND p.import_cost_method<>method)) THEN
    RAISE EXCEPTION 'Existing portfolio uses a different cost policy. Reconcile its history before changing methods, or import into a new portfolio.';
  END IF;
  UPDATE public.portfolios SET import_cost_method=method,cost_include_fees=include_fees WHERE id=p_port;
  split_result:=trade_import_private.apply_splits(p_port,p_splits);
  imported:=trade_import_private.import_history(p_port,p_rows,method);
  RETURN imported||jsonb_build_object('splits',split_result,'costPolicy',p_policy);
END $$;
REVOKE ALL ON FUNCTION public.import_trade_history_with_policy(uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_trade_history_with_policy(uuid,jsonb,jsonb,jsonb) TO authenticated;
