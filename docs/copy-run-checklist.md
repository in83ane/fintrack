# Checklist: ผู้ใช้รันทดสอบสอง session บน Supabase สำเนา

สถานะ: คู่มือเตรียมแบบ offline เท่านั้น ไม่มีการรัน SQL/เชื่อมต่อฐานจากการจัดทำเอกสารนี้ ผู้ใช้เป็นผู้ดำเนินการเองบน **Supabase cloud project แยก + direct connection** เท่านั้น ไม่ใช้ pooler ไม่อ่าน `.env` ของแอป ไม่แก้ production และไม่เริ่ม goal completion/Phase 3/purge/FX

ใช้ SQL Editor เป็นเส้นทางหลักสำหรับตรวจ/แก้/audit และ PowerShell 7 + Node สำหรับ harness; psql เป็นทางเลือกท้ายเอกสาร ช่อง `<...>` และ `________` ต้องกรอกเองในสำเนาเอกสารส่วนตัว **อย่า commit หรือส่งเอกสารที่กรอก credentials แล้ว** ตัวเลข 1000/800/200, ชื่อ object, error code และ sentinel เป็นสเปคของเครื่องมือ ไม่ใช่ข้อมูลผู้ใช้

## 0. ใบบันทึกส่วนตัวและจุดยืนยัน project ก่อนแก้ทุกครั้ง

| รายการ (เก็บส่วนตัว ไม่ส่ง credentials กลับ) | กรอก |
|---|---|
| Production project ref จากทะเบียนที่เชื่อถือได้ | `<production-ref>` |
| Copy project ref จาก Dashboard Settings | `<copy-ref>` |
| Copy Dashboard URL / direct host / port / database | ________ |
| Copy login role / backend server IP ที่ตรวจแล้ว | ________ |
| วิธี restore / เวลาที่เสร็จ / หลักฐานปิด outbound ก่อนเริ่ม | ________ |
| Schema version / commit เครื่องมือที่ใช้ | ________ |
| UUID v4 ของ copy marker ใหม่หลัง restore | `<copy-marker-uuid>` |

**Gate P — ทำใหม่ก่อนกด Save/Run ทุกขั้นที่แก้สำเนา รวมการแก้ผ่าน Dashboard:**

1. เปิด Settings ของ **สำเนา** เทียบ project ref กับช่อง copy-ref และ URL ของแท็บ SQL Editor/หน้าที่กำลังแก้ ต้องตรงกันและ **ไม่เท่ากับ production-ref** ปิดแท็บ production เพื่อลดการสลับผิด
2. เทียบ direct host จาก Connect ของสำเนากับ project ref; ห้ามยืนยันจากชื่อ project หรือ `current_database()` เพียงอย่างเดียว เพราะหลาย project ใช้ชื่อฐานเหมือนกัน
3. ตรวจ ID/schema/table/trigger ที่จะเปลี่ยนตรงกับผลอ่านล่าสุดของสำเนา กรอกบันทึก `ขั้น ___ / เวลา ___ / ref ตรงและไม่ใช่ production [ ]` ก่อนทำแต่ละ action
4. ไม่แน่ใจให้หยุด ห้ามแก้ env ให้ตรงกับปลายทางที่บังเอิญต่อได้ ห้ามลบ denylist/marker check หรือใช้ production เพื่อทดลอง

Gate P เป็นการตรวจของผู้ดำเนินการ ไม่ใช่ SQL ที่พิสูจน์ project ref อัตโนมัติ Copy marker เป็นคำรับรองของผู้สร้าง ไม่ใช่หลักฐานเชิงเข้ารหัส และ denylist ใน harness ไม่ครอบคลุม production ทุก project ที่อาจมีภายหลัง

## 1. ปิดช่องทางส่งออกก่อนเปิด/restore สำเนา — จุดหยุดสำคัญของ cloud

**อ่านอย่างเดียว: ทบทวนวิธี restore และช่องทางส่งออกจากข้อมูลการตั้งค่าที่ได้รับอนุญาต ห้ามเชื่อมต่อ production เพื่อทำตามคู่มือนี้**

