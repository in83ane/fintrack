# ใบสรุปผล copy-only concurrency — กรอกสำเนาแล้วส่งกลับ

แม่แบบนี้ยังไม่มีผลทดสอบจริง ใช้คู่กับ [checklist](copy-run-checklist.md) กรอก PASS / FAIL / NOT RUN / UNKNOWN ตามจริง ช่องว่างไม่ใช่ศูนย์ ไม่เติมผลที่คาดเป็นผลที่วัดได้

## 1. ข้อมูลการรันที่ส่งได้

| รายการ | ผลจริง |
|---|---|
| Commit เครื่องมือ / มี diff เครื่องมือหรือไม่ | ________ |
| Node / npm / PowerShell / PostgreSQL versions | ________ |
| เวลาเริ่ม–จบ พร้อม timezone / DB Bangkok day | ________ |
| runId / copy marker UUID (สร้างสำหรับ QA) | ________ |
| Schema writer พร้อม / วิธีตรวจ version | ________ |
| Harness exit code / report.passed / connectionsClosed | ________ |
| sessionErrors จำนวน / error.code / SQLSTATE | ________ |
| ไฟล์ report JSON ที่แนบ (ชื่อไฟล์ ไม่ใช่ credential) | ________ |
| ถ้าไม่มี JSON: ขั้นที่หยุด / sanitized code | ________ |

ไม่ต้องส่ง hostname/IP/project ref/database login จริง ใช้ alias สำเนาที่ไม่มีข้อมูลระบุตัวตน: ________ เก็บค่าที่ใช้เทียบตัวตนไว้ส่วนตัว

## 2. คำรับรองก่อนรัน

- [ ] project ref ใน Dashboard/SQL Editor/Connect ตรงสำเนาและต่างจาก production; ทำ Gate P ซ้ำก่อนทุก mutation
- [ ] ใช้ direct connection; ไม่ใช้ pooler/production credentials/app `.env`
- [ ] วิธี restore ป้องกัน external operations ก่อน activation แล้ว ไม่มีช่วงที่ไม่ทราบสถานะ outbound หรือระบุข้อจำกัดไว้ด้านล่าง
- [ ] ตรวจ scheduler/queue/Vault/Auth SMTP/hooks/Database Webhooks/Edge Functions/secrets และ integrations อื่นครบ
- [ ] marker สร้างหลัง restore; ไม่ใช้ marker เก่าหรือปลอม flags เพื่อผ่าน
- [ ] เขียนเฉพาะ synthetic fixtures; ไม่เปิด app/Auth API กับบัญชีที่ restore มา

| ช่องทางส่งออก | ผลตรวจ/ควบคุม PASS / FAIL / UNKNOWN | หลักฐานแบบไม่เผยค่า/จำนวนที่ neutralize |
|---|---|---|
| pg_cron: ทุก job inactive + inert | ________ | ________ |
| pg_net: queue ว่างและไม่กลับมา | ________ | ________ |
| Vault: known URL และ secrets อื่น | ________ | ________ |
| Auth email / SMTP / Send Email Hook / hooks อื่น | ________ | ________ |
| Database Webhooks / outbound triggers | ________ | ________ |
| Edge deployments / callers / background jobs | ________ | ________ |
| Edge custom secrets / platform-provided credentials | ________ | ________ |
| Wrappers / external schedulers / log drains / integrations | ________ | ________ |
| Isolation ก่อน restore/activation | ________ | ________ |

ข้อจำกัด/ช่วงเวลาที่ isolation ไม่แน่นอน (ไม่ใส่ secret): ________ หาก UNKNOWN ไม่รับรองว่าปลอดภัยและไม่เดินหน้ารัน harness

## 3. ผลสามรอบ — ใส่ค่าที่วัดได้เท่านั้น

เกณฑ์ทั้งสามรอบ: cache/cash sum/debit/withdraw mirror = **200/200/1/1**; total cash/mirror rows = **2/2**; bad links/orphans = **0/0**

