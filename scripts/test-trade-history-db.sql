BEGIN;
SELECT set_config('request.jwt.claim.sub',user_id::text,true) FROM public.portfolios WHERE kind='trading' LIMIT 1;
SET LOCAL ROLE authenticated;
DO $$
DECLARE p uuid; other_port uuid; rows jsonb; result jsonb; state jsonb; rejected boolean;
  cash_count integer; trade_count integer; prefix text:='IMPORTTEST'||replace(gen_random_uuid()::text,'-','');
BEGIN
 SELECT id INTO STRICT p FROM public.portfolios WHERE user_id=auth.uid() AND kind='trading' LIMIT 1;
 SELECT count(*) INTO cash_count FROM public.brokerage_cash_entries WHERE user_id=auth.uid();
 rows:=jsonb_build_array(
   jsonb_build_object('row',5,'symbol',prefix,'type','BUY','date','2025-01-01','quantity','1','price','100','fees','2','currency','USD','rate','1'),
   jsonb_build_object('row',6,'symbol',prefix,'type','BUY','date','2025-01-02','quantity','3','price','200','fees','0','currency','USD','rate','1'),
   jsonb_build_object('row',7,'symbol',prefix,'type','SELL','date','2025-01-03','quantity','2','price','300','fees','1','currency','USD','rate','1'),
   jsonb_build_object('row',8,'symbol',prefix,'type','BUY','date','2025-01-04','quantity','10','price','999','fees','0','currency','USD','rate','1'));
 -- Recover a partial legacy import, including a purchase AFTER the sale date.
 PERFORM public.import_trade_history(p,jsonb_build_array(rows->0,rows->1,rows->3),null);
 result:=public.import_trade_history(p,rows,'PROPORTIONAL');
 IF result<>jsonb_build_object('imported',1,'skipped',3) THEN RAISE EXCEPTION 'Recovery: %',result; END IF;
 state:=public.cost_basis_preview(p,prefix);
 IF abs((state->>'realized')::numeric-248)>0.00000001 THEN RAISE EXCEPTION 'Wrong dated proportional cost: %',state; END IF;
 IF (SELECT sum((value->>'remaining')::numeric) FROM jsonb_array_elements(state->'lots'))<>12 THEN RAISE EXCEPTION 'Wrong remaining'; END IF;
 IF abs((SELECT avg_purchase_price FROM public.assets WHERE portfolio_id=p AND symbol=prefix)-10341::numeric/12)>0.00000001 THEN RAISE EXCEPTION 'Stale asset cost'; END IF;
 result:=public.import_trade_history(p,rows,'PROPORTIONAL');
 IF result<>jsonb_build_object('imported',0,'skipped',4) THEN RAISE EXCEPTION 'Retry: %',result; END IF;
 -- A genuine pair of identical rows remains a pair, including on retry.
 rows:=jsonb_build_array((rows->0)||jsonb_build_object('symbol',prefix||'D'),(rows->0)||jsonb_build_object('symbol',prefix||'D'));
 result:=public.import_trade_history(p,rows,null);
 IF (result->>'imported')::int<>2 THEN RAISE EXCEPTION 'Collapsed duplicate occurrences'; END IF;
 result:=public.import_trade_history(p,rows,null);
 IF (result->>'skipped')::int<>2 THEN RAISE EXCEPTION 'Duplicated retry'; END IF;
 -- One invalid row rolls back earlier rows in the same broker batch.
 SELECT count(*) INTO trade_count FROM public.trades WHERE portfolio_id=p;
 rejected:=false;
 BEGIN
   PERFORM public.import_trade_history(p,jsonb_build_array((rows->0)||jsonb_build_object('symbol',prefix||'BAD'),(rows->0)||jsonb_build_object('symbol',prefix||'BAD','type','SELL','quantity','2','date','2025-01-03')),'PROPORTIONAL');
 EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected OR (SELECT count(*) FROM public.trades WHERE portfolio_id=p)<>trade_count THEN RAISE EXCEPTION 'Partial commit on oversell'; END IF;
 rejected:=false;
 BEGIN PERFORM public.import_trade_history(gen_random_uuid(),rows,'PROPORTIONAL'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Foreign portfolio accepted'; END IF;
 rejected:=false;
 BEGIN PERFORM public.import_trade_history(p,jsonb_build_array((rows->0)||jsonb_build_object('fees','-1')),null); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Negative fee accepted'; END IF;
 IF (SELECT count(*) FROM public.brokerage_cash_entries WHERE user_id=auth.uid())<>cash_count THEN RAISE EXCEPTION 'Historical import changed cash'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','public.import_trade_history(uuid,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous execute enabled'; END IF;
END $$;
SELECT 'PASS: legacy recovery, dated proportional costs, asset projection, idempotent retry, duplicate occurrences, atomic rollback, ownership, validation and unchanged cash' AS result;
ROLLBACK;
