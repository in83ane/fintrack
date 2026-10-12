-- Decimal ledger projection and immutable allocation revision snapshots.
-- Compatibility trades/cash stay in the same transaction; no existing cash is rewritten.
ALTER TABLE public.trades ALTER COLUMN amount_usd TYPE numeric, ALTER COLUMN price_at_execution TYPE numeric,
 ALTER COLUMN fees TYPE numeric, ALTER COLUMN original_amount TYPE numeric, ALTER COLUMN exchange_rate_at_time TYPE numeric;
CREATE TABLE public.cost_basis_methods (
 user_id uuid NOT NULL REFERENCES auth.users(id), portfolio_id uuid NOT NULL REFERENCES public.portfolios(id),
 symbol text NOT NULL, method text NOT NULL CHECK(method IN ('SPECIFIC_LOT','FIFO','HIFO','AVERAGE')),
 PRIMARY KEY(user_id,portfolio_id,symbol)
);
CREATE TABLE public.cost_basis_sales (
 sell_id uuid PRIMARY KEY REFERENCES public.trades(id), user_id uuid NOT NULL REFERENCES auth.users(id),
 method text NOT NULL CHECK(method IN ('SPECIFIC_LOT','FIFO','HIFO','AVERAGE')), selections jsonb NOT NULL DEFAULT '[]',
 request jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE public.cost_basis_revisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),
 portfolio_id uuid NOT NULL REFERENCES public.portfolios(id), symbol text NOT NULL,
 reason text NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cost_basis_revisions_scope ON public.cost_basis_revisions(user_id,portfolio_id,symbol,id DESC);
ALTER TABLE public.cost_basis_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_basis_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_basis_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_method ON public.cost_basis_methods FOR SELECT TO authenticated USING(user_id=(select auth.uid()));
CREATE POLICY own_sale ON public.cost_basis_sales FOR SELECT TO authenticated USING(user_id=(select auth.uid()));
CREATE POLICY own_revision ON public.cost_basis_revisions FOR SELECT TO authenticated USING(user_id=(select auth.uid()));
GRANT SELECT ON public.cost_basis_methods,public.cost_basis_sales,public.cost_basis_revisions TO authenticated;
REVOKE ALL ON public.cost_basis_methods,public.cost_basis_sales,public.cost_basis_revisions FROM anon;

