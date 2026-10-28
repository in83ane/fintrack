# ตรวจรายงาน FinTrack เทียบโค้ด — 13 ตุลาคม 2026

> อัปเดตตามคำยืนยันล่าสุด: เป้าหมายโครงงานรองรับ **Web App, PC App และ Mobile App** ไม่ได้จำกัดเป้าหมายไว้ที่เว็บ ข้อเสนอเดิมด้านแพลตฟอร์มในตารางด้านล่างให้ใช้ [report-multiplatform-revisions.md](report-multiplatform-revisions.md) แทน โดยยังแยก Web ที่มี implementation ออกจาก PC/Mobile ระยะถัดไป

## ขอบเขตและวิธีอ่าน

ตรวจ PDF 28 หน้าและตัวอย่างไดอะแกรม 6 ประเภทของผู้ใช้ เทียบกับ working tree ปัจจุบัน ไม่ได้ตรวจ deployment จริง ไม่ได้รัน migration และไม่ได้แก้แอปเพื่อให้ตรงกับคำบรรยายเก่า

เลขหน้าด้านล่างหมายถึงลำดับหน้า PDF 1–28 ไม่ใช่เลขหน้าในสารบัญเดิม
ไฟล์ PDF ที่ส่งคู่กันเป็น **สำเนาใส่หมายเหตุตรวจแก้** ไม่ใช่เล่มที่เปลี่ยนเนื้อหาทั้งหมดแล้ว ข้อความสำหรับนำไปแทนอยู่ใน thesis-replacement-text.md

## 1. รายการแก้ไขรายหน้า

