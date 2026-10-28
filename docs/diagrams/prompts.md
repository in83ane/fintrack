# Prompts สำหรับทำไดอะแกรม FinTrack

ใช้ “Context กลาง” ด้านล่างร่วมกับ prompt ของหัวข้อที่ต้องการ แนบ README.md, database-dictionary.md และ .mmd ที่เกี่ยวข้องด้วย หากปลายทางอ่าน repo ไม่ได้ ให้แนบ source เฉพาะที่อ้างถึง ห้ามแนบ .env, token, cookie หรือข้อมูลลูกค้าจริง

## Context กลาง — copy ก่อนทุก prompt

```text
คุณคือ software architect และ technical writer จัดทำเอกสาร FinTrack ภาษาไทย
โครงการเป็น Next.js App Router + React + TypeScript ใช้ Supabase Auth/PostgreSQL
และ Supabase client ติดต่อ Data API/RPC มี AppContext เป็น shared financial state
มี Dashboard, Portfolio, Terminal, Trade Plan/DCA, Ledger, History, Cashflow และ Budget/Bucket

กติกา:
1. แยก as-is จาก proposed design ชัดเจน ห้ามแต่งสิ่งที่ไม่มีในหลักฐาน
2. ใช้ schema ที่แนบเป็นหลักสำหรับชื่อตาราง/คอลัมน์/PK/FK/nullability
3. schema นี้เป็น reference เท่านั้น ห้าม run SQL, migrate, write DB หรือ localStorage
4. ห้ามอนุมาน currency จากชื่อ symbol; ไม่มีหลักฐานให้ระบุ unresolved
5. ไม่เพิ่ม broker trading API, automatic bank sync, admin หรือ cloud services เอง
6. การซื้อขายในเอกสารหมายถึงบันทึกรายการลงทุน ไม่ใช่ execute คำสั่งเงินจริง
7. UI ใช้ SPECIFIC_LOT และ PROPORTIONAL; schema ยังมี FIFO/HIFO/AVERAGE
   ให้แสดงความต่าง ห้ามอ้างว่า PROPORTIONAL เป็น AVERAGE accounting โดยอัตโนมัติ
8. LotAllocation เป็น domain type; schema ที่แนบไม่มีตาราง lot_allocations
9. ค่า native และ historical execution FX ไม่เปลี่ยนตาม display FX
10. คำว่า implemented ใน source ไม่ได้ยืนยันว่า deployed ใน production
11. ไม่ขอ secret หรือข้อมูลส่วนตัว และอย่ารวมข้อมูล auth.users นอก id ที่จำเป็น

ส่งผลเป็นหัวข้อ: วัตถุประสงค์ / ขอบเขต / Mermaid code / วิธีอ่าน /
source evidence / assumptions / unresolved / checklist ตรวจความถูกต้อง
```

## 1. System Architecture Diagram

```text
จาก context กลางและ source ที่แนบ สร้าง logical system architecture แบบ Mermaid flowchart TB
แบ่ง boundary เป็น Browser, Next.js server, Supabase, External services
แสดง:
- React pages, AppContext, CostBasisPanel, Supabase SDK
- shared useFxRate singleton และ useSharedMarketSymbol
- localStorage สำหรับ preferences, FX cache และ draft fallback
- Next.js route handlers/server actions สำหรับ market, chart, analysis และ FX
- Supabase Auth, Data API/RPC, PostgreSQL และ database rules
- TradingView widget, Yahoo Finance และ conditional FX provider chain
แสดงเส้นทาง browser -> Supabase โดยตรงด้วย อย่าบังคับให้ทุก request ผ่าน Next.js
Wise เป็น conditional เมื่อ configured; provider สำรองต้องแยกชื่อ
ใช้ลูกศรมี label บอกข้อมูลที่ส่ง ห้ามใส่ secret หรือ URL ที่มี token
อย่าระบุ region, replica, CDN topology หรือ queue หากไม่มีหลักฐาน
จัดทำ deployment architecture แยกเป็น proposed เท่านั้นหากต้องเสนอเพิ่ม
```

## 2. User Flow Diagram

