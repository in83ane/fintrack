BEGIN;
SELECT set_config('request.jwt.claim.sub',user_id::text,true) FROM public.brokerage_accounts WHERE currency='USD' AND kind='cash' LIMIT 1;
SET LOCAL ROLE authenticated;
DO $$
DECLARE a public.brokerage_accounts%ROWTYPE; b1 uuid; b2 uuid; sid uuid; p jsonb; result jsonb; sale jsonb; correction jsonb; m text; expected numeric; realized numeric; basis numeric; held numeric; rejected boolean;
BEGIN
 SELECT * INTO STRICT a FROM public.brokerage_accounts WHERE user_id=auth.uid() AND currency='USD' AND kind='cash' LIMIT 1;
 INSERT INTO public.brokerage_cash_entries(user_id,portfolio_id,brokerage_account_id,type,amount,currency) VALUES(auth.uid(),a.portfolio_id,a.id,'DEPOSIT',10000,'USD');
 FOREACH m IN ARRAY ARRAY['SPECIFIC_LOT'] LOOP
  b1:=gen_random_uuid();b2:=gen_random_uuid();sid:=gen_random_uuid();
  INSERT INTO public.trades(id,user_id,portfolio_id,brokerage_account_id,symbol,asset_name,type,quantity,price_at_execution,amount_usd,original_amount,currency,execution_date) VALUES
  (b1,auth.uid(),a.portfolio_id,a.id,'CBTEST'||m,'Test','BUY',1,200,200,200,'USD',now()-interval '2 days'),
  (b2,auth.uid(),a.portfolio_id,a.id,'CBTEST'||m,'Test','BUY',1,250,250,250,'USD',now()-interval '1 day');
  sale:=jsonb_build_object('id',sid,'quantity','0.5','price_at_execution','382.70','fees','0','fx','33','method',m,'accountId',a.id,'selections',jsonb_build_array(jsonb_build_object('lotId',b1,'qty','0.5')));
  p:=public.cost_basis_preview(a.portfolio_id,'CBTEST'||m,sale);
  result:=public.cost_basis_sell(a.portfolio_id,'CBTEST'||m,sale,p->'before'->>'fingerprint');
  realized:=(result->>'realized')::numeric;
  expected:=91.35;
  IF abs(realized-expected)>0.00000001 THEN RAISE EXCEPTION 'Realized % != % for %',realized,expected,m; END IF;
  SELECT sum((value->>'cost')::numeric),sum((value->>'remaining')::numeric) INTO basis,held FROM jsonb_array_elements(result->'lots');
  IF abs(realized+held*382.70-basis-315.40)>0.00000001 THEN RAISE EXCEPTION 'Total invariant failed %',m; END IF;
  PERFORM public.cost_basis_sell(a.portfolio_id,'CBTEST'||m,sale,p->'before'->>'fingerprint');
  IF (SELECT count(*) FROM public.trades WHERE id=sid)<>1 THEN RAISE EXCEPTION 'Retry duplicated'; END IF;
  rejected:=false;
  BEGIN PERFORM public.cost_basis_preview(a.portfolio_id,'CBTEST'||m,sale||jsonb_build_object('id',gen_random_uuid(),'quantity','3')); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Oversell accepted'; END IF;
  correction:=public.cost_basis_correct_buy(b1,220,0);
  PERFORM public.cost_basis_correct_buy(b1,220,0,true,correction->'before'->>'fingerprint');
  result:=public.cost_basis_preview(a.portfolio_id,'CBTEST'||m);
  IF result->>'realized' IS DISTINCT FROM correction->'after'->>'realized' THEN RAISE EXCEPTION 'Correction mismatch'; END IF;
 END LOOP;
END $$;
SELECT 'PASS: database methods, total invariant, idempotency, oversell, correction replay' result;
ROLLBACK;
