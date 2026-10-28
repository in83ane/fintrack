# FinTrack — รอบ 3–5 (26 ต.ค. 2026)

## รอบ 5: Ledger

- ลดเหลือ 4 แถว: ช่วงเวลา + Income/Expense → wallets → In/Out/Net → tabs + Export/info.
- ลบหัวข้อ Ledger/คำอธิบายในเนื้อหา; Export เป็นไอคอนพร้อม aria-label/title และกลับเป็น Cancel เมื่อเลือก.
- Chip เดือนทำหน้าที่ล้างตัวกรองจริง จึงซ่อนเฉพาะเดือนปัจจุบัน ผ่าน prop ของ DateRangeBar ที่ใช้เฉพาะ Ledger.
- Wallet สูง 46px, ชื่อ 13px, ยอด 11px, ยอดสกุลเดิม; สกุลสำรอง USD ตรงกับสูตร All wallets เดิม.
- Desktop wrap ไม่มี scrollbar; coarse pointer เลื่อนแนวนอน ซ่อน scrollbar และมี fade ที่ขอบ.
- แสดง 6 buckets สูงสุด + More โดยใบที่เลือกอยู่นอก 6 ใบแรกจะแทนใบที่ 6.
- Brokers เป็น dropdown เดียว ใช้ state broker:<id> เดิม; label ระบุพอร์ต/บัญชีและสกุล.
- ยอด broker ใช้ brokerageCashBalances ที่ AppContext โหลดจาก balance view อยู่แล้ว ไม่รวมเองจากรายการบางช่วง และไม่แสดง 0 ถ้าไม่มีข้อมูลยอด.
- ไม่มีการแก้ getLedgerView, scope, การคำนวณยอดธุรกรรม, selection, CSV, delete หรือ save handler. รอบ 5 ไม่แก้ AddCashflowModal/TransitionOverlay.

### ทำไม wallet เพิ่ม

ตรวจ git HEAD:src/app/(app)/ledger/page.tsx (78924f3): แบบเก่าแสดง moneyBuckets ทุกใบ และเพิ่ม broker wallet เฉพาะบัญชีที่พบใน allMergedActivities ซึ่งมี walletLabel. โค้ดก่อนรอบ 5 รวม moneyBuckets กับ brokerageAccounts ทุกบัญชีโดยตรง จึงมีทั้งบัญชีที่ไม่มีรายการในช่วงนั้นและชื่อ Cash USD ซ้ำ. รอบนี้คืน bucket scope เดิม และย้าย brokerageAccounts ไป picker เดียว ไม่ลบบัญชีหรือแก้ตัวกรองข้อมูล.

### Loading

Ledger แสดงยอด wallet/summary เป็น shimmer ทันที พร้อมหัววันและแถว 73px จำนวน 4 แถวใน card shell. ไม่ใช้ useDelayedLoading และไม่แสดง “…”/div ว่าง. RouteContent อนุญาตเฉพาะ Ledger ให้แสดง skeleton ที่หน้าเป็นผู้จัดการเองระหว่างโหลดข้อมูล; จังหวะ route fade และ shell ไม่เปลี่ยนในรอบนี้.

วัดตำแหน่งหัววันแรกจาก fixture ที่ใช้ UI จริงและ buckets 4 ใบ:

| Viewport | Dark y | Light y |
|---|---:|---:|
| 1905 | 354 | 354 |
| 1440 | 354 | 354 |
| 1280 | 394 | 394 |
| 1024 | 500 | 500 |
| 768 | 508 | 508 |

ทุกขนาดไม่มี document overflow/desktop wallet scrollbar. ตำแหน่ง list ก่อนและหลังข้อมูลพร้อมเท่ากันเมื่อวัดหลัง route motion. ที่ 768px top bar เดิมยังแคบ/ชื่อถูกตัดตาม shell ที่ผู้ใช้ให้คงไว้; รอบนี้ไม่ปรับ shell.

### i18n

noteOptional และ SAVERECORD มีทั้ง en/th อยู่แล้ว จึงคงไว้. เพิ่ม ledgerMoreWallets, ledgerBrokers, ledgerLoading, yesterday, confirmDeleteRecord ทั้งสองภาษา. สองตัวท้ายพบจากการตรวจ static t(...) ของ Ledger. รอบ 4 เพิ่ม currency ซึ่งเดิมยังขาดทั้งสองภาษา. ตรวจ static keys ใน Ledger, AddCashflowModal, DateRangeBar และทดสอบ Thai edit drawer.

