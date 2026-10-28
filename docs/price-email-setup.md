> Email delivery is paused by user request (27 October 2026). The live worker stores alerts in the account inbox only. See [current implementation](plan-notifications-search.md). The setup below is retained for a future opt-in email feature.

# อีเมลแจ้งเตือนราคา: เปิดใช้แบบฟรี

ทำเสร็จแล้ว: USD/THB เท่านั้น, ตารางเงื่อนไขแยกบัญชี, worker บน Supabase และงานทุก 1 นาที
ยังไม่เปิดการส่งจริง: ไม่มี Resend API key / อีเมลทดสอบ ไม่มีการสมัครหรือเปิดแพ็กเกจเสียเงิน

## เปิดใช้โดยไม่ซื้อโดเมน (ส่งให้ตัวเองก่อน)

1. สมัครบัญชี Free ที่ https://resend.com/signup ด้วยอีเมลเดียวกับที่ใช้เข้า FinTrack
2. สร้าง API key แบบ Sending access ที่ https://resend.com/api-keys
3. เปิด https://supabase.com/dashboard/project/sbojwnbwfepdvtsmzvwc/functions/secrets แล้วเพิ่ม:
   - `RESEND_API_KEY`: API key จาก Resend (อย่าส่งในแชต อย่าใส่ใน NEXT_PUBLIC_*)
   - `RESEND_TEST_RECIPIENT`: อีเมลที่ใช้สมัคร Resend และใช้เข้า FinTrack
   - `RESEND_FROM`: `FinTrack <onboarding@resend.dev>` (ถ้าไม่ใส่ ระบบใช้ค่านี้)
4. รอประมาณ 1 นาที แล้วเปิด FinTrack → กระดิ่ง → ตั้งแจ้งเตือนราคาหุ้น → ตรวจการเชื่อมต่ออีเมล
5. สร้างเงื่อนไขใหม่ เลือกช่องแจ้งทางอีเมล จากนั้นปิดเว็บได้

ใช้ resend.dev ได้เฉพาะอีเมลของบัญชี Resend ในโหมดทดสอบ ไม่ใช่ช่องทางส่งหาใครก็ได้
ถ้าจะส่งให้ผู้ใช้อื่น ต้องมีโดเมนที่ยืนยันใน Resend แล้วตั้ง RESEND_FROM เป็นอีเมลบนโดเมนนั้น
ไม่มีการซื้อโดเมนหรือเพิ่มแพ็กเกจอัตโนมัติ


## เปิดให้ผู้ใช้ทุกบัญชีรับได้

ตัวระบบรองรับแล้ว ไม่ต้องเพิ่มผู้รับทีละอีเมล:

1. เพิ่มโดเมนหรือ subdomain ที่คุณเป็นเจ้าของใน https://resend.com/domains
2. เพิ่ม DNS ตามค่าที่ Resend สร้างให้ และรอให้สถานะเป็น Verified (ห้ามเดาค่า DNS)
3. เปลี่ยน `RESEND_FROM` ใน Supabase Secrets เป็น `FinTrack <alerts@โดเมนที่ยืนยันแล้ว>`
4. หาก API key ถูกจำกัดโดเมน ต้องให้คีย์มีสิทธิ์ส่งจากโดเมนนั้นด้วย
5. `RESEND_TEST_RECIPIENT` ลบได้ หรือปล่อยไว้ก็ได้: โค้ดไม่ใช้จำกัดผู้รับเมื่อ RESEND_FROM เป็นโดเมนของคุณ
6. ผู้ใช้แต่ละคนยืนยันอีเมลบัญชี FinTrack และเลือกแจ้งทางอีเมลตอนสร้างเงื่อนไข

ผู้รับใช้ Gmail, Outlook หรือโดเมนของตัวเองได้ ผู้ใช้แต่ละคนไม่ต้องสมัคร Resend
ผู้ส่งยังต้องเป็นโดเมนที่คุณเป็นเจ้าของและยืนยันกับ Resend แล้ว ไม่สามารถใช้ @gmail.com/@outlook.com ของคุณเป็นโดเมนผู้ส่งที่ยืนยันใน Resend
เพดาน 100/24 ชั่วโมง และ 3,000/31 วันเป็นยอดรวมของทั้งเว็บ ไม่ใช่ต่อคน; เกินแล้วข้ามการส่ง
การลบ RESEND_TEST_RECIPIENT อย่างเดียวโดยยังใช้ onboarding@resend.dev ไม่ปลดข้อจำกัดของผู้ให้บริการ

## เพดานฟรี

- Resend Free: 100 ฉบับ/วัน, 3,000 ฉบับ/เดือน ตามราคาที่ตรวจ 27 ต.ค. 2026
- โค้ดจำกัดเข้มกว่าเล็กน้อย: 100 การจองส่งใน 24 ชั่วโมงย้อนหลัง และ 3,000 ใน 31 วันย้อนหลัง รวมทุกบัญชีในโปรเจกต์
- เกินเพดาน: สถานะ `skipped` / ข้ามการส่ง ไม่เรียก Resend และไม่ย้ายไปบริการเสียเงิน
- Resend ตอบ 429: ข้ามการส่ง ไม่จ่ายเพื่อเพิ่มโควตา
- ไม่เปิด Transactional Overages/Pay-as-you-go ในบัญชี Resend
- หากนำ Resend key เดียวกันไปใช้กับระบบอื่น จำนวนอีเมลนั้นอยู่นอกตัวนับ FinTrack; ต้องคง Resend Free/ปิด overages ไว้ด้วย
- หนึ่งเงื่อนไขส่งครั้งเดียว สูงสุด 20 เงื่อนไขที่รอส่งต่อบัญชี
- Cron ทุก 1 นาทีประมาณ 44,640 ครั้งในเดือน 31 วัน เทียบโควตา Edge Functions Free 500,000 ครั้ง/เดือน (ยังมีโควตา DB/egress อื่นและการใช้งานร่วมโปรเจกต์)