-- Internal pure decimal replay. p_override replaces an existing record for a
-- correction preview, or appends a proposed sale. All numeric JSON fields are strings.
CREATE FUNCTION public.cb_replay(p_user uuid,p_port uuid,p_symbol text,p_override jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE events jsonb; e jsonb; lots jsonb:='[]'; allocations jsonb:='[]'; l jsonb; cuts jsonb; c jsonb;
 i integer; idx integer; q numeric; px numeric; f numeric; cost numeric; avg numeric; held numeric; basis numeric;
 leftq numeric; used numeric; cps numeric; pnl numeric; sf numeric; realized numeric:=0; invested numeric:=0;
 method text; selections jsonb; lotid text; tag text; matches integer; saleid text;
BEGIN
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
 RETURN jsonb_build_object('lots',lots,'allocations',allocations,'invested',invested::text,'realized',realized::text,'fingerprint',md5(events::text));
END $$;
REVOKE ALL ON FUNCTION public.cb_replay(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.cost_basis_preview(p_port uuid,p_symbol text,p_sale jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; proposed jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.portfolios WHERE id=p_port AND user_id=auth.uid() AND kind='trading') THEN RAISE EXCEPTION 'Portfolio access denied'; END IF;
 result:=public.cb_replay(auth.uid(),p_port,upper(p_symbol));
 IF p_sale IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM public.trades WHERE id=(p_sale->>'id')::uuid) THEN RAISE EXCEPTION 'Preview ID already exists'; END IF;
   proposed:=p_sale||jsonb_build_object('type','SELL','symbol',upper(p_symbol),'execution_date',now(),'amount_usd',((p_sale->>'quantity')::numeric*(p_sale->>'price_at_execution')::numeric)::text);
   result:=jsonb_build_object('before',result,'after',public.cb_replay(auth.uid(),p_port,upper(p_symbol),proposed));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.cost_basis_preview(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cost_basis_preview(uuid,text,jsonb) TO authenticated;

CREATE FUNCTION public.cost_basis_set_method(p_port uuid,p_symbol text,p_method text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.portfolios WHERE id=p_port AND user_id=auth.uid() AND kind='trading') THEN RAISE EXCEPTION 'Portfolio access denied'; END IF;
 INSERT INTO public.cost_basis_methods VALUES(auth.uid(),p_port,upper(trim(p_symbol)),p_method)
 ON CONFLICT(user_id,portfolio_id,symbol) DO UPDATE SET method=excluded.method;
END $$;
REVOKE ALL ON FUNCTION public.cost_basis_set_method(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cost_basis_set_method(uuid,text,text) TO authenticated;

CREATE FUNCTION public.cost_basis_sell(p_port uuid,p_symbol text,p_sale jsonb,p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_state jsonb; next_state jsonb; a public.brokerage_accounts%ROWTYPE;
 sale_id uuid:=(p_sale->>'id')::uuid; q numeric:=(p_sale->>'quantity')::numeric; px numeric:=(p_sale->>'price_at_execution')::numeric;
 f numeric:=coalesce((p_sale->>'fees')::numeric,0); fx numeric:=(p_sale->>'fx')::numeric; settlement numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.portfolios WHERE id=p_port AND user_id=auth.uid() AND kind='trading') THEN RAISE EXCEPTION 'Portfolio access denied'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_port::text||upper(p_symbol),0));
 IF EXISTS(SELECT 1 FROM public.cost_basis_sales WHERE sell_id=sale_id AND user_id=auth.uid() AND request=p_sale) THEN RETURN public.cb_replay(auth.uid(),p_port,upper(p_symbol)); END IF;
 current_state:=public.cb_replay(auth.uid(),p_port,upper(p_symbol));
 IF current_state->>'fingerprint' IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'Position changed. Preview again before selling'; END IF;
 SELECT * INTO a FROM public.brokerage_accounts WHERE id=(p_sale->>'accountId')::uuid AND user_id=auth.uid() AND portfolio_id=p_port AND kind='cash';
 IF NOT FOUND OR a.currency NOT IN ('USD','THB') THEN RAISE EXCEPTION 'Invalid cash account'; END IF;
 IF fx IS NULL OR fx<=0 OR fx::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid FX'; END IF;
 next_state:=public.cost_basis_preview(p_port,p_symbol,p_sale)->'after';
 settlement:=(q*px-f)*CASE WHEN a.currency='THB' THEN fx ELSE 1 END;
 IF settlement<=0 THEN RAISE EXCEPTION 'Fee exceeds proceeds'; END IF;
 PERFORM set_config('app.cost_basis_write','on',true);
 INSERT INTO public.trades(id,user_id,portfolio_id,brokerage_account_id,asset_name,symbol,type,quantity,price_at_execution,amount_usd,fees,currency,exchange_rate_at_time,original_amount,execution_date,tags)
 VALUES(sale_id,auth.uid(),p_port,a.id,upper(p_symbol),upper(p_symbol),'SELL',q,px,q*px,f,a.currency,CASE WHEN a.currency='THB' THEN fx ELSE 1 END,settlement,now(),ARRAY['Cost basis ledger','FX USD/THB '||fx::text]);
 INSERT INTO public.cost_basis_sales VALUES(sale_id,auth.uid(),p_sale->>'method',coalesce(p_sale->'selections','[]'),p_sale);
 next_state:=public.cb_replay(auth.uid(),p_port,upper(p_symbol));
 INSERT INTO public.cost_basis_revisions(user_id,portfolio_id,symbol,reason,snapshot) VALUES(auth.uid(),p_port,upper(p_symbol),'SELL '||sale_id,next_state);
 PERFORM set_config('app.cost_basis_write','off',true);
 RETURN next_state;
END $$;
REVOKE ALL ON FUNCTION public.cost_basis_sell(uuid,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cost_basis_sell(uuid,text,jsonb,text) TO authenticated;

-- Guard old editors too. Sold purchases require an explicit correction/replay.
CREATE FUNCTION public.cost_basis_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE state jsonb;
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text||NEW.portfolio_id::text||upper(NEW.symbol),0));
  IF NEW.type='SELL' AND coalesce(current_setting('app.cost_basis_write',true),'')<>'on' THEN RAISE EXCEPTION 'Use cost-basis sale preview'; END IF;
  IF NEW.type IN ('BUY','IMPORT') AND EXISTS(SELECT 1 FROM public.trades WHERE user_id=NEW.user_id AND portfolio_id=NEW.portfolio_id AND upper(symbol)=upper(NEW.symbol) AND type='SELL' AND execution_date>=NEW.execution_date) THEN RAISE EXCEPTION 'Backdated buy would change posted sales: ledger replay review required'; END IF;
  RETURN NEW;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(OLD.user_id::text||OLD.portfolio_id::text||upper(OLD.symbol),0));
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
END $$;
REVOKE ALL ON FUNCTION public.cost_basis_guard() FROM PUBLIC,anon,authenticated;
-- Installed only after client switches its SELL path to the new RPC.