Supabase ระบุว่า binary “Restore to a New Project” คัดลอก extensions ที่มี external operations และอาจเริ่มทำงานทันทีหลัง restore โดยไม่มีจังหวะให้หยุดก่อนเริ่ม ส่วน Network Restrictions จำกัดการเชื่อมต่อ **เข้า** Postgres/pooler ไม่ได้พิสูจน์ว่าปิด egress แล้ว [Restore documentation](https://supabase.com/docs/guides/platform/clone-project), [Network Restrictions](https://supabase.com/docs/guides/platform/network-restrictions)

- [ ] ถ้ามี cron/webhook/wrapper หรือไม่ทราบว่ามีหรือไม่ **อย่าเริ่ม binary restore แล้วหวังว่าจะปิดทัน** ขอแผน logical restore ที่ตรวจ/neutralize external objects ก่อน activation หรือวิธี isolation ที่ผู้ให้บริการยืนยันก่อน ขั้นตอน restore ไม่ได้ถูกรันหรือจัดทำเป็นสคริปต์ในงานนี้
- [ ] ถ้าสำเนาเปิดมาแล้วโดยไม่ทราบการกัก outbound ให้บันทึกช่วงเวลาที่ไม่แน่นอน หยุด harness และตรวจ incident/วิธีเตรียมสำเนาใหม่ ไม่ติ๊ก `outbound_disabled=true` เพื่อให้ guard ผ่าน
- [ ] บันทึกวิธีควบคุม outbound ที่ใช้งานได้จริงบน cloud: ________ / ผู้ยืนยัน: ________ ถ้าปิดช่องทางได้ไม่ครบให้หยุด ไม่ถือว่าเปลี่ยน URL หนึ่งตัวหรือปิด cron อย่างเดียวเป็น isolation ทั้งระบบ
- [ ] ไม่ให้แอป production, CI, monitoring, external scheduler หรือผู้ใช้จริงเรียกสำเนา และไม่เปิดแอป FinTrack ชี้มาสำเนาระหว่างทดสอบ

ตรวจทั้งสิ่งที่ restore มาและสิ่งที่ตั้งค่าเพิ่มใน project แยก ไม่สันนิษฐานว่า restore นำทุกอย่างมาหรือไม่นำอะไรมาเลย: database/Vault และ Auth user data อาจถูกคัดลอก ขณะที่ Edge deployments/Auth settings ต้องตรวจแยกตามวิธี restore [ขอบเขตการ clone](https://supabase.com/docs/guides/platform/clone-project)

| ช่องทาง | อ่านอย่างเดียว: ต้องตรวจ | แก้เฉพาะสำเนา/การตั้งค่าสำเนา หลัง Gate P |
|---|---|---|
| pg_cron / pg_net | job ทุกตัว, queue, งานที่เรียกฟังก์ชันซ่อน HTTP | neutralize job ที่ตรวจแล้วและจัดการ queue ตาม §3; ห้ามรัน job เพื่อทดสอบ |
| Vault | ตรวจรายชื่อ/ID และผู้ใช้ secret แต่ละตัวแบบส่วนตัว ไม่แสดง decrypted values | neutralize เฉพาะ ID ของ secret สำเนาที่ตรวจแล้ว ห้ามแก้/rotate credential ของ production ที่ provider; หยุดถ้าไม่ทราบผลกระทบ |
| Auth email / SMTP | Email provider, custom SMTP, Send Email Hook, Auth hooks อื่น, invite/reset/magic-link และ security-email settings | ปิด email provider/signups/hooks ที่ส่งออกตามการควบคุมที่รองรับในสำเนา; อย่าถอด custom SMTP แล้วคิดว่าหยุดส่ง เพราะอาจ fallback ไป default SMTP ห้ามกด Send test/invite/reset ห้ามเรียก Auth API |
| Database Webhooks | webhook Dashboard และ non-internal triggers ทุก schema ที่เกี่ยวข้อง รวม `auth.users` และตารางการเงิน | ปิดเฉพาะ trigger ส่งออกที่ตรวจชื่อครบแล้ว ห้าม `DISABLE TRIGGER ALL/USER` เพราะจะปิด writer/PLAN/integrity triggers ไปด้วย |
| Edge Functions | deployed functions, callers/schedules/hooks, background jobs, secrets ทั้งที่ตั้งเองและ platform-provided | ไม่ deploy/call function สำหรับการทดสอบนี้ ถ้าสำเนามี function ส่งออก ให้ถอน deployment ของ function สำเนาที่ตรวจแล้ว/ปิด caller ตามแผน isolation; JWT verification อย่างเดียวไม่ใช่ outbound block |
| Edge secrets / integrations | copied/manual secrets, destination URLs, provider keys, log drains, wrappers/FDW/HTTP extensions และ external callers | เอาเฉพาะ custom credentials ที่ตรวจแล้วออกจากสำเนาหรือแทนด้วยค่า inert; อย่าแก้ reserved platform secrets หรือ schema core ของ Supabase หากควบคุมไม่ได้ให้หยุด |

การปิด Send Email Hook เพียงอย่างเดียวอาจย้อนกลับไป SMTP; hooks และ SMTP ต้องประเมินร่วมกัน [Email hook behavior](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook) Webhooks ใช้ trigger และอาจส่งผ่าน pg_net [Database Webhooks](https://supabase.com/docs/guides/database/webhooks) ส่วน Edge secrets เป็นอีกชุดหนึ่ง และ prefix `SUPABASE_` สงวนให้ platform [Edge secrets](https://supabase.com/docs/guides/functions/secrets)

ทุก Dashboard Save/Delete ข้างต้นเป็น **แก้การตั้งค่าสำเนา** ต้องทำ Gate P ซ้ำต่อ action รายชื่อและผลการปิดเก็บส่วนตัว ส่งกลับเฉพาะสถานะ/จำนวน ไม่ส่ง secret values หรือ raw config

## 2. SQL Editor: เริ่มจากอ่านอย่างเดียว

เปิด SQL Editor ของ copy-ref ที่ตรวจแล้วเท่านั้น คำสั่งในเอกสารเป็นแม่แบบสำหรับผู้ใช้ ยังไม่ได้ execute ระหว่างจัดทำคู่มือ แต่ละ block อ่านใช้ transaction read only; หาก error ให้จบ transaction ด้วย `ROLLBACK` ก่อนทำต่อ

```sql
-- อ่านอย่างเดียว: ตัวตนฐานและ inventory; ไม่ได้พิสูจน์ project ref แทน Gate P
begin transaction read only;
select current_database(), session_user, current_user,
       inet_server_addr(), inet_server_port(), version();
select extname from pg_extension order by extname;
select to_regclass('cron.job') cron_jobs,
       to_regclass('net.http_request_queue') outbound_queue,
       to_regclass('vault.decrypted_secrets') vault_view,
       to_regclass('plan_copy_guard.identity') existing_marker;
select to_regprocedure('public.save_cash_bucket(uuid,uuid,jsonb,numeric)') save_writer,
       to_regprocedure('public.write_bucket_cash(uuid,jsonb)') cash_writer,
       to_regclass('bucket_private.links') links,
       to_regclass('bucket_private.requests') receipts,
       to_regclass('public.plan_month_locks') month_locks;
commit;
```

ต้องมี schema ผ่าน bucket writer ตาม [README](../scripts/plan-copy/README.md) ถ้าขาดให้หยุดรายงาน ไม่ apply SQL/migration เพิ่มจากคู่มือนี้ SQL Editor อาจรายงาน backend IP/role ต่างจาก direct session ได้: ห้ามเดา หากต่างให้ยืนยันด้วย direct read-only session ที่ได้รับอนุญาตหรือผู้ดูแลก่อนตั้ง env

รัน block ต่อไปเฉพาะ relation ที่มีอยู่ แยกทีละ block หาก extension มีแต่ inventory relation หาย หรืออ่านไม่ได้ ให้หยุด ไม่ตีความเป็นศูนย์

```sql
-- อ่านอย่างเดียว: cron ไม่มี raw command/URL/token ในผลลัพธ์
begin transaction read only;
select jobid, active, command ~* '^\s*select\s+1\s*;?\s*$' inert_command
from cron.job order by jobid;
commit;
```

```sql
-- อ่านอย่างเดียว: queue เฉพาะจำนวนและ ID ไม่อ่าน headers/body
begin transaction read only;
select count(*) pending_requests from net.http_request_queue;
select id from net.http_request_queue order by id;
commit;
```

```sql
-- อ่านอย่างเดียว: known URL ตรวจเป็น boolean เท่านั้น; inventory names/IDs เก็บส่วนตัว
begin transaction read only;
select id, name from vault.secrets order by name, id;
select id, decrypted_secret = 'https://disabled.invalid' neutralized_url
from vault.decrypted_secrets where name = 'fintrack_price_alert_url';
commit;
```

```sql
-- อ่านอย่างเดียว: inventory triggers/functions; ยังไม่แสดง body ที่อาจฝัง secret
begin transaction read only;
select t.oid trigger_oid, n.nspname schema_name, c.relname table_name,
       t.tgname trigger_name, t.tgenabled,
       pn.nspname function_schema, p.proname function_name
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
where not t.tgisinternal order by n.nspname,c.relname,t.tgname;
commit;
```

สำหรับ trigger ที่เลือก: **อ่านอย่างเดียว แต่ผลลัพธ์อาจมี secret — ตรวจส่วนตัว ห้ามส่ง output กลับ** ใช้ `pg_get_triggerdef(oid)` และ `pg_get_functiondef(tgfoid)` กรองด้วย `trigger_oid` ที่ตรวจแล้ว ไล่ dependency ของ function ต่อ ไม่ใช้ regex ชื่อเป็นหลักฐานว่าไม่มี network และต้องตรวจ `auth.users` trigger รวม writer/PLAN hooks ที่ fixture จะกระตุ้น

## 3. Neutralize เฉพาะ ID ที่ตรวจแล้ว

ทำเฉพาะเมื่อ isolation ก่อน activation ใน §1 ผ่านแล้ว คำสั่งนี้ไม่ย้อนคืน HTTP/email ที่ส่งไปก่อนหน้า ใช้ทีละ block แทนค่าจากผลอ่านสำเนา ห้าม copy-paste ทุก block แล้วรันรวม

**Gate P ก่อน block นี้ — copy-ref ตรง / ไม่ใช่ production-ref [ ] เวลา ________**

```sql
-- แก้ฐานสำเนา: cron เฉพาะ job ที่ตรวจแล้ว 1 ตัว
select cron.alter_job(job_id := <reviewed-job-id>,
                     active := false, command := 'SELECT 1');
```

**Gate P ก่อน block นี้ — copy-ref ตรง / ไม่ใช่ production-ref [ ] เวลา ________**

```sql
-- แก้ฐานสำเนา: known worker URL secret เฉพาะ UUID ที่ตรวจแล้ว ไม่แก้ token
select vault.update_secret('<reviewed-worker-url-secret-uuid>'::uuid,
                           'https://disabled.invalid');
```

**Gate P ก่อน block นี้ — copy-ref ตรง / ไม่ใช่ production-ref [ ] เวลา ________**

```sql
-- แก้ฐานสำเนา: ลบเฉพาะ HTTP queue IDs ที่ตรวจแล้ว ไม่ใช่ตารางการเงิน
delete from net.http_request_queue
where id in (<reviewed-request-id-list>) returning id;
```

**Gate P ก่อน block นี้ — copy-ref ตรง / ไม่ใช่ production-ref [ ] เวลา ________**

```sql
-- แก้ฐานสำเนา: ปิดเฉพาะ trigger ส่งออกที่ตรวจ function/dependencies แล้ว
-- ห้ามแทนด้วย ALL/USER; ห้ามปิด writer/PLAN/integrity trigger
alter table "<reviewed-schema>"."<reviewed-table>"
disable trigger "<reviewed-outbound-trigger>";
```

ส่วน Auth/Edge/custom secrets อื่นใช้ action เฉพาะสำเนาตาม §1 พร้อม Gate P ทุกครั้ง ไม่ให้ blanket SQL ล้าง Vault/ปิด extension เพราะจะเปลี่ยนสิ่งที่กำลังทดสอบ ไม่แก้ตาราง Auth config ภายในเอง

อ่านตรวจ §2 ซ้ำ: **ทุก cron inactive และ inert**, queue เป็นศูนย์และไม่กลับมา, known worker URL ไม่มีหรือเป็น sentinel เพียงหนึ่งรายการ, outbound triggers ที่ระบุปิดแล้วแต่ financial guards ยังเปิด ถ้าไม่ครบหยุด ถ้า Vault decrypt ไม่ได้หลัง logical restore ให้แก้แผนสำเนากับผู้ดูแล ไม่ข้าม guard หรือคัดลอก production key เพื่อให้ผ่าน

## 4. สร้าง marker หลัง restore และหลังตรวจ isolation

ถ้า marker มีอยู่ก่อน ให้หยุดตรวจ provenance ไม่ใช้ `IF NOT EXISTS` ไม่เขียนทับ marker เดิมเพื่อให้ผ่าน ผู้สร้าง marker ต้องเป็น copy admin ที่ harness จะใช้ ไม่มีการเพิ่ม grant ให้ client เพื่อแก้ปัญหา

```powershell
# ทำในเครื่องเท่านั้น: สร้าง UUID ใหม่ ไม่ต่อฐาน
[guid]::NewGuid()
```

**Gate P ก่อน block นี้ — copy-ref ตรง / ไม่ใช่ production-ref [ ] เวลา ________**

```sql
-- แก้ฐานสำเนา: QA schema เท่านั้น ไม่ใช่ migration ของแอป
-- ตั้ง true เฉพาะเมื่อพิสูจน์ isolation และตรวจ trigger ครบแล้ว
begin;
create schema plan_copy_guard;
revoke all on schema plan_copy_guard from public, anon, authenticated;
create table plan_copy_guard.identity (
  singleton boolean primary key default true check (singleton),
  copy_id uuid not null, database_name text not null, purpose text not null,
  outbound_disabled boolean not null, fixture_triggers_reviewed boolean not null,
  created_at timestamptz not null default clock_timestamp()
);
revoke all on plan_copy_guard.identity from public, anon, authenticated;
insert into plan_copy_guard.identity
 (copy_id,database_name,purpose,outbound_disabled,fixture_triggers_reviewed)
values ('<new-copy-marker-uuid-v4>'::uuid,current_database(),
 'fintrack-disposable-concurrency-copy',true,true);
commit;
```

```sql
-- อ่านอย่างเดียว: marker/สิทธิ์; สำหรับ role ที่ใช้รัน harness จริง
begin transaction read only;
select copy_id, database_name, purpose, outbound_disabled, fixture_triggers_reviewed
from plan_copy_guard.identity;
select pg_has_role('<copy-admin-role>','authenticated','MEMBER') can_assume_app_role,
 has_table_privilege('<copy-admin-role>','auth.users','INSERT') can_seed,
 has_table_privilege('<copy-admin-role>','bucket_private.links','SELECT') can_read_links,
 has_table_privilege('<copy-admin-role>','bucket_private.requests','SELECT') can_read_receipts;
select r.role_name,
 has_table_privilege(r.role_name,'plan_copy_guard.identity','INSERT,UPDATE,DELETE,TRUNCATE') unsafe
from (values('anon'),('authenticated')) r(role_name);
commit;
```

ต้องมี marker แถวเดียวตรง UUID/ฐาน/purpose, flags จริงทั้งสอง, admin checks จริง และ unsafe เท็จ หาก SQL Editor role กับ direct login ต่างกันอย่าอนุมานสิทธิ์แทนกัน

## 5. เตรียมเครื่องและ env แบบ masked

```powershell
# ในเครื่องเท่านั้น: ไม่ต่อฐาน; npm ci ติดต่อเฉพาะ npm registry
Set-Location '<local-fintrack-repository>'
git rev-parse HEAD
node --version
npm --version
npm ci --prefix scripts/plan-copy --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
npm test --prefix scripts/plan-copy
npm run check --prefix scripts/plan-copy
node scripts/plan-copy/run.mjs --help
```

ทุกคำสั่งต้อง exit 0; หากคำสั่งใดไม่ผ่านให้หยุด (PowerShell ไม่หยุดเองทุก native error) ใช้ Node >=22 ตาม package และ PowerShell 7 สำหรับ `-MaskInput` ไม่ติดตั้งที่ root และไม่อ่าน `.env` ไม่เปิด transcript/debug environment dump

```powershell
# ตั้งค่าใน shell เท่านั้น ยังไม่ต่อฐาน; เปิด terminal เฉพาะงานและปิดหลังเสร็จ
$copyRef = Read-Host 'Copy project ref verified in Dashboard'
$productionRef = Read-Host 'Production ref from your private inventory'
if ([string]::IsNullOrWhiteSpace($copyRef) -or [string]::IsNullOrWhiteSpace($productionRef) -or $copyRef -eq $productionRef) { throw 'Stop: project identity not confirmed' }
$env:PLAN_COPY_DATABASE_URL = Read-Host 'Copy-only direct PostgreSQL URL' -MaskInput
$env:PLAN_COPY_EXPECTED_HOST = '<verified-direct-copy-host>'
$env:PLAN_COPY_EXPECTED_PORT = '<verified-direct-port>'
$env:PLAN_COPY_EXPECTED_DATABASE = '<verified-database>'
$env:PLAN_COPY_EXPECTED_LOGIN_ROLE = '<verified-copy-admin-role>'
$env:PLAN_COPY_EXPECTED_SERVER_ADDRS = '<verified-backend-IP-or-comma-separated-IPs>'
$env:PLAN_COPY_ID = '<new-copy-marker-uuid-v4>'
$env:PLAN_COPY_CONFIRM = 'I_UNDERSTAND_THIS_IS_A_DISPOSABLE_COPY'
# Local cross-check for the Supabase direct hostname selected in Connect.
if ($env:PLAN_COPY_EXPECTED_HOST -ne "db.$copyRef.supabase.co") { throw 'Stop: verify direct endpoint with project administrator' }
```

URL ต้องมี user/password/host/port/database ชัดเจน ไม่มี query/hash; percent-encode credential ที่มีอักขระพิเศษ อย่าใส่ `sslmode` ใน URL ของ harness เพราะ guard ไม่รับ query ตัว harness เปิด verified TLS เองบน cloud ห้าม `NODE_TLS_REJECT_UNAUTHORIZED=0`/ลด TLS verification หากต้องใช้ CA ให้ตรวจ certificate ของสำเนากับผู้ดูแล

ถ้า direct host เป็น IPv6 แต่เครื่องเข้าไม่ได้ ให้เตรียม network ที่รองรับหรือ direct IPv4 ของสำเนาตามบริการที่มี ไม่สลับไป pooler ห้ามแก้ expected IP จาก DNS อย่างเดียว เพราะ guard เทียบ `inet_server_addr()`/port หลังต่อจริง หาก backend IP ต่างจาก SQL Editor ให้หยุดตรวจด้วย direct read-only session ก่อนรัน

## 6. รัน harness — ผู้ใช้ดำเนินการเอง

**Gate P ก่อนคำสั่งนี้ — copy-ref ใน Dashboard/Connect ตรง expected host / ไม่ใช่ production-ref [ ] เวลา ________**

```powershell
# แก้ฐานสำเนา: สร้าง fixture สังเคราะห์และทดลอง writer; ไม่ใช่ read-only
# ยืนยัน Gate P และ isolation อีกครั้งก่อน Enter
if ((Read-Host 'Retype the copy project ref immediately before this run') -ne $copyRef) { throw 'Stop: copy ref mismatch' }
node scripts/plan-copy/run.mjs --run
$runExitCode = $LASTEXITCODE
Write-Output "Harness exit code: $runExitCode"
```

ห้ามรันคำสั่งนี้ระหว่างเตรียมเอกสาร Harness ใช้ 2 contenders + 1 read-only observer แต่ละรอบใช้ user/portfolio/wallet/plan ใหม่ เปิด THB 1000 ผ่าน writer แล้วหัก 800; ไม่ใช้ผู้ใช้จริง ไม่เรียก Auth API ไม่แก้ rate ย้อนหลัง

| รอบ | A ถือ transaction | B ต้องรอ | ปล่อย A | B ที่ผ่านเกณฑ์ |
|---|---|---|---|---|
| 1 | PLAN หัก 800 | Ledger หัก 800 | COMMIT | `rejected_insufficient` |
| 2 | Ledger หัก 800 | PLAN หัก 800 | COMMIT | `rejected_insufficient` |
| 3 | PLAN หัก 800 | Ledger หัก 800 | ROLLBACK | `committed_once` |

ทุกรอบต้องได้ `current_amount / cash_sum / debits / mirrors = 200 / 200 / 1 / 1` และ `cash_rows=2`, `mirror_rows=2` (รวม opening), `bad_cash_links=0`, `orphan_mirrors=0` รอบ 1 มี `checks=1`, `ledger_receipts=0`; รอบ 2–3 เป็น `checks=0`, `ledger_receipts=1`

ก่อนปล่อย A ต้องมี B `wait_event_type='Lock'`, `pg_blocking_pids(B)` มี PID ของ A และ B มี lock `granted=false` ไม่ใช้การ sleep เป็นหลักฐาน รอบ 1–2 ต้องเป็น **SQLSTATE P0001 และข้อความ Insufficient bucket balance** ซึ่ง harness ตรวจภายในแล้ว JSON เก็บ `bOutcome` และ sanitized SQLSTATE ไม่เก็บ raw message; arbitrary P0001, timeout/deadlock ถือว่าล้มเหลว แม้ `bError.code` แสดง `DATABASE_OR_TRANSPORT_FAILURE` คู่กับ P0001 ก็อาจเป็น expected rejection ได้ ต้องดู `bOutcome`/`passed` ของรอบร่วมกัน

ผ่านเมื่อครบ 3 รอบ, ทุก `passed=true`, ระดับรายงาน `passed=true`, `sessionErrors=[]`, `connectionsClosed=true`, exit 0 เท่านั้น รอบที่หยุดก่อนถือว่า NOT RUN ไม่ใช่ผ่าน เก็บ `reports/<run-uuid>.json` แม้ fail; early config/driver failure อาจยังไม่มี JSON ให้ส่ง sanitized code และ exit code แทน

Timeout ตามโค้ด: connect 5s, รอหลักฐาน lock 5s, lock 15s, statement 30s, query 35s, idle transaction 45s, watchdog 180s ไม่ขยาย/ลด guard เพื่อให้ผ่าน ถ้าใกล้เที่ยงคืน Bangkok ให้เลื่อนรัน; ข้ามวันให้ run ใหม่พร้อม fixture ใหม่หลังตรวจ failure เดิม ไม่มี auto retry/cleanup/purge/การฆ่า session ทั้งฐาน

## 7. Audit ด้วย SQL Editor — อ่านอย่างเดียว

ตรวจ copy-ref อีกครั้ง แม้เป็น read-only ต้องไม่อ่าน production ใช้ admin ที่ได้รับอนุญาตเห็นทั้งสำเนา ไม่ใช้ anon/authenticated ที่ RLS อาจทำให้เห็นศูนย์หลอก จดว่า scope ครบหรือ partial ถ้าไม่ครบถือว่า audit ไม่สมบูรณ์

1. เปิดไฟล์ [plan-bucket-audit.sql](../scripts/plan-bucket-audit.sql) ในเครื่อง วาง **ทั้งไฟล์ไม่แก้เนื้อหา** ใน SQL Editor ของสำเนาแล้วรัน: มี `BEGIN TRANSACTION READ ONLY` และ `COMMIT` อยู่แล้ว **ไม่ wrap transaction ซ้ำ** เก็บทั้งสอง result sets
2. เปิด [bucket-writer-audit.sql](../scripts/bucket-writer-audit.sql) วางทั้งไฟล์ระหว่าง `BEGIN TRANSACTION READ ONLY;` กับ `COMMIT;` ใน editor แล้วรันใน batch เดียว ไฟล์นี้ยังไม่มี wrapper เก็บทั้งหก result sets (financial 2 + security 4)
3. หาก editor แสดงเพียง result สุดท้าย ให้รันแต่ละ SELECT/CTE สมบูรณ์แยกกันใน read-only transaction โดยไม่แก้เงื่อนไข query อย่ารายงานผลชุดที่ไม่ได้ดูเป็น 0 ตรวจ row limit/truncation; ถ้าถูกจำกัดต้อง export ทั้งชุดไว้ส่วนตัวหรือใช้ psql ก่อนนับ ถ้า SQL error ให้บันทึก SQLSTATE แล้ว `ROLLBACK` เฉพาะ session ตนเอง ห้ามแก้ grant/ข้อมูลเพื่อให้ audit เงียบ

| ผล audit ที่ต้องสรุป | วิธีนับ/เกณฑ์ |
|---|---|
| PLAN audit ชุด 1 | จำนวน bucket ที่มีปัญหา; sum `unresolved_count`, sum `unknown_type_count`; จำนวน `balance_mismatch=true` แยกกัน ไม่เอา subtotal ที่ unresolved มาอ้างว่า balance ตรง |
| PLAN audit ชุด 2 | จำนวน activity ต่างกันทั้งหมดและจำนวนตาม `reasons`; หนึ่งรายการมีหลายเหตุผลได้ ห้ามบวกจำนวนเหตุผลเป็นจำนวน unique rows |
| Writer audit ชุด 1 | จำนวนแยก `unlinked_legacy`, `link_owner_mismatch`, `missing_mirror`, `mirror_mismatch` |
| Writer audit ชุด 2 | จำนวน `unlinked_bucket_activity` |
| Writer audit ชุด 3–6 | direct table grant, column grant, private function EXECUTE, private schema USAGE สำหรับ anon/authenticated ต้องว่างทุกชุด |

ส่งเฉพาะจำนวน/ชนิดเหตุผล ไม่ส่ง user/bucket/activity IDs จริงหรือยอดการเงินจริงจาก audit UUID ของ synthetic fixture ใน harness ส่งได้ ผล legacy unlinked/unresolved ที่ไม่เป็นศูนย์ต้อง review แยกและคงข้อจำกัดการแก้/ย้อนรายการ; ไม่เดาจับคู่ ไม่ซ่อม ไม่ถือว่า “ผ่าน deploy” ส่วน fixture ต้องตรงและไม่มี orphan, balance/link/owner mismatch หรือ security findings ต้องหยุด release review

### ทางเลือก psql (เฉพาะหากติดตั้งแล้ว)

SQL Editor เพียงพอสำหรับขั้นตรวจ/แก้/audit; Node ยังใช้รัน harness อย่าใช้ psql ส่ง SQL ที่แก้สำเนาโดยข้าม Gate P

```powershell
# อ่านอย่างเดียวบนสำเนา: เข้า direct session; password prompt ไม่ใช่ URL ใน command line
# รันใน shell เฉพาะงานที่ไม่มี PG* เดิม ไม่อ่าน app .env; sslmode นี้เป็นของ psql เท่านั้น
$env:PGSSLMODE = 'verify-full'
$env:PGOPTIONS = '-c default_transaction_read_only=on'
psql -X -W -h '<verified-direct-copy-host>' -p '<verified-port>' -U '<copy-admin-role>' -d '<verified-database>' -v ON_ERROR_STOP=1
```

```text
-- คำสั่งใน psql: อ่านอย่างเดียว ไม่ใช่คำสั่ง PowerShell
select current_database(), session_user, inet_server_addr(), inet_server_port();
show default_transaction_read_only;
\i '<absolute-local-path>/scripts/plan-bucket-audit.sql'
\i '<absolute-local-path>/scripts/bucket-writer-audit.sql'
\q
```

ยืนยัน identity ก่อน `\i` ทั้งสองครั้ง หากต้องใช้ root CA ให้ติดตั้ง certificate ที่ตรวจแล้วตาม PostgreSQL/Supabase ไม่ลด `verify-full` Result audit เก็บส่วนตัว ไม่ใส่ password ใน arguments หรือ log

## 8. รหัส guard และการหยุดอย่างปลอดภัย

ตารางนี้อ้างอิง source ใน `scripts/plan-copy/` ไม่รวมข้อความ driver แบบไม่ผ่านการ sanitize แต่ละแถวเป็นขั้นตรวจ/แก้ **ในสำเนาที่ผ่าน Gate P เท่านั้น** ไม่มี bypass; ถ้าต้องเปลี่ยนสิทธิ์/schema นอกแม่แบบให้ขอ review แยก ไม่ grant กว้างเพื่อให้ผ่าน

| Code | ความหมาย / ทางแก้ที่ปลอดภัย |
|---|---|
| `ENV_CONFIRM_REQUIRED` | ไม่มี/เว้นวรรค confirmation; กรอกค่าคงที่ใน §5 หลังตรวจสำเนา |
| `ENV_DATABASE_URL_REQUIRED` | URL ว่าง; รับด้วย masked input ใหม่ ห้ามใช้ app env |
| `ENV_EXPECTED_HOST_REQUIRED` | กรอก host จาก Connect ของสำเนาที่ตรวจเอง |
| `ENV_EXPECTED_PORT_REQUIRED` | กรอก direct port ที่ตรวจแล้ว |
| `ENV_EXPECTED_DATABASE_REQUIRED` | กรอกชื่อฐานจาก identity read-only |
| `ENV_EXPECTED_LOGIN_ROLE_REQUIRED` | กรอก copy admin role ที่ยืนยันแล้ว |
| `ENV_EXPECTED_SERVER_ADDRS_REQUIRED` | กรอก backend IP ที่อ่านตรวจ ไม่ใช้ wildcard |
| `ENV_ID_REQUIRED` | กรอก UUID ของ marker ใหม่หลัง restore |
| `CONFIRMATION_MISMATCH` | คำยืนยันไม่ตรง; ทบทวนขอบเขตแล้วใช้ค่าที่ §5 ไม่แก้โค้ด |
| `INVALID_DATABASE_URL` | รูปแบบ/protocol/encoding/query/hash/ความยาวผิด; แก้เฉพาะ URL สำเนา ห้าม log ค่า |
| `INVALID_HOST` | host ไม่ถูกต้อง; ตรวจ direct endpoint ใหม่ |
| `PRODUCTION_ENDPOINT_FORBIDDEN` | พบ production ref ใน host/user/db; หยุดและเลิกใช้ credential ชุดนี้กับเครื่องมือ |
| `DIRECT_CONNECTION_REQUIRED` | เป็น pooler; ใช้ direct ของสำเนา ไม่แก้ denylist |
| `PORT_MISMATCH` | URL กับ expected port ไม่ตรง/ไม่ถูกต้อง; ตรวจ Connect และ backend ไม่ใช้ port forwarding เพื่อหลบ |
| `HOST_MISMATCH` | URL กับ expected host ไม่ตรง; หยุดตรวจ project ref |
| `DATABASE_MISMATCH` | db ไม่ตรง/รูปแบบไม่รองรับ; ตรวจ target ไม่เปลี่ยนชื่อฐานเพื่อเอาใจ guard |
| `LOGIN_ROLE_MISMATCH` | role ไม่ตรง/ไม่มี password/รูปแบบไม่รองรับ; ตรวจ copy login โดยไม่เผยรหัส |
| `ADMIN_LOGIN_REQUIRED` | ใช้ anon/authenticated/service_role เป็น login; ใช้ copy admin ที่ได้รับอนุญาต |
| `INVALID_SERVER_ADDRESSES` | ไม่ใช่ IP list; ตรวจ backend address ไม่เดาจาก hostname |
| `INVALID_COPY_ID` | ไม่ใช่ UUID v4; ตรวจ marker เดิม ห้ามสร้างใหม่ทับเพื่อผ่าน |
| `LIVE_IDENTITY_MISMATCH` | db/session role/current role จริงไม่ตรง; หยุดตรวจปลายทาง |
| `LIVE_SERVER_MISMATCH` | backend IP/port ไม่ตรง; ตรวจ direct path/NAT/SQL Editor ต่าง backend ก่อนแก้ค่าคาดหวัง |
| `LIVE_ROLE_OR_READ_ONLY_MISMATCH` | ไม่เริ่ม read-only หรือ assume authenticated ไม่ได้; ตรวจ role/config สำเนา ขอ review สิทธิ์ |
| `INVALID_BACKEND_PID` | PID ไม่ถูกต้อง; หยุดส่งรายงาน ปัญหา driver/protocol/ผล query |
| `DISTINCT_SESSIONS_REQUIRED` | ไม่ได้ 3 backend ต่างกัน; ตรวจ direct connection ห้ามใช้ pooler |
| `COPY_MARKER_MISMATCH` | marker จำนวน/UUID/db/purpose/flags ไม่ตรง; ตรวจ provenance และ isolation ไม่ปลอม flags |
| `COPY_MARKER_CLIENT_WRITABLE` | anon/authenticated เขียน marker ได้; หยุด ตรวจ ACL และใช้การ revoke เฉพาะ marker ตาม §4 หลัง Gate P |
| `WRITER_PREREQUISITES_MISSING` | schema writer/links/month locks ไม่ครบ; หยุดขอแผนเตรียม schema ไม่ apply อัตโนมัติ |
| `COPY_ADMIN_PRIVILEGES_REQUIRED` | admin seed/read links/receipts ไม่ได้; ตรวจ role และขอ review ไม่ให้สิทธิ์แอปเพิ่ม |
| `CRON_INVENTORY_UNAVAILABLE` | มี extension แต่ตรวจ job relation ไม่ได้; หยุดตรวจ setup/สิทธิ์ |
| `NET_INVENTORY_UNAVAILABLE` | มี pg_net แต่ตรวจ queue ไม่ได้; หยุด ไม่ถือว่า queue ว่าง |
| `SCHEDULER_NOT_NEUTRALIZED` | job active หรือแม้ inactive แต่ไม่ inert; อ่านตรวจแล้วแก้ทีละ reviewed ID ตาม §3 |
| `OUTBOUND_QUEUE_NOT_EMPTY` | queue มีรายการ; คง isolation ตรวจที่มาแล้วจัดการเฉพาะ ID ตาม §3 |
| `COPIED_WORKER_URL_NOT_NEUTRALIZED` | URL ไม่ inert/มีหลาย secret ชื่อนี้; ตรวจส่วนตัว ไม่เผยค่า; duplicate ต้อง review ก่อน |
| `OBSERVER_VISIBILITY_INSUFFICIENT` | observer ไม่เห็น 3 session/role/application name ตรง; ตรวจสิทธิ์ copy admin ไม่ผ่อนเงื่อนไข wait |
| `SYNTHETIC_FIXTURE_REQUIRED` | ID/provenance fixture ผิด; หยุดส่งรายงาน ห้ามใส่ ID ผู้ใช้จริง |
| `FIXTURE_NOT_READY` | ไม่มี plan UUID/day ที่ถูกต้อง; ตรวจ seed error ไม่เติม ID เอง |
| `FIXTURE_AUTH_MISMATCH` | role/auth.uid ไม่ใช่ synthetic owner; หยุดตรวจ schema/auth emulation |
| `BANGKOK_DAY_CHANGED_START_NEW_RUN` | ข้ามเที่ยงคืน; เก็บหลักฐาน ตรวจธุรกรรมเดิมก่อนเริ่ม run ใหม่ ไม่ reset wallet |
| `PLAN_DID_NOT_DEBIT` | PLAN ไม่คืน cash_id หนึ่งแถว; ส่งผลตรวจ ไม่สร้าง transaction ชดเชย |
| `UNKNOWN_COMPETITOR` | scenario ไม่ใช่ plan/ledger; ตรวจไฟล์เครื่องมือ ไม่แก้ DB |
| `B_FINISHED_WITHOUT_OBSERVED_WAIT` | B จบก่อนมีหลักฐานรอ; FAIL ไม่แทนด้วย sleep |
| `BLOCKING_NOT_PROVEN` | ไม่พบหลักฐานภายในเวลา; FAIL ส่ง lock snapshots ไม่เพิ่ม timeout เพื่อผ่าน |
| `B_MUST_REJECT_INSUFFICIENT` | รอบ commit ไม่ได้ error ที่คาด; FAIL ตรวจยอด/locks ไม่ clamp cache |
| `B_MUST_SUCCEED_AFTER_ROLLBACK` | B ไม่สำเร็จหลัง rollback; FAIL ตรวจ error/locks ไม่ retry เดิมอัตโนมัติ |
| `FINANCIAL_ASSERTION_FAILED` | ยอด/count/link/orphan/receipt ไม่ตรง; FAIL เก็บ `actual` และ fixture IDs ไม่ซ่อม |
| `FIXTURE_WALLET_MISSING` | ไม่พบ wallet หนึ่งแถว; ตรวจ transaction/สิทธิ์ด้วย synthetic IDs เท่านั้น |
| `RUN_INTERRUPTED` | ผู้ใช้ยกเลิก/abort; incomplete ตรวจ close และ commit ที่อาจไม่แน่นอน |
| `RUN_WATCHDOG_TIMEOUT` | run เกินเวลา; incomplete ตรวจ session/หลักฐาน ไม่ปิด watchdog |
| `SESSION_ERRORS_RECORDED` | มี async session errors; FAIL แม้บางรอบผ่าน |
| `CONNECTION_CLOSE_UNCONFIRMED` | ยืนยันปิด connection ไม่ได้; incomplete ให้ admin ตรวจเฉพาะ PID ทดสอบ ไม่ kill ทั้งฐาน |
| `DEADLOCK` | SQLSTATE `40P01`; FAIL ส่ง snapshot เฉพาะ session ทดสอบ |
| `DATABASE_OR_TRANSPORT_FAILURE` | error ถูก sanitize; ดู SQLSTATE + phase + bOutcome; P0001 ที่ตรง expected rejection อาจเป็นผลที่ถูกต้อง ส่วน permission/timeout/network ต้องหยุดตรวจ ไม่ส่ง raw error |
| `INVALID_ARGUMENTS` | CLI arguments ไม่รองรับ; ใช้ `--help` ก่อน `--run` เฉพาะเมื่อพร้อม ไม่ใส่ URL เป็น argument |

Driver/import/disk failure อาจไม่มี JSON หรือ SQLSTATE; อย่าเดาว่าเป็น guard ตัวใด ส่งเพียง sanitized code/exit/ขั้นที่หยุด ถ้ามี report ให้แนบด้วย ไม่ส่ง stack/raw exception ที่อาจมี credentials

## 9. ส่งผลกลับครั้งเดียวและเก็บหลักฐาน

กรอก [ใบสรุปผล](copy-run-results-template.md) แนบ JSON ของ run ที่ตรวจความลับแล้ว พร้อมจำนวน audit ครบ 8 result sets และ lock snapshot เฉพาะ PID ทดสอบ ไม่ส่ง raw audit/config/SQL/secret หาก run ไม่จบให้ระบุ NOT RUN/UNKNOWN ให้ตรงจริง

เก็บ fixtures และหลักฐานไว้ ไม่มี auto cleanup ห้ามใช้ Delete All Data, ลบ `auth.users`, purge หรือรีเซ็ตยอดใน wallet เดิมเพื่อรันซ้ำ ปิด terminal ที่เก็บ credentials หลังจบ ไม่อ้างว่าผ่าน concurrency แล้วเปิดให้ deploy หรือเริ่มงานที่พักไว้ได้ทันที ยังต้อง review release gates อื่นตาม [project status](project-status.md)
