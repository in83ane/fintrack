# แนวทางแก้รายงาน FinTrack: Web App / PC App / Mobile App

ตรวจ working tree ณ 13 ตุลาคม 2026 เทียบรายงานเดิม เลขหน้าเป็นลำดับหน้า PDF ไม่ใช่เลขหน้าในสารบัญ ห้ามใช้เอกสารนี้แทนผลทดสอบ production เอกสารนี้แก้คำบรรยายและเสนอแผน ไม่ได้แก้แอป ฐานข้อมูล หรือ logic cost basis

## 1. คำอธิบายแพลตฟอร์มที่แก้ตามความต้องการล่าสุด

**ข้อความสำหรับหน้า 11–13:**

> FinTrack เป็นระบบติดตามพอร์ตการลงทุนและจัดการการเงินส่วนบุคคลที่มีเป้าหมายรองรับ Web App, PC App และ Mobile App โดยใช้บัญชีผู้ใช้ ข้อมูลธุรกรรม และกฎการคำนวณทางการเงินร่วมกัน การพัฒนาแบ่งเป็นระยะ เริ่มจาก Responsive Web Application และต่อยอดเป็นแอปติดตั้งบนคอมพิวเตอร์และมือถือ พร้อมปรับการยืนยันตัวตน การนำทาง การจัดเก็บข้อมูล และการทดสอบให้เหมาะกับแต่ละแพลตฟอร์ม

**ข้อความสำหรับผลการพัฒนา บท 4–5:**

> รุ่นที่ตรวจสอบมี implementation ของ Web App ซึ่งเปิดใช้งานผ่านเบราว์เซอร์บนคอมพิวเตอร์และมือถือ ส่วน PC App และ Mobile App เป็นเป้าหมายระยะถัดไป ยังไม่นำมาอ้างเป็นผลการส่งมอบหรือผลทดสอบที่เสร็จแล้ว

ทำได้ในอนาคต แต่ไม่ใช่แค่เปลี่ยนชื่อเว็บเป็นแอป ต้องแยก client ออกจาก server-only code, กำหนด API contract, ปรับ storage/session/deep link และทดสอบกราฟกับอุปกรณ์เป้าหมาย ถ้าใช้ native UI คนละ framework ให้ใช้ financial service ร่วมกัน ไม่บังคับว่าต้อง reuse React component ได้ทุกตัว

## 2. Ledger และคำว่า “ทุกธุรกรรม” — หน้า 19 ข้อ 13

- **สิ่งที่รายงานกล่าว:** จัดการและบันทึกประวัติธุรกรรมทั้งหมดอย่างละเอียด
- **โค้ดจริง:** `src/app/(app)/ledger/page.tsx:230` รวม cashActivities และ trades ที่ไม่ใช่ IMPORT (`:252`, `:280`) รายการโอนถูกจัดเป็น filterType transfer ไม่ได้ถูกตัดออกทั้งหมดตามตัวอย่างเก่า แต่ไม่ได้รวม bucketActivities เป็นแหล่งอิสระใน array นี้
- **เงื่อนไขเพิ่มเติม:** เมื่อเลือกพอร์ตเทรด หน้าเปลี่ยนไปใช้ BrokerLedgerView (`ledger/page.tsx:533`) ซึ่งสร้างแถวจาก brokerageCashEntries และเพิ่ม DIVIDEND ที่ยังไม่มี cash entry เชื่อมอยู่ (`src/components/BrokerLedgerView.tsx:160–222`) ไม่ได้เพิ่ม BUY/SELL ทุกแถวที่ไม่มี cash entry จึงยังอ้างความครบถ้วนโดยไม่ตรวจ reconciliation ไม่ได้
- **ข้อควรระวัง:** comment ที่บอกว่า cashActivities มี bucket movement ทั้งหมด ไม่ใช่หลักฐานว่าข้อมูลจริงทุกแถวมีคู่ mirror การนำ cash + bucket + trade มาต่อกันตรง ๆ อาจแสดงและนับเหตุการณ์เดียวกันซ้ำ
- **แนวทางพัฒนา:** สร้าง normalized transaction read model ที่มี source, sourceId, business-event identity และ native legs แยกรายการเงินจริงจาก trade/import และ audit event; ใช้ FK/reference ที่มีหลักฐาน deduplicate; โอนภายในแสดงทั้งต้นทาง/ปลายทางได้ แต่ไม่คิดเป็นรายได้ใหม่; ตรวจ orphan trade, bucket-only activity และ filter scope ก่อนใช้คำว่า “ทุกประเภท”
- **ข้อความใช้ได้ตอนนี้:** “Ledger แสดงรายการเงินสดและรายการลงทุนตามขอบเขตพอร์ตและตัวกรอง โดยมีมุมมองเฉพาะบัญชีโบรกเกอร์ ส่วนประวัติจากหลายแหล่งต้องผ่านการตรวจความครบถ้วนและรายการซ้ำเพิ่มเติม”
- **เกณฑ์รับงานอนาคต:** fixture ครอบคลุม cash-only, bucket-only, mirrored transfer, trade+cash-entry, trade ที่ไม่มี cash-entry, dividend, import และ reversal; แต่ละ event แสดงตาม policy และไม่เพิ่มยอดรวมซ้ำ

