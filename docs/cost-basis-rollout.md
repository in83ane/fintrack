# Specific-lot and proportional closing

## Backup before selective changes
Git stash: 22d5acdb4aae1c9c9cf0db5bbf8a9eb09f4a383a (backup-before-revert).
It includes tracked changes and untracked files and was applied back, not dropped.
Restore with git stash apply <hash> only after protecting newer work; conflicts may require manual merging.
No commit or push performed.

## Current client
- Removed symbol method setting and automatic priority closing modes from the UI/engine.
- Preserved immutable bought quantity, derived remaining, sale history, replay correction and validation.
- Specific-lot is default. Proportional closing allocates six-decimal quantities across remaining lots; the last lot receives the residual.
- Both modes send explicit allocations through the existing SPECIFIC_LOT RPC. request.closeMode records the UI mode without changing historical basis.
- Original lot cost is preserved. Portfolio and the live panel retain realized plus remaining unrealized accounting.
- Confirmation modal protects bulk closing; the user must type the symbol.
- Live panel uses decimal strings and BigInt rational arithmetic. Legacy context/display adapters still expose JS numbers; a full app-wide decimal migration is not claimed.

## Database history / safety
Previously deployed: cost_basis_decimal_ledger_foundation, cost_basis_activate_write_guard, cost_basis_guard_replay_integrity.
The associated SQL files remain as deployment history, not new migrations to run again.
This selective client revision does not undo or change database rows, localStorage, schema or stored functions.
Read-only inspection at revision start found no cost_basis_sales rows or per-symbol settings.
Unused historical database methods remain installed. Removing them requires a separate export/backup and reviewed migration.
Original posted BUY quantities are used; drafts are not treated as purchased quantities.
recoverOriginalQty refuses recovery when exit history is incomplete rather than guessing.

## Verification
node scripts/test-cost-basis-ledger.mjs covers actual scenario, A–F, fees, precision, replay, deletion guards and migration refusal.
node scripts/test-trade-lots.mjs verifies shared projections.
npx tsc --noEmit validates types.
UI visual parity and end-to-end persisted proportional sells still require browser verification.

## Precision semantics
Proportional allocations retain actual lot basis rather than pooling cost. Six-decimal residual allocation can cause a sub-cent difference from ideal unrounded average times sold quantity. The ledger retains actual allocated cost to conserve total profit. Per-sale weighted average can be presented separately; do not rewrite original lot cost.
