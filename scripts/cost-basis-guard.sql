-- Activate only with the preview/confirm sale client deployed.
CREATE TRIGGER cost_basis_write_guard BEFORE INSERT OR UPDATE OR DELETE
ON public.trades FOR EACH ROW EXECUTE FUNCTION public.cost_basis_guard();