## 3. List / Table View — หน้า 20

- **สิ่งที่รายงานกล่าว:** แสดงสรุปในรูปแบบกราฟและตาราง
- **โค้ดจริง:** ไม่พบ `<table>` ในหน้า Ledger, Cashflow และ BrokerLedgerView ที่ตรวจ ประวัติเน้น list/timeline ทั้งนี้ไม่ใช่ข้อสรุปว่าไม่มีตารางที่หน้าอื่นของแอป
- **แนวทางพัฒนา:** เพิ่มตัวเลือก List / Table ใช้ read model, filter, sorting และ pagination ชุดเดียวกัน คอลัมน์ วันที่ | ประเภท | รายละเอียด | บัญชีต้นทาง/ปลายทาง | ยอดสกุลเดิม | ยอดแปลงเพื่อแสดงผล
- **หลายแพลตฟอร์ม:** Web/PC เลือก Table ได้; Mobile เริ่ม List แต่เปิดรายละเอียดครบได้ ห้ามซ่อนข้อมูลสำคัญไว้เฉพาะ hover
- **ข้อความตอนนี้:** “แสดงประวัติแบบรายการเรียงตามวัน และกราฟสรุป โดยมีแผนเพิ่มมุมมองตารางสำหรับการตรวจสอบบนหน้าจอขนาดใหญ่”
- **ทำได้ในอนาคต:** ได้ โดยไม่ต้องแก้ cost basis; ทดสอบยอดรวมและสิทธิ์เหมือนกันทั้งสองมุมมอง

## 4. Native currency และการรองรับ 4 สกุล — หน้า 11, 20