| รอบ | A / release | B outcome จริง | observedWaiting | current_amount | cash_sum | debits | mirrors | PASS/FAIL/NOT RUN |
|---|---|---|---|---|---|---|---|---|
| 1 | PLAN / COMMIT | ________ | ________ | ________ | ________ | ________ | ________ | ________ |
| 2 | Ledger / COMMIT | ________ | ________ | ________ | ________ | ________ | ________ | ________ |
| 3 | PLAN / ROLLBACK | ________ | ________ | ________ | ________ | ________ | ________ | ________ |

| รอบ | cash_rows | mirror_rows | checks | ledger_receipts | bad_cash_links | orphan_mirrors | bError code / SQLSTATE / round error |
|---|---|---|---|---|---|---|---|
| 1 | ________ | ________ | ________ | ________ | ________ | ________ | ________ |
| 2 | ________ | ________ | ________ | ________ | ________ | ________ | ________ |
| 3 | ________ | ________ | ________ | ________ | ________ | ________ | ________ |

รอบ 1 คาด checks/receipts = 1/0; รอบ 2–3 = 0/1 รอบ 1–2 ต้อง `rejected_insufficient` และ SQLSTATE P0001 ซึ่ง harness ตรวจข้อความ Insufficient bucket balance แล้ว ไม่ต้องคัด raw DB message; รอบ 3 ต้อง `committed_once` การเห็น P0001 อย่างเดียวไม่พอ `DATABASE_OR_TRANSPORT_FAILURE` ใน bError ต้องอ่านร่วมกับ bOutcome/round passed ไม่ใช่ตัดสินจาก code เดี่ยว

ถ้าหยุดกลางทาง ระบุรอบที่ไม่ได้รัน: ________ ห้ามนับเป็นผ่าน สรุปผล harness: ________ ไม่มี auto retry หรือเติมรายการชดเชย

## 4. Lock evidence — เฉพาะ PID ทดสอบ

คัดตัวอย่างจาก `rounds[].lockSnapshots` ก่อนปล่อย A ให้ครบแต่ละรอบ เก็บเต็มชุดไว้ใน JSON แนบ ห้ามแนบ cluster-wide session dump หรือ query text ของ session อื่น

| รอบ | snapshot timestamp | A PID | B PID | B wait_event_type | B blockers มี A | B granted=false | observed ก่อน COMMIT/ROLLBACK A |
|---|---|---|---|---|---|---|---|
| 1 | ________ | ________ | ________ | ________ | ________ | ________ | ________ |
| 2 | ________ | ________ | ________ | ________ | ________ | ________ | ________ |
| 3 | ________ | ________ | ________ | ________ | ________ | ________ | ________ |

แนบ snapshot เฉพาะ `at`, activity `{pid,state,wait_event_type,wait_event,blockers}` และ locks `{pid,locktype,mode,granted,relation_id,class_id,object_id,objsubid,transaction_id}` ของ A/B ที่เกี่ยวข้อง ตัวอย่างจริงที่ลบสิ่งไม่เกี่ยวข้องแล้ว: ________

จำนวน deadlock ที่ harness พบ / SQLSTATE / รอบ: ________ ไม่พบใน run นี้ไม่ได้แปลว่าไม่มี deadlock ทั้งระบบ

## 5. Audit — รายงานจำนวน ไม่แนบข้อมูลผู้ใช้จริง

| เงื่อนไขการตรวจ | คำตอบ |
|---|---|
| ทั้งสองไฟล์รันสำเร็จใน read-only scope บนสำเนา | ________ |
| ใช้ copy admin เห็นครบทั้งสำเนา ไม่ถูก RLS จำกัด | ________ |
| ดูครบทั้ง 8 result sets ไม่มี truncation/row limit | ________ |
| เวลา audit / ข้อมูลนิ่งระหว่างตรวจหรือไม่ | ________ |
| ถ้า error/partial: SQLSTATE และชุดที่ยังไม่ได้ตรวจ | ________ |

หาก scope ไม่ครบ ห้ามกรอก 0 ให้ใช้ UNKNOWN จำนวนด้านล่างนับผลครบชุด ไม่ใช่เฉพาะหน้าที่ SQL Editor แสดง ไม่ส่ง UUID/ยอด/วันที่ของผู้ใช้จริง แม้ชื่อและอีเมลจะไม่อยู่ใน audit ก็ตาม

