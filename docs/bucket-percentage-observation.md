# Possible Bucket percentage mismatch

Observed UI: four buckets show `1% Income split`; the summary shows `4% Total`.

The card labels render `bucket.targetPercent` directly. `totalTargetPercent` sums those values. AppContext reads the stored `target_percent` without scaling. The save form falls back to 1 when the input is empty or zero; this is a possible source of the values, not confirmed provenance of existing records.

Income preview and distribution use `income * bucket.targetPercent / totalTargetPercent`. Four equal values of 1 therefore allocate 25% of the entered income to each bucket, although each label says 1%. The allocation bar also normalizes its widths this way.

Possible bug: the displayed percentage implies a share of all income, while the distribution behaves as a relative weight whenever the total differs from 100. Product intent needs to establish whether totals below 100 should leave income unallocated or whether labels should show normalized shares.

This visual polish pass does not change the stored values, validation, formulas, distributions, activity notes, or routes.