### ไฟล์รอบ 5

- src/app/(app)/ledger/page.tsx
- src/components/DateRangeBar.tsx (optional prop ซ่อน clear chip เดือนปัจจุบัน)
- src/components/LedgerHint.tsx
- src/components/LedgerRowsSkeleton.tsx
- src/components/RouteContent.tsx (ให้ Ledger จัดการ data skeleton ของตัวเอง)
- src/context/AppContext.tsx (translation keys เท่านั้นในรอบ 5)
- src/index.css (Ledger selectors)
- scripts/ledger-round5-qa.mjs, scripts/ledger-qa-fixture.tsx, scripts/ledger-browser-qa.mjs

## รอบ 4: Add Record / fields / dropdown

Add Record กลับเป็น badge → wallet → amount+currency button → icon categories/custom → note → date → save. คืน saved customCategories ที่ฟอร์มใหม่ไม่ได้ render โดยใช้ addCustomCategory/removeCustomCategory เดิม. ลำดับ income presets เป็น Salary/Freelance/Investment Return/Dividend/Gift/Rental Income/Other.

ตัด type switch พร้อม sliding indicator, modal scale/translate และ spinner บน Save (ใช้ Saving… แทน). Modal/scrim ใช้ opacity160ms เปิด/120ms ปิด; ไม่มี blur/glass/gradient/glow/ripple/confetti/animated number ในฟอร์มปัจจุบัน. Esc, scrim close, focus trap, amount autofocus และ validation/save เดิมคงไว้.

CustomSelect กลางใช้ FloatingPopover portal, flip ขึ้นบน, สูงสุด280px, พื้นทึบตาม tokens, fade120ms, Arrow/Home/End/Enter/Space/typeahead/Escape. Escape ปิด dropdown ก่อน modal. ไม่เพิ่ม dependency.

### Select ที่แทน/ได้รับ component กลาง

Native select ที่แทน: Ledger (แทนด้วย wallet pills แล้วในรอบ 5), Cash Flow (wallet/view), Terminal (interval), TradeLotEditor, AddCashflowModal (wallet/currency).

ผู้ใช้ CustomSelect เดิมได้รับ component ใหม่: Portfolio (หลายฟอร์ม), Trade Plan, AddAssetModal, EditAssetModal, DcaOrderSystem, AssetFundingFields, InvestmentTransferModal. DateRangeBar ใช้ Select กลางสำหรับเดือน และ FloatingPopover สำหรับ Custom dates.

ค้น src แล้วไม่เหลือแท็ก native select. นี่เป็น static coverage ของทุก usage; ไม่ได้เปิดทุกฟอร์มในบัญชีจริง.

### Fields

แก้กฎกลางใน index.css: ไม่มี outline/box-shadow บน fields; focus เปลี่ยนพื้นเล็กน้อย/caret primary; autofill ไม่ใช้ inset ring; color-scheme ตามธีม. ลบ utility focus:border/ring ของ inputs และ focus-within wrappers ที่ชนกฎกลาง โดยคง focus-visible ของ buttons/chips/links.

ไฟล์ที่ลบ utility เฉพาะช่องกรอก:
AddAssetModal, AIFinancialAdvisor, BrokerLedgerView, CostBasisPanel, DateRangeBar, DcaOrderSystem, EditAssetModal, InvestmentTransferModal, PriceAlertManager, Sidebar/TopBar (เฉพาะ input ใน popup), TradeLotEditor; login, reset-password, budget, portfolio, portfolio/[symbol], settings, terminal, transactions, trade/plan, trade/[[...symbol]].

### Modal/popup อื่นที่ยังมี blur (รายงานเท่านั้น)

