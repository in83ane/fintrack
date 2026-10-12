# Wise valuation FX

Implemented server-only GET https://api.wise.com/2026Q4/rates?source=USD&target=THB.
Official reference: https://docs.wise.com/api-reference/rate/rateget

Set WISE_API_TOKEN in the server environment (Vercel project environment settings,
or your private local .env.local), then restart/redeploy when approved. Never use
a NEXT_PUBLIC_ prefix, commit the value, or paste it into chat. Use the least
privileged available token and confirm your Wise account's API/display permissions.

No credentials were read or configured by this change. Live Wise access has NOT
been verified. The code makes no transfer, quote creation or payment requests.
Wise states API access is free; this does not promise free account setup or hosting:
https://wise.com/help/articles/2958106/whats-the-wise-api

Wise is preferred only when configured. Missing token, denied access, malformed
response, stale quote, timeout or quota failure falls back to existing providers.
Actual source remains in the response/cache; fallback is never labelled Wise.
Provider links are not displayed. Server cache is 10 minutes; client retains its
existing refresh/backoff behavior. Only public rate fields leave the server.
Native balances, execution FX, lots, cost basis and historical records are unchanged.

Rollback: remove WISE_API_TOKEN from the server environment and restart/redeploy.
The prior fallback chain remains available. No database migration is needed.
