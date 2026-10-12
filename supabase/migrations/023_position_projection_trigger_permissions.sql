-- Internal trigger entry point: trades RLS authorizes the row mutation.
-- Only the trigger executes the private projection helper with owner rights.
ALTER FUNCTION public.update_weighted_average_cost() SECURITY DEFINER;
ALTER FUNCTION public.update_weighted_average_cost() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.update_weighted_average_cost() FROM PUBLIC, anon, authenticated;
