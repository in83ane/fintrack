-- The cash row references trades.id. Write it only after the parent trade
-- exists; any validation failure still rolls back the entire statement.
DROP TRIGGER IF EXISTS validate_trade_portfolio_and_record_cash ON public.trades;
CREATE TRIGGER validate_trade_portfolio_and_record_cash
  AFTER INSERT OR UPDATE OF portfolio_id, brokerage_account_id ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.validate_trade_portfolio_and_record_cash();
