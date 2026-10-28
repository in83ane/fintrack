# Initial UI audit — 2026-10-25

Source audit plus rendered login inspection. Authenticated render audit pending browser sign-in. Baseline TypeScript check passed.

| Dimension | Preliminary score / 4 | Evidence |
| --- | --- | --- |
| Accessibility | 2 | 9–11px labels; Modal lacks dialog semantics, focus containment and Escape handling. |
| Performance | 2 | Numerous background blurs and repeated number interpolation; no consistent reduced-motion handling. |
| Theming | 1 | Light mode uses root invert/hue-rotate; extensive hard-coded dark surfaces. |
| Responsive | 2 | Responsive structure exists; dense utility bar and small mobile nav labels need rendered review. |
| Integrity | 2 | Four competing colored dashboard actions; duplicated KPI hierarchy; Support currently links to #. |

## Priorities

- P1: Replace inversion with independent semantic light/dark tokens; preserve semantic gain/loss meaning.
- P1: Fix reusable dialog focus and keyboard behavior; ensure readable labels and focus rings.
- P1: Reorganize dashboard around net worth/history, allocation and one action menu.
- P2: Build compact rail, route continuity, theme transition and reduced-motion alternatives.
- P2: Make data surfaces denser and coherent while preserving financial logic and features.
- P2: Resolve Support as a useful local help surface without inventing a contact backend.

## Existing strengths

Dashboard chart already has axes and hover information. Portfolio has detailed position workflows and semantic table markup. FX chip already distinguishes manual/stale rates and shows a timestamp. Keep these features. Existing uncommitted changes remain the starting point.

These are preliminary source findings, not a WCAG certification or a measured performance score. Final detector and render findings belong in the final review.