| หน้า PDF / หัวข้อ | สิ่งที่พบ | สิ่งที่ควรแก้ | หลักฐาน / สถานะ |
|---|---|---|---|
| 1–5 ปกและบทคัดย่อ | ชื่อโครงงาน นักศึกษา อาจารย์ ปี และบทคัดย่อยังเป็น template | กรอกข้อมูลจริงภายหลัง; ใช้บทคัดย่อฉบับร่างในไฟล์ข้อความทดแทน ไม่สร้างชื่อหรือผลวิจัย | อ่านจาก PDF; ไม่ใช่ข้อมูลที่หาได้จาก code |
| 6–10 ส่วนต้นเล่ม | สารบัญ/เลขหน้าเป็นตัวอย่าง; สารบัญเริ่มท้ายหน้ากิตติกรรมประกาศ | ให้แต่ละส่วนเริ่มหน้าใหม่และสร้าง TOC ใหม่หลังจัดเล่ม; ลบ placeholder ที่ไม่ใช้ | ตรวจข้อความและรูปแบบต้นฉบับ |
| 11 / 1.1–1.2 | เว็บและโมบายแอปถูกเขียนเหมือนมี 2 ผลิตภัณฑ์ | ใช้ “เว็บแอปพลิเคชันแบบ Responsive ใช้ผ่าน browser บนคอมพิวเตอร์และมือถือ” | package.json, src/app; ไม่พบหลักฐาน native mobile app ในขอบเขตที่ตรวจ |
| 11 / 1.2(1) | รองรับเรท 4 สกุล THB/USD/JPY/EUR | จำกัด “การแสดงผลและแปลงเรทกลาง USD/THB”; type รองรับ JPY/EUR ไม่เท่ากับมี live rate | AppContext.tsx, useFxRate.ts, fx.ts, TopBar.tsx |
| 11 / 1.2(2) | Real-time | เปลี่ยนเป็น “อัปเดตเป็นระยะตามรอบดึงข้อมูลและข้อจำกัดผู้ให้บริการ” | AppContext polling 30 วินาที; FX refresh 10 นาที และ server cache |
| 11 / 1.2(3) | วัตถุประสงค์ประเมินผู้ใช้จริง | คงเป็นวัตถุประสงค์ได้ แต่ต้องระบุว่ารอการเก็บข้อมูลหากยังไม่มีผล | โค้ดไม่ยืนยัน sample size/แบบสอบถาม/คะแนน |
| 12 / 1.3(1) | Web ควบคู่ Mobile Application | ตัดความหมาย native app; Light/Dark มี setting แต่ต้องทดสอบ contrast และหน้าอื่นก่อนอ้างสมบูรณ์ | AppContext darkMode, settings/page.tsx |
| 12 / 1.3(2.1) | รวม API หุ้นกับเรทเงินและอ้างครอบคลุมทุกประเภท | แยก Yahoo market data, TradingView chart, FX provider chain; จำกัดสินทรัพย์ตาม provider และกรณีทดสอบจริง | terminal/actions.ts, TradingViewWidgets.tsx, exchange-rate/valuation/route.ts |
| 12 / 1.3(2.3) | สถิติมืออาชีพครบถ้วน | ระบุหน้าที่คำนวณจริงและนิยามตัวหาร; analytics API ยังมี placeholder | analytics/route.ts: sharpeRatio=0, maxDrawdown=0; dashboard มีการคำนวณอีกเส้นทาง |
| 13 / 1.4 | คำกล่าวเรื่องผลสำเร็จและความปลอดภัยเชิงยืนยัน | เขียนเป็น “ประโยชน์ที่คาดว่าจะได้รับ” ไม่ใช่ผลที่วัดแล้ว | ไม่มีผล UX/security study ในหลักฐานที่ตรวจ |
| 14 / 2.1 | ทฤษฎีแนวรับ/ต้าน MA RSI | คงเป็นทฤษฎีได้ แต่แยกสิ่งที่คำนวณเองกับสิ่งที่แสดงผ่าน widget; ใส่แหล่งอ้างอิงจริง | terminal/actions.ts, trade/actions.ts |
| 15 / 2.2.1 | อ้าง SSR ทำให้ระบบเร็ว/SEO ดี | อธิบายว่า framework รองรับ แต่หน้าหลักหลายหน้าเป็น use client และโหลดข้อมูลฝั่ง client; ไม่ใช้เป็นผล benchmark | dashboard, portfolio, terminal, trade/plan components |
| 15 / 2.3.2 | หัวข้อ Tailwind ซ้ำ 2.2.2 และอยู่ผิดหมวด | เปลี่ยนเป็น “การกำหนดสิทธิ์ข้อมูลและขอบเขตพอร์ต” | Supabase auth/RLS migrations และ portfolio scoping |
| 15 / 2.4.1 | ชื่อ package ถูกใช้แทนวิธีทำงานจริง | อธิบาย Recharts และ TradingView embedded scripts; การมี dependency ไม่ยืนยันการใช้งานทุกแพ็กเกจ | TradingViewWidgets.tsx สร้าง script embed |
| 16 / 2.6 | เลขหัวข้อข้าม 2.5 และอ้างงานวิจัยโดยไม่มี bibliography ครบ | จัดลำดับเป็น 2.5 หรือเติม 2.5 ที่ตั้งใจ; ตรวจต้นฉบับ DOI ปี วารสาร และข้อค้นพบก่อนใช้ | ยังไม่ได้ตรวจยืนยันงานวิจัยภายนอก; ไม่สรุปว่าเป็นเท็จ |
| 17 ตารางเปรียบเทียบ | ใช้ “มีครบ”, “รองรับเต็มรูปแบบ”, คู่แข่ง “ไม่มี” | ใช้ “พบ implementation / ต้องทดสอบ / ไม่ได้ประเมิน”; เพิ่มวันที่และแหล่งข้อมูลคู่แข่ง | ไม่มีหลักฐาน product comparison ปัจจุบัน; repo บาง metric เป็น placeholder |
| 18 / 3.1 | อ้าง Agile/Sprint โดยไม่มีหลักฐานกระบวนการ | หากไม่มี backlog/sprint record ให้เขียน “พัฒนาและปรับปรุงแบบวนซ้ำ”; โค้ดอย่างเดียวไม่พิสูจน์วิธีวิจัย | ขอหลักฐานกระบวนการจากผู้จัดทำ |
| 18 / 3.1.3(4) | Trade Signal Module | ระบุว่าโค้ดวิเคราะห์มีอยู่ แต่ route /trade/[symbol] เก่าถูก redirect ไป Terminal | trade/[[...symbol]]/layout.tsx; ไม่อ้างว่า legacy UI ยังเปิดได้ |
| 19 / 3.1.3(9) | AI Chatbot | เปลี่ยนเป็น “ผู้ช่วยแบบกฎและการจับคำค้น”; การเชื่อมต่อ LLM เป็นงานต่อยอดจนมีหลักฐาน | AIFinancialAdvisor.processInput ใช้ includes/parseTransaction และ simulated delay; ไม่พบ model request ในเส้นทางนี้ |
| 19 / 3.1.3(12) | Trader Hub เป็นโมดูลเปิดใช้จริง | ตรวจ route reachability ก่อน; เขียนรวมสถิติที่อยู่ Dashboard/Trade Plan และระบุ legacy screen ถูกปิด | redirect layout, DcaOrderSystem, dashboard |
| 19 / 3.1.3(13) | History ครอบคลุมทุกธุรกรรมอย่างละเอียด | แยก Ledger ที่รวม cash/bucket/broker กับ history_events ที่ constraint source_table=trades | schema ผู้ใช้แนบ; migrations/011_history_trade_only.sql |
| 19 / 3.1.4 | อ้างหัวข้อ 3.7 แต่ไม่มีเนื้อหา 3.2–3.7 ก่อนขึ้นบท 4 | เติม architecture, use case/flow, domain, ER, sequence/security และ testing plan | ใช้ diagrams ที่จัดทำ; อย่าอ้างหัวข้อที่ไม่มี |
| 20 / 4.1 | อ้างรองรับ 4 สกุล เรียลไทม์ ถูกต้องแม่นยำครบ | รายงานเฉพาะ USD/THB, polling และขอบเขตทดสอบ; คำว่า “ถูกต้องทั้งหมด” ต้องมี test evidence | FX store และ existing audit |
| 20 / 4.1.1 | ผลตอบแทนถูกต้องทั้งหมด | แยก realized/unrealized/total และตัวหาร พร้อมบอกข้อจำกัด legacy currency; อย่าเหมารวมทุกสินทรัพย์ | cost-basis-ledger.ts, CostBasisPanel.tsx, native FX audit |
| 20 / 4.1.3 | บอกว่าทุก indicator/SMC พร้อมใน Dashboard | แยก server indicator functions, Terminal widget, legacy signal route และสิ่งที่ UI เปิดถึงจริง | terminal/actions.ts, trade/actions.ts, redirect layout |
| 21 / 4.2 | ระบุ functional/performance/security ผ่านโดยไม่มีข้อมูลวัด | เปลี่ยนเป็น test matrix พร้อม expected/actual/date/environment; ห้ามแต่ง latency/คะแนนความปลอดภัย | scripts/test-*.mjs มีบางกรณี; ไม่แทน penetration/load tests |
| 21 / 4.3.1 | ผู้ใช้เข้าถึงข้อมูลเร็ว/ง่ายกว่าเดิมจาก “ผลการทดสอบ” | ตัดผลเชิงเปรียบเทียบจนมีผู้เข้าร่วม วิธีวัด และผลจริง | code review ไม่พิสูจน์ UX outcome |
| 21–22 / 4.3 | สรุปผลวิจัยต่างประเทศมาเป็นหลักฐานผลของ FinTrack | เขียนเป็นความสอดคล้องด้านแนวคิด ไม่ใช่หลักฐานว่า FinTrack ให้ผลเหมือนกัน | ต้องตรวจเอกสารวิจัยต้นทางเพิ่ม |
| 22 / 4.4 | ปลอดภัยสูง รวดเร็ว รองรับ scale เพราะเลือก tech stack | เปลี่ยนเป็น “ออกแบบโดยใช้…” และระบุยังต้องทดสอบ; framework ไม่รับรองผลเหล่านี้ | ยังไม่ได้ audit deployment/RLS/load จริง |
| 23 | บทที่ 5 และอ้างอิงว่าง | เติมสรุปจากสิ่งที่ทำจริง ข้อจำกัด และงานต่อยอด; references ต้องตรงการอ้างในบท 2/4 | มีข้อความทดแทนแยกให้ |
| 24–28 | หน้าว่าง ภาคผนวก placeholder และตัวอย่างสันปกชื่อโครงงานอื่น | ใส่ test results/คู่มือ/data dictionary ที่เป็นของโครงงานจริง; ลบ instruction pages ก่อนส่ง | ต้องยืนยันรูปแบบกับภาควิชา |

