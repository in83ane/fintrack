-- pg_net was introduced by the immediately preceding migration. It is not relocatable;
-- recreate this newly installed extension in extensions, without CASCADE.
-- Only its transient HTTP queue/history is reset. No financial data is affected.
drop extension pg_net;
create extension pg_net with schema extensions;
-- Document service-only access explicitly; anon/authenticated still have no grants or policies.
create policy price_email_budget_service on public.price_email_budget for all to service_role using (true) with check (true);
create policy price_email_worker_service on public.price_email_worker for all to service_role using (true) with check (true);