- **สิ่งที่รายงานกล่าว:** รองรับ THB, USD, JPY, EUR
- **โค้ดจริง:** Ledger ใช้ originalAmount/originalCurrency อยู่แล้ว (`ledger/page.tsx:239–240`, `:266–267`, `:776`) จึงไม่ควรเขียนว่าทุกแถวแสดง amountUSD อย่างเดียว ปัญหาคือ fallback `a.currency || currency`, `trade.currency || 'USD'` และการใช้ truthiness ของ originalAmount ซึ่งทำให้ยอดศูนย์ไม่เท่ากับข้อมูลที่ขาด
- **จุดเสี่ยงอีกแห่ง:** BrokerLedgerView เลือก THB หรือ USD ด้วย ternary จึงไม่รักษา JPY/EUR ตามที่อ้าง (`:173`, `:205`) AppContext มีค่าเริ่มต้น JPY 158 และ EUR 0.89 (`:1564–1565`) ไม่ใช่หลักฐานว่ามี live FX ครบทุกสกุล
- **แนวทางพัฒนา:** ใช้ native amount+currency ที่ยืนยันแล้วเป็นตัวเลขหลัก; ข้อมูลขาดแสดง unresolved; ยอดแปลงเป็นข้อความรองพร้อมเรท/เวลา; convert แต่ละ leg ก่อน sum และไม่ persist display value; แยก valuation FX ปัจจุบันจาก execution FX ในประวัติ ไม่คำนวณประวัติซื้อขายใหม่ตามเรทวันนี้
- **schema:** assets ไม่มี currency ใน schema ที่แนบ ต้องเสนอและอนุมัติการระบุสกุลก่อนใช้งาน ไม่เดาจาก symbol; ไม่กล่าวว่าการออกแบบ target แปลว่า migrate แล้ว
- **ข้อความตอนนี้:** “รุ่นที่ตรวจมีเรทแสดงผลร่วม USD/THB และมีโครงสร้างบางส่วนสำหรับสกุลอื่น เป้าหมายระยะถัดไปคือรองรับ THB, USD, JPY และ EUR ครบทั้งการบันทึก แสดงผล และทดสอบ”
- **ทำได้ในอนาคต:** ได้ ต้องมี provider/นโยบายเรทต่อคู่ ข้อมูล native ยืนยันแล้ว และทดสอบกรณี same-currency exact, full-precision aggregation, reversal และ unresolved ทุก client

## 5. Real-time — หน้า 11–12, 20

- **โค้ดจริง:** AppContext เรียกตลาดตามรอบ 30 วินาที (`:3038`); FX ใช้ shared store, cache และรอบ refresh ไม่ใช่ streaming tick ของตลาด
- **แก้ข้อความ:** “อัปเดตข้อมูลตามรอบและแสดงเวลาของข้อมูลล่าสุด” ไม่ใช้ “ราคาซื้อขายจริงทันที” หรือรับประกันไม่ล่าช้า
- **อนาคต:** ทำ streaming ได้เมื่อผู้ให้บริการ สิทธิ์ใช้งาน และงบประมาณรองรับ ต้องจัดการ reconnect, stale state, ตลาดปิด และ rate limit ไม่รับรองว่าจะใช้ฟรีหรือเท่ากับราคา execution ของโบรกเกอร์

## 6. AI assistant — หน้า 19–20

- **โค้ดจริง:** `src/components/AIFinancialAdvisor.tsx:510` ใช้ parseTransaction และ keyword branches เช่น `:544` ไม่ใช่หลักฐานการเรียก LLM ในเส้นทางนี้ การมี AI SDK ใน package ไม่ยืนยัน feature
- **แก้ข้อความ:** “ผู้ช่วยบันทึกและสรุปข้อมูลแบบใช้กฎ” สำหรับปัจจุบัน; “แผนต่อยอดผู้ช่วยภาษาธรรมชาติด้วย LLM” สำหรับอนาคต
- **อนาคต:** ทำได้โดยเพิ่ม server-side service, user consent, จำกัดข้อมูล, validation และการยืนยันก่อนบันทึกเงินจริง ไม่ให้ AI สั่งซื้อขายหรือแก้ยอดโดยอัตโนมัติ

## 7. สถิติและอินดิเคเตอร์ — หน้า 12, 20

- **โค้ดจริง:** `src/app/api/analytics/route.ts:196–198` คืน Sharpe และ Max Drawdown เป็น 0 placeholder และคำนวณ profitFactor จาก avgWin/avgLoss; Dashboard มีเส้นทางคำนวณอีกชุด ไม่ควรใช้สูตรคนละนิยามแล้วเรียก metric เดียวกัน
- **แก้ข้อความ:** ระบุเฉพาะสถิติที่คำนวณและทดสอบจริง แยกกราฟ/indicators ของ TradingView ออกจาก analytics ที่ระบบคำนวณเอง
- **อนาคต:** นิยามสูตร แหล่งข้อมูล รอบเวลา และ currency basis ร่วมกัน; Profit Factor ใช้กำไรรวม/ขาดทุนรวมตามนิยามที่เลือก; Sharpe ต้องมี return series และสมมติฐานที่ระบุ; Max Drawdown ต้องมี equity series; ค่าที่ยังไม่มีข้อมูลแสดง N/A ไม่แสดง 0 เหมือนวัดแล้ว