CREATE FUNCTION public.cost_basis_correct_buy(p_id uuid,p_price numeric,p_fee numeric,p_commit boolean DEFAULT false,p_fingerprint text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.trades%ROWTYPE; before_state jsonb; after_state jsonb; changed jsonb; rate numeric;
BEGIN
 SELECT * INTO t FROM public.trades WHERE id=p_id AND user_id=auth.uid() AND type IN ('BUY','IMPORT');
 IF NOT FOUND THEN RAISE EXCEPTION 'Buy not found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t.user_id::text||t.portfolio_id::text||upper(t.symbol),0));
 SELECT * INTO t FROM public.trades WHERE id=p_id FOR UPDATE;
 IF p_price IS NULL OR p_fee IS NULL OR p_price<=0 OR p_fee<0 OR p_price::text IN ('NaN','Infinity','-Infinity') OR p_fee::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid price/fee'; END IF;
 before_state:=public.cb_replay(t.user_id,t.portfolio_id,t.symbol);
 after_state:=public.cb_replay(t.user_id,t.portfolio_id,t.symbol,jsonb_build_object('id',t.id,'price_at_execution',p_price::text,'amount_usd',(p_price*t.quantity)::text,'fees',p_fee::text));
 SELECT coalesce(jsonb_agg(DISTINCT a.value->>'sellId'),'[]') INTO changed FROM jsonb_array_elements(after_state->'allocations') a
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before_state->'allocations') b WHERE a.value->>'sellId'=b.value->>'sellId' AND a.value->>'lotId'=b.value->>'lotId' AND (a.value->>'realizedPnl')::numeric=(b.value->>'realizedPnl')::numeric);
 IF p_commit THEN
  IF before_state->>'fingerprint' IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'Position changed. Preview correction again'; END IF;
  PERFORM set_config('app.cost_basis_correct','on',true);
  rate:=CASE WHEN t.currency='USD' THEN 1 ELSE t.exchange_rate_at_time END;
  PERFORM public.replace_brokerage_trade(t.id,t.symbol,t.execution_date,t.quantity,p_price,p_price*t.quantity,(p_price*t.quantity+p_fee+coalesce(t.taxes,0))*rate);
  UPDATE public.trades SET fees=p_fee WHERE id=t.id;
  INSERT INTO public.cost_basis_revisions(user_id,portfolio_id,symbol,reason,snapshot)
    VALUES(t.user_id,t.portfolio_id,t.symbol,'CORRECT BUY '||t.id,jsonb_build_object('previous',before_state,'replacement',after_state,'affectedSales',changed));
  PERFORM set_config('app.cost_basis_correct','off',true);
 END IF;
 RETURN jsonb_build_object('before',before_state,'after',after_state,'affectedSales',changed);
END $$;
REVOKE ALL ON FUNCTION public.cost_basis_correct_buy(uuid,numeric,numeric,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cost_basis_correct_buy(uuid,numeric,numeric,boolean,text) TO authenticated;

-- Preserve original rows and all old allocation revisions. Seed only scopes
-- that can replay without inference. Ambiguous scopes fail this migration.
DO $$ DECLARE scope record; state jsonb; BEGIN
 FOR scope IN SELECT DISTINCT user_id,portfolio_id,upper(symbol) symbol FROM public.trades WHERE type IN ('BUY','IMPORT','SELL') AND portfolio_id IS NOT NULL LOOP
  state:=public.cb_replay(scope.user_id,scope.portfolio_id,scope.symbol);
  INSERT INTO public.cost_basis_revisions(user_id,portfolio_id,symbol,reason,snapshot) VALUES(scope.user_id,scope.portfolio_id,scope.symbol,'LEGACY VERIFIED',state);
 END LOOP;
END $$;