## พฤติกรรมและข้อจำกัด

- รายการเดิมในเบราว์เซอร์ไม่ถูกส่งออกไปเป็นอีเมลอัตโนมัติ ต้องเลือกช่องอีเมลตอนสร้างรายการใหม่
- ถ้าไม่เลือกอีเมล ระบบเดิมตรวจในเบราว์เซอร์ประมาณทุก 15 วินาที
- เลือกอีเมล: เงื่อนไขเก็บใน Supabase; worker ตรวจประมาณทุก 1 นาทีแม้ปิดเว็บ/เครื่องส่วนตัว
- ระบบตรวจเป็นช่วง ไม่ใช่ streaming; ราคาตลาดอาจล่าช้าหรือข้ามการแตะเป้าสั้น ๆ ระหว่างสองรอบได้
- ราคาจาก Yahoo, การแปลง USD/THB ฝั่งเซิร์ฟเวอร์ใช้เรตตลาด THB=X ณ รอบตรวจ ไม่ใช้เรตที่ผู้ใช้กรอกเองในแท็บ
- ค่า `sent` หมายถึงผู้ให้บริการยอมรับอีเมล ไม่ยืนยันว่าเข้า Inbox แล้ว; ตรวจ Spam ได้
- ความล้มเหลวชั่วคราวลองใหม่ทุก 5 นาทีด้วย payload เดิมและ Resend idempotency key เดิม หยุดก่อน 24 ชั่วโมงเพื่อไม่เสี่ยงส่งซ้ำ
- ลบเงื่อนไขยกเลิกงานที่ยังไม่ได้ส่งให้ผู้ให้บริการ อีเมลที่ผู้ให้บริการรับแล้วเรียกคืนไม่ได้
- Supabase Free อาจพักโปรเจกต์เมื่อไม่มีการใช้งาน; ไม่รับประกัน SLA ตลอดเวลา

## สิ่งที่ติดตั้ง

Supabase project: sbojwnbwfepdvtsmzvwc (fintrack), plan Free.

- price_email_alerts: RLS เจ้าของอ่าน/สร้าง/ลบได้ ไม่มีสิทธิ์แก้ผลส่งหรือเลือกผู้รับคนอื่น
- price_email_budget: service-only, quota reservations ไม่หายเมื่อลบ alert
- price_email_worker: service-only, lease และ hash ของ token
- secret token สร้างในฐานข้อมูล เก็บ encrypted Vault ไม่ส่งออกมาที่ browser หรือ source code
- Edge Function price-email-alerts: ตรวจ user JWT ด้วย auth.getUser สำหรับอ่าน readiness; worker ต้องใช้ token ลับจาก Vault
- Cron fintrack-price-email-alerts: ทุก 1 นาที, token ไม่อยู่ในข้อความ cron โดยตรง
- ไม่มี RESEND_API_KEY: worker ตอบ configured:false และไม่ดึงราคาหรือส่งอีเมล

## การตรวจสอบ

- TypeScript ผ่าน
- unit/API tests เดิม+อีเมล: 20 ผ่าน
- UI tests ของอีเมล: 8 ชุด (390/1280px × dark/light × TH/EN) ผ่าน: USD/THB เท่านั้น แม้ค่าเว็บเป็น JPY, ปิดช่องอีเมลเมื่อยังไม่ configured, บันทึกสำเร็จ/ล้มเหลว, ข้ามเมื่อครบโควตา, โหลดประวัติจาก server, ลบ
- UI tests การแจ้งในเบราว์เซอร์เดิม: 8 ชุด ผ่าน
- ทดสอบ SQL จริงแบบ transaction+rollback: cap รายวัน/รายเดือน, payload คงเดิม, RLS แยกบัญชี, ห้าม client แก้สถานะ/จองโควตา/อ่าน worker, ไม่รับ JPY
- Endpoint จริง: ไม่มี auth/invalid JWT ได้ 401; worker token ไม่ถูกต้องไม่มีสิทธิ์ทำงาน
- Cron จริงตอบ HTTP 200 / configured:false / sent:0 ยืนยันว่ารันแม้ไม่มี browser
- ไม่ได้ทดสอบส่งอีเมลจริง เพราะยังไม่มีบัญชี/คีย์ Resend; ทุก email provider call ใน unit/UI tests ใช้ mock
- รายงานภาพและผล UI: output/price-email-alerts/results.json

## อ้างอิง

- https://resend.com/pricing
- https://resend.com/docs/knowledge-base/403-error-resend-dev-domain
- https://resend.com/docs/dashboard/emails/idempotency-keys
- https://supabase.com/docs/guides/functions/schedule-functions
- https://supabase.com/docs/guides/functions/pricing