| Result set / metric | จำนวนจริง |
|---|---|
| PLAN #1: buckets with findings (จำนวนแถว) | ________ |
| PLAN #1: sum unresolved_count | ________ |
| PLAN #1: sum unknown_type_count | ________ |
| PLAN #1: buckets balance_mismatch=true | ________ |
| PLAN #2: unique activities with reasons | ________ |
| PLAN #2: original_amount_null | ________ |
| PLAN #2: currency_mismatch | ________ |
| PLAN #2: sub_cent | ________ |
| PLAN #2: non_finite | ________ |
| PLAN #2: unknown_type | ________ |
| PLAN #2: owner_mismatch | ________ |
| Writer #1: unlinked_legacy | ________ |
| Writer #1: link_owner_mismatch | ________ |
| Writer #1: missing_mirror | ________ |
| Writer #1: mirror_mismatch | ________ |
| Writer #2: unlinked_bucket_activity | ________ |
| Writer #3: unsafe table grants | ________ |
| Writer #4: unsafe column grants | ________ |
| Writer #5: private function EXECUTE | ________ |
| Writer #6: private schema USAGE | ________ |

หนึ่ง activity มีหลาย reasons ได้ ห้ามบวกรวม reason counts แล้วเรียก unique activities กรณี unresolved/unknown type ห้ามอ้าง known subtotal เป็นยอดที่ตรวจครบแล้ว Security 4 ชุดต้องเป็นศูนย์; financial findings ที่มีอยู่เดิมต้อง review แยก ไม่มีการแก้ย้อนหลัง/เดาจับคู่/ปัดเศษอัตโนมัติ

อธิบาย findings แบบไม่ระบุตัวผู้ใช้/ข้อมูลการเงินจริง: ________

## 6. Guard failure / สิ่งที่ต้องตรวจต่อ

| เวลา/ขั้น/รอบ | sanitized code | SQLSTATE ถ้ามี | ตรวจ read-only อะไรแล้ว | สถานะ transaction/close ที่ทราบ |
|---|---|---|---|---|
| ________ | ________ | ________ | ________ | ________ |

หาก config guard ปฏิเสธก่อน connect อาจไม่มี runId/JSON ให้ระบุเช่นนั้น ไม่ทดลองกับ production และไม่ลด guard หาก commit/close ไม่แน่นอนให้เก็บ fixture IDs จากรายงานไว้ตรวจในสำเนา ไม่รันซ้ำด้วย wallet เดิม

## 7. ตรวจความลับก่อนส่งกลับครั้งเดียว

- [ ] แนบใบสรุปนี้ที่กรอกแล้ว + sanitized `reports/<run-uuid>.json` + lock snapshots ที่จำเป็น
- [ ] JSON มีเฉพาะ synthetic IDs/ข้อมูลทดสอบ; ไม่แนบ raw audit result ของข้อมูลที่ restore
- [ ] ไม่มี connection string, password, token, API key, SMTP credential, session/JWT/cookie หรือไฟล์ `.env`
- [ ] ไม่มีชื่อ/อีเมล/UUID/ยอดเงินของผู้ใช้จริง ไม่มี Vault decrypted values, raw cron command, trigger/function bodies, request headers/body หรือ server logs ที่อาจมีความลับ
- [ ] ไม่แนบภาพ Dashboard ที่เผย secrets/project credentials; ใช้สถานะ/จำนวน/alias แทน
- [ ] เก็บ fixture/หลักฐานไว้ ไม่ cleanup/purge/delete auth users และปิด shell ที่มี credential แล้ว

ข้อสรุปที่ขอให้ผู้ตรวจประเมิน: ________ การผ่าน harness ไม่ใช่อนุมัติ deploy/goal completion/Phase 3/purge/FX และไม่พิสูจน์ broker/transfer/edit/undo races, JWT/PostgREST, recovery และ release gates อื่นทั้งหมด
