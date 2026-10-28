-- Release assertion only. The four preceding migrations must already be applied.
-- This never installs missing dependencies or repairs historical financial rows.
do $$
declare signature text; target text; privilege text; role_name text;
begin
 foreach signature in array array['public.write_bucket_cash(uuid,jsonb)',
  'public.save_cash_bucket(uuid,uuid,jsonb,numeric)','public.remove_empty_cash_bucket(uuid)'] loop
  if to_regprocedure(signature) is null
   or not has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE')
   or has_function_privilege('anon',to_regprocedure(signature),'EXECUTE') then
   raise exception 'BUCKET_RELEASE_FUNCTION_OR_GRANT_MISMATCH';
  end if;
 end loop;
 foreach role_name in array array['anon','authenticated'] loop
  foreach target in array array['public.cash_activities','public.bucket_activities','public.money_buckets'] loop
   foreach privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
    if has_table_privilege(role_name,target,privilege) then
     raise exception 'BUCKET_RELEASE_DIRECT_WRITE_GRANT';
    end if;
   end loop;
   if has_any_column_privilege(role_name,target,'INSERT') or has_any_column_privilege(role_name,target,'UPDATE') then
    raise exception 'BUCKET_RELEASE_COLUMN_WRITE_GRANT';
   end if;
  end loop;
  if has_schema_privilege(role_name,'bucket_private','USAGE') or has_schema_privilege(role_name,'plan_private','USAGE') then
   raise exception 'BUCKET_RELEASE_PRIVATE_SCHEMA_EXPOSED';
  end if;
 end loop;
end $$;
notify pgrst, 'reload schema';
