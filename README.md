# FinTrack

ยินดีต้อนรับสู่ **FinTrack** แอปพลิเคชันจัดการพอร์ตโฟลิโอและการเงินส่วนบุคคลที่ครอบคลุม ถูกออกแบบมาเพื่อช่วยให้คุณติดตามการลงทุน จัดการกระแสเงินสด (Cashflow) และตั้งงบประมาณได้อย่างมีประสิทธิภาพผ่านระบบ Money Buckets

## ฟีเจอร์หลัก
- **Portfolio Management**: ติดตามสินทรัพย์และการลงทุนของคุณได้ในที่เดียว
- **Money Buckets**: จัดสรรเงินและตั้งเป้าหมายงบประมาณได้อย่างเป็นสัดส่วน
- **Cashflow Tracking**: บันทึกรายรับ-รายจ่าย เพื่อให้เห็นภาพรวมทางการเงินที่ชัดเจน
- **Dashboard & Analytics**: เห็นภาพรวมความมั่งคั่งและผลตอบแทนผ่านกราฟที่สวยงาม
- **Multi-currency Support**: รองรับสกุลเงิน (USD, THB , JPY , EUR)

## การติดตั้งและรันโปรเจกต์

โปรเจกต์นี้พัฒนาด้วย Next.js และใช้ Supabase เป็น Database

**สิ่งที่ต้องมี:** Node.js (เวอร์ชัน 18+ ขึ้นไป)

1. **Clone โปรเจกต์ และติดตั้ง dependencies:**
   ```bash
   npm install
   ```
2. **ตั้งค่า Environment Variables:**
   คัดลอกไฟล์ `.env.example` ไปเป็น `.env.local` และใส่ค่าต่างๆ ให้ครบถ้วน (เช่น Supabase Keys, Google OAuth)
   ```bash
   cp .env.example .env.local
   ```
3. **ตั้งค่า Supabase:**
   - สร้างโปรเจกต์ Supabase ใหม่ หากยังไม่มี
   - ดาวน์โหลดไฟล์ SQL สกีม่า (`supabase_schema.sql`) จากโฟลเดอร์ `supabase/` หรือจากรีโป
   - ใช้ Supabase CLI เพื่อสร้างตารางในฐานข้อมูล:
     ```bash
     # ติดตั้ง Supabase CLI ถ้ายังไม่มี
     npm install -g supabase
     # เข้าสู่ระบบ Supabase
     supabase login
     # ตั้งค่าโปรเจกต์ (replace <project-ref> ด้วย reference ของคุณ)
     supabase link --project-ref <project-ref>
     # ดันสกีม่าไปยังฐานข้อมูล
     supabase db push supabase_schema.sql
     ```
   - หรือใช้ `psql` หากคุณมีการเชื่อมต่อ PostgreSQL โดยตรง:
     ```bash
     psql <connection-string> -f supabase_schema.sql
     ```
4. **รันเซิร์ฟเวอร์:**
   ```bash
   npm run dev
   ```
   เปิดเบราว์เซอร์ไปที่ `http://localhost:3000` เพื่อดูผลลัพธ์

## Tech Stack
- **Frontend**: Next.js, React, Tailwind CSS, Framer Motion
- **Backend/DB**: Supabase (PostgreSQL, Authentication)
- **Charts**: Recharts, TradingView Lightweight Charts