## 8. Ledger ไม่เท่ากับ audit log ครบทุก entity — หน้า 19 และบท 3

- **schema จริง:** history_events จำกัด source_table เป็น trades ตาม schema ที่แนบ ส่วน cost_basis_revisions เป็นข้อมูล revision อีกชนิด ไม่มีตาราง LotAllocation แยกใน schema
- **แก้ข้อความ:** แยก “รายการธุรกรรม” ออกจาก “ประวัติการเปลี่ยนแปลงข้อมูล” และแยก TypeScript domain type ออกจากตารางจริง
- **อนาคต:** audit ครบทุก entity ทำได้ แต่ต้องกำหนด event/actor/เวลา/before-after/นโยบายเก็บข้อมูล/สิทธิ์ และ transaction boundary ให้ชัด ห้ามรวม source_record_id เป็น FK ใน ER ถ้า schema ไม่ได้ประกาศ FK

## 9. การเขียนข้อมูลหลายขั้นและการซิงก์หลายอุปกรณ์ — บท 3, หน้า 21–22

- **โค้ดจริง:** AddCashflowModal เรียก addCashActivity แล้วมีเส้นทาง updateMoneyBucket/addBucketActivity แยก การมี optimistic update ไม่ได้ทำให้ทุกคำสั่งเป็น atomic transaction
- **แก้ข้อความ:** อธิบายการบันทึกและ rollback ตามเส้นทางจริง ไม่อ้างว่าข้อมูลทุกอุปกรณ์ซิงก์ทันทีและไม่มี partial failure แล้ว
- **อนาคต:** นำ operation ที่เปลี่ยนเงินจริงหลายรายการเข้าขอบเขต transaction; idempotency key ป้องกัน retry ซ้ำ; version/fingerprint ป้องกัน stale client; conflict ต้องแจ้งผู้ใช้ ไม่ last-write-wins ยอดเงิน; หลัง reconnect โหลด server state ใหม่
- **ขอบเขตเริ่มต้นที่ปลอดภัย:** Web/PC/Mobile ต้องออนไลน์เมื่อยืนยันธุรกรรม ออฟไลน์ดู snapshot ได้โดยมีเวลา/stale label ก่อน การทำ offline write เป็นงานแยก ไม่ใช่ผลตามอัตโนมัติของการมี Mobile App

## 10. ข้อความที่แก้เป็นอนาคตได้ กับข้อความที่ต้องมีหลักฐาน

| ประเด็น / หน้า | แนวทาง |
|---|---|
| Web/PC/Mobile 11–13 | คงเป็นเป้าหมายหลัก แบ่งระยะส่งมอบ; ปัจจุบันยืนยัน Web เท่านั้น |
| ครอบคลุมทุกสินทรัพย์ 12,20 | เป็น roadmap ได้ ต้องทำ capability matrix ตลาด/provider/ราคาสกุลจริง/การทดสอบ; ไม่ใช้แค่ตัวเลือกฟอร์มเป็นหลักฐาน |
| หน้า signals เดิม 19–20 | route เก่าถูก redirect ไป Terminal; แสดง flow ที่เข้าถึงจริง ไม่ใส่หน้าที่ถูกปิดเป็นผลปัจจุบัน |
| Agile/Sprints 18 | อธิบายเป็นวิธีดำเนินงานที่เสนอได้ แต่ห้ามสร้าง sprint log ย้อนหลังโดยไม่มีหลักฐาน |
| ความเร็ว/ปลอดภัย 13,21–22 | ตั้งเป้าหมายและเกณฑ์ทดสอบได้ แต่ต้องวัด performance และทดสอบ authorization จริงก่อนอ้างสำเร็จ |
| ผู้ใช้พึงพอใจ/ลงทุนดีขึ้น 21–23 | ต้องมีงานประเมินจริง ไม่ใช่สิ่งที่ยืนยันได้เพียงเพิ่มโค้ด |
| ตารางคู่แข่ง/อ้างอิง 16–17 | ตรวจต้นฉบับและช่วงเวลาของข้อมูล หลีกเลี่ยง “ทั้งหมด/ไม่มีเลย” โดยไม่มีหลักฐาน |
| โครงเล่ม 1–10,18–19,23–28 | เติมข้อมูลจริง สารบัญ บท3ส่วนที่ขาด อ้างอิง ภาคผนวก และแก้สันปก; ห้ามสร้างชื่อ/คะแนน/กลุ่มตัวอย่าง |