```text
สร้าง Mermaid flowchart TD จากมุมผู้ใช้ ไม่ใช่ database internals
flow หลัก: login -> dashboard -> เลือกพอร์ต -> ค้นหาหุ้น -> terminal -> trade plan
-> draft DCA -> ตรวจบัญชีเงินสด/ราคา/qty/fee -> บันทึกซื้อ -> Live P&L
-> เลือกไม้เองหรือแบ่งขายตามสัดส่วน -> preview -> ยืนยัน symbol -> บันทึกขาย -> history
มีทางกลับไปแก้เมื่อข้อมูลไม่ผ่านหรือ position เปลี่ยน
แสดง Trade/Terminal ส่ง symbol เดียวกัน และจำหุ้นล่าสุดเมื่อไม่มี explicit URL symbol
แยก draft กับ executed trade ชัดเจน
เพิ่ม branch Portfolio, Bucket, Ledger/History โดยไม่สร้างรายละเอียดที่ source ไม่ยืนยัน
ระบุ start/end หรือ loop ของการใช้งานให้เหมาะสม และอธิบายแต่ละ decision
```

## 3. Class Diagram

```text
สร้าง Mermaid classDiagram ที่ตรงกับ TypeScript domain model
อ่าน cost-basis-ledger.ts, fx.ts, fx-store.ts ก่อนวาด
ใช้ BuyLot, SellTransaction, Position, LotAllocation, Ledger, Decimal,
NativeMoney, FxQuote, FxStore และกลุ่ม functional modules ที่จำเป็น
ระบุ stereotype TypeScriptType, FunctionalModule, FactoryReturnedObject
ห้ามแปลงทุก React function component เป็น OOP class จริง
แสดง immutable buy qty, derived remaining, realized allocation และ decimal arithmetic
ใช้ aggregation/composition เฉพาะเมื่อความหมายสมเหตุผล
ห้ามอ้าง domain type เป็น SQL table หรือเพิ่ม FK ที่ไม่มีจริง
เพิ่ม mapping table: diagram element -> source file -> class/type/module/conceptual
```

## 4. ER Diagram และ Data Dictionary

```text
สร้าง Mermaid erDiagram จาก schema ที่แนบครบ 18 public tables
รวม auth.users เป็น external stub แสดงเฉพาะ id
ต้องครบ 221 public columns และ 41 foreign keys ตาม attachment นี้
อ่าน PK, composite PK, FK และ NULL จาก SQL ไม่เดา cardinality จากชื่อ
cost_basis_methods ใช้ composite PK user_id+portfolio_id+symbol
profiles.id และ cost_basis_sales.sell_id เป็นทั้ง PK และ FK
history_events.portfolio_id/source_record_id/related_bucket_id ไม่มี declared FK
จึงห้ามวาดเป็น enforced FK
allocations ไม่ใช่ LotAllocation และไม่มี lot_allocations table

ส่ง 2 เวอร์ชัน:
A. Full physical ER ทุก field และ declared FK
B. ER แยก 4 กลุ่มให้อ่านง่าย: identity/scope, investments/broker cash,
   buckets/cashflow, planning/audit/cost basis โดยอ้างชื่อ entities เดิม

ส่ง data dictionary มี field, exact SQL type, nullable, default, PK/FK, description
description ที่เป็นการตีความให้ติดป้ายว่า inferred
ระบุ missing native denomination เช่น assets และ portfolio_snapshots
ห้ามเปลี่ยน schema หรือเสนอ backfill ด้วยการเดา
```

## 5. Use Case Diagram

```text
สร้าง use case diagram ของ FinTrack โดยแยกผู้เยี่ยมชมกับผู้ใช้เข้าสู่ระบบ
Supporting actors คือ Supabase Auth, market-data provider และ FX provider
ภายใน system boundary มี:
เข้าสู่ระบบ, จัดการพอร์ต, ดูมูลค่า/P&L, ฝากถอน/โอน,
วิเคราะห์หุ้น, วางแผน DCA, บันทึกซื้อ, บันทึกขาย,
ตรวจ preview/ยืนยัน symbol, ดูประวัติ/แก้รายการที่อนุญาต, ตั้งค่าการแสดงผล
การบันทึกขาย include การตรวจ preview และยืนยัน
อย่าใช้ include เป็นเพียงเส้นแสดงลำดับเวลา และอย่าเพิ่ม actor Admin ถ้าไม่มีหลักฐาน

ถ้าต้องรองรับ Mermaid renderer เก่า ใช้ flowchart LR กับวงรีและระบุว่าเป็น use-case-style
ถ้าเครื่องมือรองรับ native UML use case ให้ใช้ notation ของเครื่องมือนั้น
ตรวจ actor associations, system boundary และทิศ include/extend
อธิบายว่า use case ไม่ใช่ user flow และไม่ใช่ sequence
```

