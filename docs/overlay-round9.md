# รอบ 9 — Overlay ไม่ทำให้หน้าและไฮไลต์ขยับ

วันที่ 26 ตุลาคม 2026 · ไม่ใช้ design/frontend skill

## สาเหตุที่ reproduce ได้ก่อนแก้

ทดสอบ real Ledger/Sidebar/TopBar/TransitionOverlay/CustomSelect ใน Chromium (Edge), viewport 1905×950, ข้อมูล fixture ในหน่วยความจำ ไม่มีการเขียนข้อมูลบัญชีจริง

`document.scrollingElement` คือ HTML แต่ TransitionOverlay, Modal และ Portfolio Sheet ล็อก BODY ขณะที่ CSS กำหนด `scrollbar-gutter: stable` ทั้ง HTML และ BODY เมื่อ BODY เปลี่ยน overflow เป็น hidden มันจอง gutter เพิ่มอีก 15px แม้ padding-right ไม่ได้เปลี่ยนเลย จึงไม่ใช่ padding compensation ตามสมมติฐาน แต่เป็นการจอง gutter ซ้ำ

| ค่าที่วัด | ก่อนเปิด (โค้ดเก่า) | เปิด Income (โค้ดเก่า) | ก่อนเปิด (แก้แล้ว) | เปิด Income (แก้แล้ว) |
|---|---:|---:|---:|---:|
| body.clientWidth | 1890 | 1875 | 1890 | 1890 |
| main/header/wrapper width | 1636 | 1621 | 1636 | 1636 |
| Summary x | 512 | 504.5 | 512 | 512 |
| รายการ x | 712 | 704.5 | 712 | 712 |
| Sidebar x / width | 0 / 254 | 0 / 254 | 0 / 254 | 0 / 254 |
| body padding-right | 0 | 0 | 0 | 0 |
| root overflow | clip visible | clip visible | clip visible | hidden |
| body overflow | clip visible | hidden | clip visible | clip visible |

- HTML gutter คง stable; BODY เปลี่ยนเป็น auto และไม่ถูก lock อีก
- main/wrapper margin/padding ไม่เปลี่ยน; transform/filter เป็น none, zoom=1 ก่อน/ระหว่าง/หลัง ไม่พบ class หรือ data-scroll-locked ที่เพิ่มโดยไลบรารี
- การขยับแกน y เมื่อเปิด currency dropdown ไม่ reproduce หลังแก้: Δy=0 รวม sidebar
- GlidingIndicator เดิมใช้ Motion layoutId จึง animate layout projection ทุกครั้งที่ geometry เปลี่ยน แม้ selection เดิม ส่วน TopBar มี observer/ตัววัดและ motion.animate left/width ของตัวเอง
- กลุ่มไฮไลต์อยู่ในโครงสร้างเดิมและ key ไม่ผูกกับ overlay; ไม่พบ conditional remount ในการเปิด overlay ที่ทดสอบ
- Focus ใน TransitionOverlay และบาง popup เดิมไม่ได้ใช้ preventScroll; CustomSelect เดิมเรียก scrollIntoView ซึ่งอาจเลื่อน ancestor นอก menu

หลักฐานเต็ม: [ก่อนแก้](../output/overlay-round9/before-computed.json), [หลังแก้](../output/overlay-round9/after-computed.json)

## วิธีแก้

- `scroll-lock.ts`: shared reference-counted lock เฉพาะ scrolling root คืนค่า overflow และ priority เดิมเมื่อปิดตัวสุดท้าย รวมกรณี nested overlays, cleanup และ route unmount ไม่เพิ่ม padding ไม่ set scrollTop และไม่ reset overflow ของ overlay อื่น
- คง gutter ถาวรเฉพาะ html; body gutter auto
- GlidingIndicator เป็น span absolute inset:0 อยู่ในปุ่ม active จริง ใช้ FLIP เฉพาะ activeKey เปลี่ยนจาก selection ที่ commit ก่อนหน้า ไม่มี layoutId หรือ CSS transition จากการวัด rect
- mount/remount, ResizeObserver, resize, font change และ reduced motion วางตำแหน่งจริงทันที เก็บ rect ล่าสุดเพื่อใช้ตอน selection ถัดไป
- animation เมื่อเลือกใหม่: transform 320ms cubic-bezier(.3,1.15,.5,1) (ใช้ multiplier เดิมในโหมด debug)
- ย้ายสวิตช์ USD/THB มาใช้กลไกเดียวกัน
- focus ใช้ preventScroll; CustomSelect เลื่อนเฉพาะ scrollTop ของ panel
- Cash Flow chart fullscreen เก็บพื้นที่การ์ดเดิมไว้ใน flow และใช้ lock/focus ชุดเดียวกัน

## ผู้ใช้ GlidingIndicator ทั้งหมด