## 2. แก้ตัวอย่างไดอะแกรมที่ส่งมา

### ER Diagram

- `users ||--o{ profiles` ผิด cardinality: profiles.id เป็น PK/FK ของ auth.users จึงมีได้ไม่เกิน 1 profile ต่อ user → `auth_users ||--o| profiles`
- portfolio_id/asset_id/bucket_id หลายจุด nullable จึงไม่ควรวาด parent mandatory ทั้งหมด
- ตัวอย่างไม่ครบ brokerage_accounts, brokerage_cash_entries, cost_basis_*, dca_drafts, snapshots และ history_events
- ให้ใช้ 04-er-full.mmd และ database-dictionary.md ซึ่งอ้าง schema ที่แนบ; deployment จริงยังไม่ได้ตรวจ

### Class Diagram

- login(), deposit(), calculatePnL(), getNetWorth() ที่ใส่ใน entity ไม่ใช่ method ที่ยืนยันจาก source เหล่านั้น
- ย้ายพฤติกรรมไป AppContext/module หรือระบุเป็น conceptual design; auth ownership อยู่ที่ auth.users ไม่ใช่ profile เป็นเจ้าของทุกข้อมูลโดย composition
- ใช้ 03-class-domain.mmd เพื่ออธิบาย BuyLot, SellTransaction, Ledger, Decimal และ FX ตามโค้ดจริง