## 6. Sequence Diagram

```text
สร้าง Mermaid sequenceDiagram แยก 3 ไฟล์:
1. Partial/all sale: User -> CostBasisPanel -> cost_basis_preview -> DB
   -> confirmation modal -> cost_basis_sell with fingerprint -> result
   -> fintrack:financial-change -> AppContext reload
2. FX: page subscribers -> shared store -> cache -> valuation API -> provider
   มี alt Auto/Manual, success/failure, stale cache และ missing quote
3. Navigation: Trade -> shared symbol -> localStorage -> Link push Terminal
   -> chart symbol -> search new symbol -> push Trade
   แยก replace query ในหน้าเดิมจาก push ข้ามหน้า

ชื่อ RPC และ fields ต้องตรง source
ใช้ alt/else สำหรับ validation failure และ concurrency conflict
ห้ามวาดว่า call สำเร็จเสมอหรืออ้าง atomicity ที่ยังไม่ตรวจ deployed SQL
แยก repository SQL behavior กับ verified production behavior
ห้ามวาด browser ส่งคำสั่ง order ไปโบรกเกอร์ เพราะไม่มีหลักฐาน
```

## 7. Prompt สำหรับส่วนที่ยังยืนยันไม่ได้ — production topology

```text
ช่วยจัดทำ production deployment diagram โดยยังไม่แก้ระบบ
ใช้ข้อมูลที่ฉันให้เกี่ยวกับ hosting, environments, database region และ network
ก่อนวาดให้ถามเฉพาะข้อมูลที่ขาด เช่น deploy provider, region, staging,
background jobs, CDN, monitoring และ backup policy
ห้ามขอ credentials, tokens, .env หรือ network secrets
ไม่มีหลักฐานให้วาดกล่อง unresolved ไม่เติมบริการยอดนิยมเอง
แยก current verified deployment กับ recommended target architecture
ส่ง Mermaid และ evidence matrix
```

## 8. Prompt สำหรับส่วนที่ยังยืนยันไม่ได้ — database behavior

```text
ตรวจความสอดคล้องระหว่าง schema ที่แนบกับ source RPC/trigger แบบอ่านอย่างเดียว
ห้ามรัน migration หรือแก้ข้อมูล โดยเฉพาะ migration 018
ตรวจชื่อ functions ที่ frontend เรียก: cost_basis_preview, cost_basis_sell,
delete_trade_with_brokerage_cash, replace_brokerage_trade, transfer_bucket_to_broker
ขอเฉพาะ sanitized function definitions, trigger definitions, RLS/grants และ views
ไม่ขอ user rows หรือ secrets
เปรียบเทียบ deployment definitions กับ repository definitions
รายงานว่า frontend SPECIFIC_LOT/PROPORTIONAL กับ DB methods เดิมทำงานสอดคล้องอย่างไร
ระบุ transaction boundary, authorization และ side effects ที่ตรวจพบจริง
อัปเดต sequence diagram เฉพาะส่วนที่มีหลักฐาน ห้ามสรุปปลอดภัยจาก schema อย่างเดียว
```

## 9. Prompt สำหรับ strict UML หรือ presentation artwork

```text
นำ Mermaid และคำอธิบายที่แนบไปจัดรูปแบบเป็นรายงาน/ภาพ SVG
รักษาข้อมูล ชื่อตาราง cardinality และ labels ให้ครบ
ไม่เพิ่ม actors, services หรือ functions เพื่อทำให้ภาพสวยขึ้น
ใช้ภาพละหนึ่งหัวข้อ; ER ใหญ่ให้แบ่งเป็น subsystem โดยมี overview นำ
ใช้ตัวอักษรไทยอ่านได้ เส้นไม่ทับ text และกำกับ notation
หาก rubric ต้องการ strict UML Use Case ให้แปลงเป็น actor รูปคน,
use case วงรี, system boundary และ include/extend ตาม UML
ตรวจ output กับ source Mermaid ทีละ relationship ก่อนส่ง
หากยัง render ไม่ได้ให้ส่ง source และระบุ limitation ไม่อ้างว่าสร้างภาพแล้ว
```

