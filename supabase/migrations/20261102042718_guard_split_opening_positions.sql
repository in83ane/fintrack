-- Refuse to erase a manually entered opening position that has no trade ledger.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('trade_import_private.apply_splits(uuid,jsonb)'::regprocedure) INTO definition;
 IF position('  before_state:=public.cb_replay(owner_id,p_port,sym);' in definition)=0 THEN RAISE EXCEPTION 'Split writer definition changed'; END IF;
 definition:=replace(definition,'  before_state:=public.cb_replay(owner_id,p_port,sym);',$guard$
  IF EXISTS(SELECT 1 FROM public.assets WHERE user_id=owner_id AND portfolio_id=p_port AND upper(symbol)=sym AND quantity>0)
    AND NOT EXISTS(SELECT 1 FROM public.trades WHERE user_id=owner_id AND portfolio_id=p_port AND upper(symbol)=sym AND type IN ('BUY','IMPORT')) THEN
    RAISE EXCEPTION 'Import or reconcile the original purchase lots before applying a split';
  END IF;
  before_state:=public.cb_replay(owner_id,p_port,sym);$guard$);
 EXECUTE definition;
END $migration$;