- components/Modal.tsx: scrim backdrop-blur-sm; ใช้โดย AddAssetModal, EditAssetModal, ConfirmModal, CostBasisPanel, InvestmentTransferModal, PortfolioDisplayFilterModal, SettingsModal, TradeLotEditor, PriceAlertManager, TransactionDetailModal และ Dashboard/Budget.
- BrokerLedgerView: modal scrim.
- portfolio/page.tsx: portfolio modal scrim.
- portfolio/[symbol]/page.tsx: modal scrim และ chart tooltip.
- widgets/DashboardGrid.tsx: widget library.
- budget/page.tsx: inline editing overlay.
- StockChart.tsx / dashboard/page.tsx: chart tooltips.

## รอบ 3: หลักฐานหน้าเปล่า

Reproduce แบบควบคุมด้วย shell เดิม + router mock1200ms และ data พร้อมแล้ว:
- 316ms leaving, Dashboard, opacity1.
- 463ms swap, ยัง Dashboard, opacity≈0.029.
- 1680ms entered, route Cash Flow, **opacity0**.
- ตัวอย่างหลังคลิก2023ms: route/title/menu Cash Flow แต่ main opacity0 และไม่มี skeleton.

หลักฐาน: output/navigation-qa/before.json, before-blank.png, PageTransition-before.txt.

| สมมติฐาน | ผล |
|---|---|
| รอ animationend ไม่มา | ไม่ใช่ใน reproduction: swap/entered ถูกเรียกครบ |
| timer ถูก cleanup แล้วไม่เริ่มใหม่ | ไม่ใช่สาเหตุที่พบใน reproduction |
| route/chunk suspend โดยไม่มี fallback | มีช่องว่างระหว่าง cold navigation: เดิมไม่มี route loading fallback |
| mounted แต่ opacity0 ค้าง | **ใช่สาเหตุหลัก**: exit animation fill:'both' อยู่บน main; ทิ้ง animation handle ก่อน cancel แล้ว enter animate ลูก จึงไม่ปลด main |
| data ช้า/error ถูกกลืน | ไม่ใช่สาเหตุของ reproduction เพราะ data พร้อม; พบ load errors เดิม log แล้ว finally ready จึงเพิ่มสถานะ error ให้ fallback |
| title/menu อ่านคนละ state | **ใช่**: Sidebar pendingPath เปลี่ยนทันที แต่ TopBar อ่าน route เก่า |

ระหว่างทดสอบวิธีแก้พบ native history.pushState + router.replace ทำให้ Next คง cached tree เดิม จึงนำวิธีนี้ออก. ใช้ router.push เป็นผู้จัดการ history และมี navigation target ร่วมตัวเดียวสำหรับ title/menu/content. Browser URL เปลี่ยนเมื่อ Next commit; ไม่ใช้ native history เพื่อบังคับ URL ล่วงหน้า. Next template ดูแล page content; persistent viewport เก็บ route outlet ไว้ จึงไม่ตัดการทำงานของ router.

AbortController ยกเลิก timer/transition ของคำสั่งเก่า; Next จัดการ RSC/chunk requests ของตัวเอง. ไม่ abort ข้อมูลระดับ AppProvider ที่ทุกหน้าใช้ร่วมกัน. มี prefetch hover/pointerdown/focus. Data เริ่ม Promise.all เดิมอยู่แล้ว; market/FX ไม่ใช่เงื่อนไขรอ route ใหม่.

การถอดหน้าเก่าทันทีพร้อม skeleton ขัดกับการเก็บหน้าเก่าไว้ fade140ms: จึงใช้140ms กับ skeleton ก่อนเข้า content260ms (ได้แจ้งระหว่างทำงาน). Base opacity1 และไม่รอ animationend. shimmer1.6s.

### Timing หลังแก้

ทดสอบ **Next router จริง + shell จริง + server pages จำลองรอ1200ms**; CDP Slow3G latency400ms/50KBps, CPU6×, cache disabled. ไม่ใช่การจับเวลาข้อมูลบัญชีจริง. ก่อนแก้ทุก route ไม่มี skeleton และ content ไม่ paint เพราะ main opacity0; จึงไม่ใช่ benchmark ความเร็วแบบสภาพแวดล้อมเดียวกัน.