| ตำแหน่ง | ไฟล์ | active key |
|---|---|---|
| เมนู sidebar | src/components/Sidebar.tsx | item.href |
| ช่วงเวลา All/1D–1Y | src/components/DateRangeBar.tsx | preset.id |
| เดือนล่าสุด OCT/SEP | src/components/DateRangeBar.tsx | year-month |
| Ledger All/Income-Expense/Transfers/Investments | src/app/(app)/ledger/LedgerView.tsx | kind |
| Cash Flow period | src/app/(app)/cashflow/CashFlowView.tsx | p |
| StockChart period | src/components/StockChart.tsx | period.key |
| Asset detail period | src/app/(app)/portfolio/[symbol]/AssetChrome.tsx | period.key |
| Trader Hub timeframe | src/app/(app)/trader-hub/TraderHubView.tsx | tf |
| Trade Day/Swing/Month | src/app/(app)/trade/[[...symbol]]/TradeView.tsx | tf |
| TopBar USD/THB | src/components/TopBar.tsx | curr |
| BottomNav pill (ปัจจุบันซ่อนด้วย hidden) | src/components/BottomNav.tsx | item.path |

Portfolio asset tabs ใช้ border-bottom เปลี่ยนสีตาม tab ไม่มี sliding indicator/rect animation จึงไม่ต้องเปลี่ยนเป็น animation ใหม่; wallet/category controls ใช้สีสถานะเช่นเดิม ไม่มี layoutId เหลือใน source หลังแก้

## ผลตรวจ

- 85 overlay cycles ผ่าน (84 = 3 widths × 2 themes × 2 motion settings × 7 overlay types + 1 scrolled-page case)
- วัด 52–56 DOM rects ต่อกรณี: ทุกเมนู sidebar/indicator, topbar controls/title/FX, date buttons/indicators, wallets, summary cells, type tabs/indicator, หัววัน และ 3 แถวแรก รวมปุ่มลอย fixed
- Add Record Income/Expense, detail drawer, nested delete confirmation, currency dropdown, month dropdown, Brokers: Δx/Δy/Δwidth/Δheight สูงสุด **0px** ก่อน/ระหว่าง/หลัง; scrollY ไม่เปลี่ยน; highlight animation calls **0**
- OCT→SEP, type tab และ sidebar selection ยัง animate; reduced motion ไม่ animate
- resize snaps ตามปุ่ม, font/layout event ไม่สร้าง animation, first mount ไม่เลื่อนจากมุม
- ชุดเสริม 15 cycles ผ่านเช่นกัน: USD/THB และ 1D→1W ยังเลื่อนเมื่อเลือกใหม่, reduced motion ไม่เลื่อน; หลักฐาน extra-results.json
- เลื่อนหน้าลง 120px ใน viewport สูง 600px แล้วเปิด/ปิด Income: ตำแหน่งและ scrollY คงเดิม
- เปลี่ยน route ขณะ modal เปิด: root/body overflow คืนค่า ไม่มี lock ค้าง
- TypeScript และ production build ผ่าน; build ยังมี warnings เดิมเรื่อง hook dependencies, img และ Recharts prerender size

ข้อมูลเต็ม: [ผล matrix](../output/overlay-round9/results.json), [script](../scripts/overlay-round9-qa.mjs), [fixture](../scripts/overlay-round9-fixture.tsx)

ภาพ: [ก่อนแก้](../output/overlay-round9/before-fix-income.png), [หลังแก้](../output/overlay-round9/after-fix-income.png), [dark ปกติ](../output/overlay-round9/dark-normal.png), [dark เปิด modal](../output/overlay-round9/dark-income.png), [light ปกติ](../output/overlay-round9/light-normal.png), [light เปิด modal](../output/overlay-round9/light-income.png)

การทดสอบอัตโนมัติใช้ UI จริงกับข้อมูลจำลอง ไม่ได้ตรวจผ่าน session ของบัญชี production และไม่ได้ submit รายการเงินจริง

## ไฟล์ที่แก้ในรอบ 9

- เพิ่ม src/lib/scroll-lock.ts
- src/components/GlidingIndicator.tsx, TransitionOverlay.tsx, Modal.tsx, CustomSelect.tsx, TopBar.tsx, AddCashflowModal.tsx
- src/components/Sidebar.tsx, BottomNav.tsx, DateRangeBar.tsx, StockChart.tsx
- src/components/cashflow/ChartFrame.tsx
- src/app/(app)/portfolio/PortfolioView.tsx, portfolio/[symbol]/AssetChrome.tsx, portfolio/[symbol]/page.tsx (ลบ import ที่ไม่ได้ใช้)
- src/app/(app)/ledger/LedgerView.tsx, cashflow/CashFlowView.tsx, trader-hub/TraderHubView.tsx, trade/[[...symbol]]/TradeView.tsx
- src/index.css
- เพิ่ม scripts/overlay-round9-diagnose.mjs, overlay-round9-qa.mjs, overlay-round9-fixture.tsx และ output/overlay-round9/*
