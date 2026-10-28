# รอบ 8 — Loading/cache และ Bucket reveal

## สาเหตุที่ตรวจจากโค้ดก่อนแก้

1. AppContext data effect ขึ้นกับ activePortfolioId แล้วเรียก setIsDataLoaded(false) ทุกครั้งและยิง 11 queries แม้โหลดข้อมูลชุดเดิมแล้ว Setter ของ portfolio ทำเพียงเปลี่ยน selection/local preference; ไม่พบ key={activePortfolioId} หรือ keyed Suspense ที่ remount ทั้งหน้า
2. RouteContent ตั้ง settled เป็นค่าว่างทุก mount ทำให้ข้อมูลพร้อมก็ยังผ่าน skeleton/minimum wait ส่วน loading.tsx ของ Next commit fallback ทันที จึงเก็บหน้าเดิมระหว่าง threshold ไม่ได้
3. chart-motion.ts หา data-chart-bar ทุก segment แล้ว scaleX(0→1) แยกแต่ละชิ้น พร้อม delay ตาม index ทั้งที่ตำแหน่งแต่ละชิ้นอยู่ที่ตำแหน่งสุดท้าย จึงเห็นช่องว่างก่อนเชื่อมกัน

## การแก้

- src/lib/loading-policy.js เป็นแหล่งเดียว: SKELETON_DELAY=300, SKELETON_MIN=300, STALE_TTL=60000, PAGE_EXIT=120, PAGE_ENTER=180 (milliseconds)
- useLoadingGate: cached-ready ไม่รอ; skeleton ที่ปรากฏแล้วมี minimum; initial context loading แสดง shell ได้ทันที; pending navigation คงหน้าเดิมก่อน threshold แล้ว fade ออก120
- ลบ eager loading.tsx ใน app routes ให้ RouteContent/Suspense ใช้ per-route component ตัวเดียวผ่าน RouteSkeleton; Next outlet คง mount ไม่มีซ่อนหน้าเก่า/เก็บสอง page roots ซ้อน
- ตั้ง Next client route cache ตาม TTL เดียวกันเพื่อ reuse visited page segments และคง prefetch hover/pointerdown/focus; ใช้ experimental staleTimes ที่ Next15.5.15 รองรับ
- Financial snapshot ใน memory แยก user; fetch ชุดข้อมูล user แบบขนานครั้งเดียว และ project/cache ตาม portfolio ด้วย equality filter เดิม ไม่เปลี่ยนสูตรมูลค่าหรือ balance
- อ่านผลแบ่งหน้าให้ครบก่อน publish snapshot เพื่อไม่ให้ All-portfolios response ที่มี row limit ทำข้อมูลพอร์ตบางส่วนหาย
- Fresh60s ไม่ query ซ้ำ; stale ใช้ข้อมูลเดิมและ background refresh; แสดง dim/shimmer เฉพาะ marked data values; invalidate ก่อน/หลัง financial mutations และ financial-change event
- DCA draft reads มี memory cache; quote polling ข้าม symbol ที่ยังสด; History มี cache user/portfolio/month
- Bucket bar วาง final widths ทุก segment แล้วใช้ mask เดียว800ms; donut radial mask clockwise12นาฬิกา800ms easingเดียวกัน; labels stagger60ms; individual card progress500ms พร้อมกัน และ width updates300ms
- session reveal identity กัน replay เมื่อ revisit/rerender/filter; reduced motion แสดง geometry สุดท้ายทันที
- ใช้ตรรกะ allocation เดียวกันกับ Portfolio donut, Dashboard allocation widget และ Cash Flow budget progress; global chart motion ไม่เข้าไป animate subtree ที่มี data-chart-owned

## หลักฐานทดสอบ

- scripts/loading-cache-round8-test.mjs: 10 portfolio switches, 0 duplicate reads หลัง initial snapshot; user isolation, per-portfolio projection reuse, TTL, stale-on-error, in-flight deduplication, invalidation และ obsolete-response race ผ่าน
- scripts/portfolio-round7-qa.mjs: actual Portfolio View สลับ All/Dime/Webull10ครั้ง ไม่มี page skeleton, selected tab และ scroll คงเดิม (fixture data)
- scripts/navigation-round8-next-qa.mjs: actual Next App Router และ shell/transition, deterministic server pages1200ms, Slow3G400ms/50KBps, CPU6×, Disable cache; ตรวจ1947เฟรม ไม่มี empty/rootซ้ำ ไม่มี console navigation error, sidebar/headerเป็น nodeเดิม; 10 warm navigations ไม่แสดง skeleton (0 skeleton frames); watchdog8/20และRetryผ่าน
- scripts/bucket-round8-qa.mjs: actual Bucket View + global chart installer; dark209/light261frames ตรวจ segment geometry คงที่535/321/214px ตั้งแต่เฟรมแรก ไม่มี transform ต่อsegment; mask800msสองตัว; rerender/revisitไม่replay; reduced motion immediate; วิดีโอและภาพใน output/bucket-round8
- FX suite, cashflow selector7tests, TypeScript และ production build ผ่าน (warningsเดิมเรื่อง hooks/img/Recharts prerender)

