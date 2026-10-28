# Round 6 — source audit (recorded before implementation)

Sizes below are CSS sizes, not estimates taken from another page. Responsive sizes are listed in source order. Counts for unknown collections are fixed placeholders; empty/conditional states are decided only after loading.

| Route / surface | Ordered top-level structure from source | Static / pending |
|---|---|---|
| `/dashboard` | Greeting; 4 KPI cards (2/4 columns, p16); net-worth card (p16/24, chart160/176); 6 metrics (2/3/6 columns); Cashflow + Top Movers (7/5 columns, gap16) | Greeting, actions, labels static; values, chart, activities pending. Empty-portfolio onboarding excluded |
| `/portfolio` | Heading/actions; broker chips; asset tabs + filter row; total valuation card (px20/28, header pt24, value area py24, footer py16); holdings toolbar + 8-column table; cash accounts (2 columns) | Labels/controls static; valuation, allocation strip, table rows and accounts pending. No KPI grid or large chart |
| `/portfolio/[symbol]` | Asset header; 2:1 grid gap24; left 4 metrics, optional 3 metrics, price chart400; right trade history | Asset identity/values/history pending; chart controls static; optional metrics excluded |
| `/ledger` | Date/action row; wallet chips46; 3-column summary70; type tabs/export40; centered720 day groups, row73 with tile48 | Date/actions/tabs/summary labels static; 5 wallet placeholders; 2 groups ×4 rows pending |
| `/cashflow` | Toolbar; scope/investment control; 7 metrics (2/4/7 columns); net-worth/health line; flow420; monthly/savings charts256 in8:4 grid; balance/category charts; budget details | Toolbar/headings static; figures/charts/rows pending. Chart modules must have matching individual fallbacks |
| `/terminal` | Ticker46; header; advanced chart650 with toolbar; 8 panel toggles; selected analysis/widgets | Header/toggles static; ticker/chart/remote panels pending. Existing 520/440 two-column fallback is incorrect |
| `/trade/[[...symbol]]` | Heading; scan tabs; 4 scan cards (1/2/4 columns); search form; conditional symbol analysis (score,4 metrics,2-column analytical panels) | Heading/tabs/search static; scan data pending; symbol detail conditional |
| `/trade/plan` | Heading and portfolio/ticker controls; compact quote header; DCA workspace1:2 (gap24): entries/forms, chart/results | Controls static; quote/market validation pending. Current Suspense fallback is empty |
| `/budget` (Bucket) | Heading; total card p16/24 with donut80/96 + allocation bar; horizontal bucket cards; distribution/add-profit forms2cols; action log/advice grid | Actions/form labels static; balance/allocation/cards/log pending |
| `/history` | Heading; grid1/3 gap24; left calendar p20 (7cols square days), summary4 rows; right history list2cols min420 | Month/weekdays/title static; summary/events pending; local request has spinner |
| `/calendar` | Heading/month controls; 4metrics; grid8:4 gap24/32; 7-column calendar aspect4:3 cells, equity80; audit list + correlations | Controls/weekdays/headings static; daily figures/equity/trades pending |
| `/transactions` | Heading; totals; month activity heatmap7cols; search/type filters; 6-column transaction table | Labels/month/search/tabs static; heatmap amounts/table pending |
| `/trader-hub` | Heading/timeframe; 4 KPI cards p20; performance and allocation charts; recent activity | Current page uses demonstration data. Shell has no independent data request |
| `/settings` | Eyebrow/title48; profile p24 tile56; regional2cols; appearance; data management2rows; notifications3rows; account/security3rows; danger zone | Local settings and static controls, no financial-data loading needed |
| Global Settings | Sidebar opens `SettingsModal`, not a route | Local controls; do not fabricate a page fallback |
| Support | Sidebar link is `#`, no implemented route | No page or asynchronous content |
| `/` | Server session check then LandingPageClient (marketing sections) | Marketing static; only signed-in action state pending |
| `/login` | Marketing panel + centered max448 auth form | Existing LoginSkeleton; credentials submission is not page navigation |
| `/reset-password` | Centered max448 card p32: title,2 fields,submit | Search-parameter Suspense currently spinner; replace with matching form shell |
| `/privacy-policy`, `/terms-of-service` | Header; max896 document, px24 py48 | Static documents, no data loading |
| not-found | Centered title/message/link | Static |

## Verification

Implementation and measured results are recorded below after checks. This audit does not assert zero CLS for unknown-length/empty collections or third-party embeds.

## Round 7 implementation and measurement correction

The initial Portfolio audit described a lower table. Reading the final render branch established that its default view is an asset-heading board with three placeholder group rows, a 104px donut inside the actual 124px allocation container, and the real broker/tabs/filter/toolbar. PortfolioSkeleton now renders PortfolioView loading; no table columns or duplicated labels are used.

All fourteen app skeletons render their corresponding actual View (Asset uses shared AssetChrome controls). Static Settings/TraderHub render actual controls. RouteSkeleton is only a registry; no shared generic card arrangement is used for these routes. Support is not implemented as a route; Global Settings is a modal. Public auth loading is separate from the app-shell transition scope.

Verified using scripts/portfolio-round7-qa.mjs: fourteen skeleton smoke checks without browser errors; Portfolio at 1905/1440/1280 in dark/light has 0px y difference for title, tabs, summary, toolbar and asset-heading block. Both currency labels render, FX pending shows shimmer rather than unavailable, heading focus outline is none, shimmer animates and is static under reduced motion. This is not a claim of zero CLS for unknown-length rows or third-party embeds.

Round 8 supersedes the unconditional route loading/minimum gate; see loading-round8.md. Round 9 fixes scroll-lock/selection motion; see overlay-round9.md.