### Architecture

- ใช้ชื่อ Supabase ชัดเจน ไม่ใช่ “มักใช้ร่วมกับ…” เพราะมี SDK จริง
- REST/Data API/RPC พบใน source; ไม่ใส่ GraphQL และ avatar file storage เป็น implemented subsystem โดยไม่มีหลักฐาน
- แยก Next.js server routes/actions ออกจาก browser และแยก Yahoo/TradingView/FX provider
- ใช้ 01-system-architecture.mmd

### User Flow / Use Case

- เติม trading portfolio selection, draft vs posted BUY, sale preview และ error flow
- ไม่ใช้ save to DB แล้วกลับ Dashboard เหมือนกันทุกหน้าหาก source ไม่ทำเช่นนั้น
- requires/updates ไม่ใช่ UML include/extend ตามอัตโนมัติ; วาดเป็น association หรืออธิบายเงื่อนไข
- ใช้ 02-user-flow.mmd และ 05-use-cases.mmd

### Sequence: เพิ่มรายรับ/รายจ่าย

- ไม่พบ custom Next.js POST /cash_activities ใน flow นี้; ใช้ AppContext → db.cashActivities.insert → Supabase client/Data API
- AppContext เพิ่ม optimistic row ก่อนตอบกลับ และ rollback เฉพาะ optimistic row เมื่อ insert error
- เมื่อเกี่ยว Bucket ยังมี updateMoneyBucket และ addBucketActivity เพิ่มเติม จึงห้ามอ้างว่า insert cash row อย่างเดียวทำให้ยอดทั้งหมด sync แบบ atomic
- ใช้ไฟล์ใหม่ 06d-sequence-cash-activity.mmd; callbacks บางส่วนไม่ได้ await ครบ จึงไม่ยืนยัน all-or-nothing

## 3. โครงบทที่ 3 ที่แนะนำ

3.1 วิธีพัฒนาและวิเคราะห์ความต้องการ
3.2 สถาปัตยกรรมระบบ — ภาพ Architecture
3.3 ผู้ใช้และลำดับการใช้งาน — Use Case และ User Flow
3.4 แบบจำลองข้อมูลและตรรกะ — Class/Domain Model
3.5 ฐานข้อมูล — ER และ data dictionary แยก subsystem
3.6 ลำดับการทำงานและการควบคุมสิทธิ์ — Sequence การขาย/เงินสด/FX พร้อมขอบเขตที่ตรวจ
3.7 แผนและวิธีทดสอบ — test cases, environment, expected result, evidence

ภาพควรใช้ caption “ภาพที่ 3.x …” เรียงตามลำดับที่ปรากฏจริง ไม่กำหนดเลขหน้าล่วงหน้า

## 4. หลักฐานโค้ดที่ควรอ้างในรายงาน

| ประเด็น | ไฟล์ |
|---|---|
| เทคโนโลยีและเวอร์ชัน | package.json |
| FX กลางและจังหวะ refresh | src/hooks/useFxRate.ts, src/lib/fx-store.ts, src/lib/fx.ts |
| แหล่งเรท | src/app/api/exchange-rate/valuation/route.ts |
| ราคาและ indicators | src/app/(app)/terminal/actions.ts, src/app/(app)/trade/actions.ts |
| กราฟ widget | src/components/TradingViewWidgets.tsx |
| สถานะร่วม / polling / optimistic update | src/context/AppContext.tsx |
| partial sale และ preview | src/components/CostBasisPanel.tsx |
| exact arithmetic และ replay | src/lib/cost-basis-ledger.ts |
| หน้า signal เก่าปิดแล้ว | src/app/(app)/trade/[[...symbol]]/layout.tsx |
| Rule-based assistant | src/components/AIFinancialAdvisor.tsx |
| metric placeholder | src/app/api/analytics/route.ts |
| cash activity หลาย write | src/components/AddCashflowModal.tsx, src/lib/supabase.ts |

## 5. ข้อจำกัดของการตรวจนี้

ไม่ได้รับรอง RLS/security/performance/production deployment และไม่ได้ตรวจยืนยันบรรณานุกรมภายนอก การมีโค้ดไม่ได้เท่ากับผลทดสอบผ่าน ข้อมูลนักศึกษา อาจารย์ และผลประเมินจริงต้องให้ผู้จัดทำเติมเอง

รายงานนี้แก้ข้อความให้ไม่อ้างเกินหลักฐาน ไม่ได้แก้ bug ของระบบ (เช่น analytics placeholder หรือ multi-write cashflow) ใน turn นี้