เวลาจาก navigation fixture, ms หลังคลิก (ข้อมูล test server มิใช่ latency บัญชีจริง):

| Route | รอบ | Skeleton | Paint |
|---|---|---:|---:|
| portfolio | cold / dark | 647 | 4230 |
| ledger | cold / dark | 728 | 1872 |
| cashflow | cold / dark | 755 | 1885 |
| budget | cold / dark | 597 | 1828 |
| dashboard | cold / dark | 581 | 1579 |
| portfolio | cached / light | ไม่แสดง | 287 |
| ledger | cached / light | ไม่แสดง | 304 |
| cashflow | cached / light | ไม่แสดง | 328 |
| budget | cached / light | ไม่แสดง | 346 |
| dashboard | cached / light | ไม่แสดง | 310 |

ภายใต้ CPU6× การ render skeleton เองใช้เวลาจึงเห็นหลัง threshold+exit ไม่ได้แปลว่า timer 300ms ตรงกับ paint300ms หน้าเดิมยังอยู่ระหว่างรอ ไม่มีเฟรมว่าง

หลักฐาน: output/navigation-round8/after-next.json, warm-navigation.json, watchdog.json; output/bucket-round8/*; output/portfolio-round7/measurements.json

## จุดที่ยังมี skeleton และเหตุผล

| จุด | เงื่อนไข |
|---|---|
| Dashboard/Portfolio/Ledger/Cash Flow/Bucket/Calendar/Transactions | initial context ยังไม่พร้อม หรือ cold route รอเกิน threshold |
| Asset detail | asset data ยังไม่พร้อม; chart request ใช้ hook threshold แยกบล็อก; assetไม่มีจริงไป not-found ไม่ค้าง skeleton |
| History | cache user/portfolio/month ยังไม่มีและ query ช้า |
| Trade scanner | scan ครั้งแรกไม่มี results และช้าเกิน threshold |
| Trade Plan | รอตรวจ ticker/quote ก่อนแสดง workspace |
| Terminal/analysis | external widget และ market data เป็น async แยกบล็อก; analysis ใช้ shared gate แทน spinner |
| TopBar FX/avatar | โหลด rate/image แยกจาก page transition ไม่บล็อกหน้า |
| Settings/Trader Hub | ไม่รอ financial context; cold chunk เท่านั้น |

RouteSkeleton ไม่มี generic layout ครอบ app routes ที่มีสเปค; unknown path มีข้อความ Loading และ Next not-found เป็นผู้ตัดสิน เส้นทาง auth/public (`login`, `reset-password`) อยู่นอก authenticated app shell และยังมี fallback เดิม;ไม่ได้รวมใน network/navigation acceptance matrix รอบนี้

useDelayedLoading ไม่มี production callsites และกลายเป็น alias ของ useLoadingGate; .ledger-sk ถูกลบ; source snapshot tests ปรับให้อ่าน View แทน page wrapper

ข้อจำกัดการวัด: browser tests ใช้ UI จริงกับข้อมูลจำลอง ไม่ได้ใช้ข้อมูล/session production; quote/TradingView ภายนอกไม่ได้รับประกัน CLS0 จำนวนแถว/empty state หลังข้อมูลมาอาจเปลี่ยนความสูงได้

## ไฟล์หลักที่เพิ่ม/แก้รอบ8

- src/lib/loading-policy.js, memory-resource.ts, financial-snapshot.ts, supabase.ts
- src/context/AppContext.tsx
- src/hooks/useLoadingGate.ts, useDelayedLoading.ts, useAllocationMotion.ts
- src/components/PageTransition.tsx, RouteContent.tsx, RouteLoading.tsx, AllocationSurface.tsx
- src/lib/chart-motion.ts, next.config.js, src/index.css
- src/app/(app)/budget/BucketView.tsx, portfolio/PortfolioView.tsx, portfolio/[symbol]/page.tsx, cashflow/CashFlowView.tsx, ledger/LedgerView.tsx, history/HistoryView.tsx, trade/[[...symbol]]/TradeView.tsx, trade/plan/TradePlanView.tsx
- src/components/widgets/WidgetRenderer.tsx, AnalysisPanels.tsx, skeleton/index.tsx
- app route loading.tsx จากรอบ6ถูกแทนด้วย RouteContent fallback กลางที่เลือก per-page component
- scripts/loading-cache-round8-test.mjs, navigation-round8-next-qa.mjs, bucket-round8-qa.mjs, bucket-round8-fixture.tsx; portfolio-round7 QAเพิ่ม10portfolio switches; test-fxและcashflow source assertionsปรับตามView extraction

อ้างอิง API ที่ตรวจ: [Next staleTimes](https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes), [Supabase select](https://supabase.com/docs/reference/javascript/select). ไม่มี schema/RLS/auth policy หรือ endpoint routing changes
