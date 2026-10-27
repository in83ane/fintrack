create extension if not exists pg_cron;
create extension if not exists pg_net;
-- Public deployment URL; the separate authorization token stays encrypted in Vault.
select vault.create_secret('https://sbojwnbwfepdvtsmzvwc.supabase.co/functions/v1/price-email-alerts','fintrack_price_alert_url','Price alert worker URL');
select cron.schedule('fintrack-price-email-alerts','* * * * *',$job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='fintrack_price_alert_url'),
    headers := jsonb_build_object('Content-Type','application/json','x-alert-worker-token',
      (select decrypted_secret from vault.decrypted_secrets where name='fintrack_price_alert_worker')),
    body := '{}'::jsonb, timeout_milliseconds := 55000
  );
$job$);
