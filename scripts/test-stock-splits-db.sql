BEGIN;
SELECT set_config('request.jwt.claim.sub',user_id::text,true) FROM public.portfolios WHERE kind='trading' LIMIT 1;
SET LOCAL ROLE authenticated;
DO $$
DECLARE p uuid; owner_id uuid:=auth.uid(); prefix text:='SPLITTEST'||substr(replace(gen_random_uuid()::text,'-',''),1,12);
 rows jsonb:='[]'; buys jsonb:='[]'; actions jsonb; result jsonb; state jsonb; first_buy uuid; before_cash jsonb;
 rejected boolean; i integer; sym text;
BEGIN
 SELECT id INTO STRICT p FROM public.portfolios WHERE user_id=owner_id AND kind='trading' LIMIT 1;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]') INTO before_cash FROM public.brokerage_cash_entries e WHERE user_id=owner_id;
 -- Reproduce the exact class of partial import: 51 posted buys and 11 missing sales.
 FOR i IN 1..51 LOOP
  buys:=buys||jsonb_build_array(jsonb_build_object('row',i,'symbol',prefix,'type','BUY','date','2024-12-01','quantity','1','price','100','fees','1','currency','USD','rate','1'));
 END LOOP;
 rows:=buys;
 FOR i IN 52..62 LOOP
  rows:=rows||jsonb_build_array(jsonb_build_object('row',i,'symbol',prefix,'type','SELL','date','2025-02-01','quantity','1','price','30','fees','0.1','currency','USD','rate','1'));
 END LOOP;
 PERFORM public.import_trade_history(p,buys,null);
 actions:=jsonb_build_array(jsonb_build_object('symbol',prefix,'date','2025-01-01','numerator',5,'denominator',1,'source','Synthetic regression fixture'));
 result:=public.import_trade_history_with_splits(p,rows,'PROPORTIONAL',actions);
 IF result<>jsonb_build_object('imported',11,'skipped',51,'splitsApplied',1) THEN RAISE EXCEPTION 'Partial recovery failed: %',result; END IF;
 state:=public.cost_basis_preview(p,prefix);
 IF (SELECT sum((value->>'remaining')::numeric) FROM jsonb_array_elements(state->'lots'))<>244 THEN RAISE EXCEPTION 'Wrong split holdings'; END IF;
 IF abs((state->>'realized')::numeric-106.7)>0.000001 OR (state->>'invested')::numeric<>5151 THEN RAISE EXCEPTION 'Wrong split costs: %',state; END IF;
 result:=public.import_trade_history_with_splits(p,rows,'PROPORTIONAL',actions);
 IF result<>jsonb_build_object('imported',0,'skipped',62,'splitsApplied',0) THEN RAISE EXCEPTION 'Retry changed data: %',result; END IF;
 -- The same 62-row file also works in a fresh portfolio symbol.
 sym:=prefix||'N';
 SELECT jsonb_agg(value||jsonb_build_object('symbol',sym)) INTO rows FROM jsonb_array_elements(rows);
 result:=public.import_trade_history_with_splits(p,rows,'PROPORTIONAL',jsonb_build_array((actions->0)||jsonb_build_object('symbol',sym)));
 IF result->>'imported'<>'62' OR result->>'skipped'<>'0' THEN RAISE EXCEPTION 'Fresh 51+11 import failed: %',result; END IF;
 state:=public.cost_basis_preview(p,sym);
 IF abs((state->>'realized')::numeric-106.7)>0.000001 THEN RAISE EXCEPTION 'Fresh import cost mismatch'; END IF;
 -- A fractional source must produce the same units in fresh and recovered imports.
 sym:=prefix||'F';
 rows:=jsonb_build_array(jsonb_build_object('row',1,'symbol',sym,'type','BUY','date','2024-01-01','quantity','0.05347115','price','400','fees','0.03','currency','USD','rate','1'));
 PERFORM public.import_trade_history(p,rows,null);
 PERFORM public.import_trade_history_with_splits(p,rows,null,jsonb_build_array(jsonb_build_object('symbol',sym,'date','2025-01-01','numerator',4,'denominator',1,'source','Fractional fixture')));
 state:=public.cost_basis_preview(p,sym);
 IF (state->'lots'->0->>'remaining')::numeric<>0.213885 OR abs((state->>'invested')::numeric-21.41846)>0.00000001 THEN RAISE EXCEPTION 'Lost original fractional precision'; END IF;
 PERFORM public.apply_stock_splits(p,jsonb_build_array(jsonb_build_object('symbol',sym,'date','2025-02-01','numerator',2,'denominator',1,'source','Second fractional fixture')));
 state:=public.cost_basis_preview(p,sym);
 IF (state->'lots'->0->>'remaining')::numeric<>0.427769 THEN RAISE EXCEPTION 'Compounded rounded quantities instead of original source'; END IF;
 -- An entire invalid broker batch rolls back its split and every imported trade.
 sym:=prefix||'A'; rejected:=false;
 BEGIN
  PERFORM public.import_trade_history_with_splits(p,jsonb_build_array(jsonb_build_object('row',1,'symbol',sym,'type','SELL','date','2025-02-01','quantity','999','price','30','fees','0','currency','USD','rate','1')),'PROPORTIONAL',jsonb_build_array((actions->0)||jsonb_build_object('symbol',sym)));
 EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM public.stock_splits WHERE portfolio_id=p AND symbol=sym) OR EXISTS(SELECT 1 FROM public.trades WHERE portfolio_id=p AND symbol=sym) THEN RAISE EXCEPTION 'Atomic rollback failed'; END IF;
 -- A sale posted before the split keeps exact realized P/L and selected lot IDs.
 sym:=prefix||'B';
 rows:=jsonb_build_array(
  jsonb_build_object('row',1,'symbol',sym,'type','BUY','date','2024-01-01','quantity','2','price','100','fees','2','currency','USD','rate','1'),
  jsonb_build_object('row',2,'symbol',sym,'type','SELL','date','2024-02-01','quantity','1','price','150','fees','1','currency','USD','rate','1'));
 PERFORM public.import_trade_history(p,rows,'PROPORTIONAL');
 SELECT id INTO first_buy FROM public.trades WHERE portfolio_id=p AND symbol=sym AND type='IMPORT';
 PERFORM public.apply_stock_splits(p,jsonb_build_array(jsonb_build_object('symbol',sym,'date','2025-01-01','numerator',2,'denominator',1,'source','Synthetic fixture')));
 state:=public.cost_basis_preview(p,sym);
 IF (state->>'realized')::numeric<>48 OR (state->'lots'->0->>'remaining')::numeric<>2 OR state->'lots'->0->>'id'<>first_buy::text THEN RAISE EXCEPTION 'Pre-split sale changed'; END IF;
 PERFORM public.apply_stock_splits(p,jsonb_build_array(jsonb_build_object('symbol',sym,'date','2025-03-01','numerator',1,'denominator',2,'source','Synthetic reverse split')));
 state:=public.cost_basis_preview(p,sym);
 IF (state->>'realized')::numeric<>48 OR (state->'lots'->0->>'remaining')::numeric<>1 THEN RAISE EXCEPTION 'Reverse split failed'; END IF;
 -- Future buys are not changed by an older action. Already-adjusted files are explicit.
 sym:=prefix||'C';
 rows:=jsonb_build_array(jsonb_build_object('row',1,'symbol',sym,'type','BUY','date','2024-01-01','quantity','10','price','10','fees','0','currency','USD','rate','1','basisDate','2025-02-01'),jsonb_build_object('row',2,'symbol',sym,'type','BUY','date','2025-02-01','quantity','3','price','10','fees','0','currency','USD','rate','1'));
 PERFORM public.import_trade_history_with_splits(p,rows,null,jsonb_build_array(jsonb_build_object('symbol',sym,'date','2025-01-01','numerator',10,'denominator',1,'source','Synthetic fixture')));
 state:=public.cost_basis_preview(p,sym);
 IF (SELECT sum((value->>'remaining')::numeric) FROM jsonb_array_elements(state->'lots'))<>13 THEN RAISE EXCEPTION 'Adjusted source split twice'; END IF;
 -- Fractions below storage precision and conflicting ratios cannot silently corrupt a lot.
 rejected:=false;
 BEGIN PERFORM public.apply_stock_splits(p,jsonb_build_array(jsonb_build_object('symbol',sym,'date','2025-03-01','numerator',1,'denominator',7,'source','Synthetic fixture'))); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Fractional precision silently rounded'; END IF;
 rejected:=false;
 BEGIN PERFORM public.apply_stock_splits(p,jsonb_build_array(jsonb_build_object('symbol',sym,'date','2025-01-01','numerator',5,'denominator',1,'source','Conflicting fixture'))); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Conflicting ratio accepted'; END IF;
 IF before_cash IS DISTINCT FROM (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]') FROM public.brokerage_cash_entries e WHERE user_id=owner_id) THEN RAISE EXCEPTION 'Cash changed during split/import'; END IF;
 -- Authenticated users cannot bypass the guard or operate on another portfolio.
 rejected:=false;
 BEGIN UPDATE public.trades SET quantity=999 WHERE id=first_buy; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected AND EXISTS(SELECT 1 FROM public.trades WHERE id=first_buy AND quantity=999) THEN RAISE EXCEPTION 'Posted-lot guard bypass'; END IF;
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 IF EXISTS(SELECT 1 FROM public.stock_splits WHERE portfolio_id=p) THEN RAISE EXCEPTION 'RLS leak'; END IF;
 rejected:=false;
 BEGIN PERFORM public.apply_stock_splits(p,actions); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Cross-owner split accepted'; END IF;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 RAISE NOTICE 'PASS: 51+11 recovery, splits, reverse splits, costs, cash, retry, rollback, adjusted sources and owner isolation';
END $$;
ROLLBACK;