## 11. สัญญาการทำงานร่วม Web / PC / Mobile

1. Source of truth ของรายการที่ยืนยันแล้วอยู่ฝั่ง server; storage ในแต่ละเครื่องเป็น cache/draft ไม่ใช่ ledger กลาง
2. ใช้ domain schema และ monetary precision policy เดียวกัน; native currency ไม่เปลี่ยนเพราะ client เปลี่ยนสกุลที่ดู
3. แยก UI จาก financial operations และแยก server secrets จากทุก client
4. Session, storage, network, navigation และ deep link มี interface ที่ implement ตาม platform; OAuth callback ต้องทดสอบทั้งสามแบบ
5. Shared symbol อยู่ใน app/session state ตามขอบเขตที่กำหนด; ต้องตัดสินใจเพิ่มหากต้องการซิงก์ symbol ข้ามอุปกรณ์ ไม่กล่าวว่า localStorage ทำได้
6. ทดสอบ preview/confirm, duplicate retry, concurrent updates, expired session, offline/reconnect, native balance, accessibility และกราฟบนทุก platform
7. สร้าง install/build/release/signing และ update workflow แยก PC/Mobile พร้อมผลทดสอบก่อนเปลี่ยนสถานะ “แผน” เป็น “รองรับแล้ว”

## 12. ไดอะแกรมที่ใช้ในเล่ม

| ประเภท | ไฟล์ | สถานะ / ใช้อธิบาย |
|---|---|---|
| System Architecture | 01-system-architecture.mmd | As-is จากโค้ด |
| System Architecture เป้าหมาย | 01b-system-architecture-target.mmd | Web/PC/Mobile; เส้นประคือแผน |
| User Flow | 02-user-flow.mmd | ขั้นตอนใช้งาน Web; reuse เป็น functional flow ของ PC/Mobile ในอนาคต |
| Class Diagram | 03-class-domain.mmd | class/type/module จริง ไม่ใช่ทุก node เป็น OOP class |
| ER / Schema | 04-er-full.mmd + database-dictionary.md | 18 public tables + auth.users reference ตาม schema ที่แนบ ไม่ยืนยัน live deployment |
| Use Case | 05-use-cases.mmd | Mermaid flowchart แทน use-case notation; ไม่ใช่ UML use-case renderer โดยตรง |
| Sequence | 06a-sequence-sale.mmd | Preview / confirm / persistence การขาย |
| Sequence เพิ่มเติม | 06b,06c,06d | FX / navigation / cash activity ตามลำดับ |

ER ต้องคง schema ปัจจุบันแม้ architecture เพิ่มแพลตฟอร์ม ไม่สร้างตาราง MobileUser/DesktopUser ซ้ำเพียงเพราะมีหลาย client ไม่เติม proposed field เป็นของจริง แยก schema proposal เป็นฉบับต่างหากเมื่ออนุมัติ

## 13. สถานะไฟล์ส่งมอบรอบนี้

แก้ thesis-replacement-text.md ให้ใช้เป้าหมายหลายแพลตฟอร์ม เพิ่ม target architecture และเอกสารนี้ ส่วน PDF annotated ที่ส่งก่อนหน้าเป็นฉบับตรวจเก่า ไม่ได้แก้เนื้อหาตัวเล่มหรือ annotation ให้เป็นรุ่นใหม่นี้ อ้างข้อกำหนดแพลตฟอร์มจากเอกสารนี้แทน ข้อความยังต้องนำไปจัดหน้าต้นฉบับพร้อมเลขภาพ/สารบัญใหม่