| Route | ก่อน: skeleton/content | หลัง dark: skeleton / data / paint ms | หลัง light: skeleton / data / paint ms |
|---|---|---:|---:|
| Dashboard | ไม่มี / opacity0 | 234 / 1814 / 1834 | 219 / 1672 / 1695 |
| Portfolio | ไม่มี / opacity0 | 226 / 4119 / 4144 | 257 / 1935 / 1956 |
| Ledger | ไม่มี / opacity0 | 260 / 2800 / 2824 | 209 / 1632 / 1652 |
| Cash Flow | ไม่มี / opacity0 | 182 / 2871 / 2890 | 223 / 1800 / 1822 |
| Terminal | ไม่มี / opacity0 | 242 / 2736 / 2760 | 281 / 1875 / 1894 |
| Trade Plan | ไม่มี / opacity0 | 257 / 2712 / 2733 | 191 / 1671 / 1692 |
| Bucket | ไม่มี / opacity0 | 206 / 2776 / 2793 | 178 / 1766 / 1789 |
| History | ไม่มี / opacity0 | 220 / 2822 / 2839 | 195 / 1699 / 1719 |
| Settings | ไม่มี / opacity0 | 229 / 2848 / 2871 | 227 / 1614 / 1636 |

เวลา skeleton วัดเมื่อ effect บันทึก log ภายใต้ CPU6×; old content ถูกแทนใน urgent commit เดียว ไม่ได้ตั้ง delay เพิ่มก่อน skeleton. 2549 sampled frames มี page root1 อัน, headingไม่เกิน1 และ content area ไม่ว่าง; Sidebar/TopBar DOM identity คงเดิม. คลิกรัว, คลิกกลับ route เดิมก่อน request เสร็จ, reduced-motion ผ่าน. History มี label เดิม “Transaction history” บน header เทียบกับ “History” ใน nav; test ยอมรับ alias นี้เพื่อไม่เปลี่ยน shell.

8วินาทีแสดง Taking longer than usual…, 20วินาทีแสดง Retry, Retry โหลดกลับได้ และ server route error มี Retry. หลักฐาน output/navigation-qa/after-next.json และ watchdog.json.

### ไฟล์ navigation

PageTransition.tsx, RouteContent.tsx, RouteLoading.tsx, app/(app)/template.tsx, loading.tsx, error.tsx, layout.tsx; Sidebar/TopBar เปลี่ยน hook เส้นทางร่วม (รอบ 3), AppContext ส่ง dataLoadError.

## การตรวจและภาพ

- scripts/ledger-round5-qa.mjs: 5ขนาด × 2ธีม, balances/reconciliation, More/Brokers, loading geometry, ไทย, tooltip, Export.
- scripts/ledger-browser-qa.mjs: 8กลุ่ม regression รวม Space/Shift selection, CSV ยอด native, delete confirmation, Undo ไม่เขียนข้อมูล, delayed delete, drawer/focus, modal save อยู่ใน viewport, navigation.
- scripts/ledger-round4-qa.mjs ผ่านก่อนรอบ 5: 42ภาพ, currency keyboard/typeahead, Esc priority, portal flip, input border/outline/shadow, custom chips.
- node --test src/lib/ledger-selectors.test.mjs src/lib/cashflow-selectors.test.mjs: 9ผ่าน.
- TypeScript ผ่าน.
- npm run build ผ่าน (31 pages); มี lint warnings ในส่วนเดิม เช่น hook dependencies และ img แต่ไม่มี build/type errors.
- รูปก่อนรอบ 5: output/ledger-round4/ledger-1905-dark.png.
- รูปหลัง: output/ledger-round5/ledger-1905-dark.png, ledger-1905-light.png, ledger-768-dark.png, loading.png, more-selected.png, brokers-1905-dark.png.
- Modal/dropdown: output/ledger-round4/add-1280-dark.png, currency-1280-dark.png, select-flipped.png.
- Navigation ก่อน/หลัง: output/navigation-qa/before-blank.png, after-dark-skeleton.png, after-light-skeleton.png.

Browser tests ใช้ข้อมูลจำลองในหน่วยความจำ ไม่เขียน/ลบรายการของผู้ใช้. ยังไม่ได้ตรวจทุก authenticated page/form กับข้อมูลจริง; screenshot fixtures ใช้ Arial แทน webfont ของแอป จึงอาจต่างเล็กน้อยด้านตัวอักษร. ที่จอ768pxคง sidebar254pxตามคำสั่ง ทำให้ topbarเดิมแคบ; ไม่ซ่อน sidebar เพื่อแก้พื้นที่.

