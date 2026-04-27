# FinTrack Supabase Setup Guide

## วิธีติดตั้ง Database บน Supabase

### ขั้นตอนที่ 1: สร้าง Project บน Supabase
1. ไปที่ [https://app.supabase.com](https://app.supabase.com)
2. สร้าง Project ใหม่
3. รอให้ database provision เสร็จ (ประมาณ 1-2 นาที)

### ขั้นตอนที่ 2: รัน SQL Schema

#### Option A: Essential Only (สำหรับเริ่มต้น)
ใช้ไฟล์ `supabase-essential-only.sql` - มีแค่ตารางที่จำเป็นสำหรับ Authentication

```sql
-- ไปที่ Supabase Dashboard → SQL Editor → New Query
-- คัดลอกเนื้อหาจาก supabase-essential-only.sql แล้วกด Run
```

#### Option B: Full Schema (สำหรับ production)
ใช้ไฟล์ `supabase-schema.sql` - มีตารางครบถ้วนสำหรับทุก feature

```sql
-- ไปที่ Supabase Dashboard → SQL Editor → New Query
-- คัดลอกเนื้อหาจาก supabase-schema.sql แล้วกด Run
```

### ขั้นตอนที่ 3: Configure Authentication

#### 3.1 Email Provider Settings
ไปที่: **Authentication → Providers → Email**

- Enable Email provider
- Confirm email (recommended for production)
- Secure email change
- Prevent signup if email exists
- Enable email confirmations (ถ้าต้องการ auto-confirm ให้ปิด)

#### 3.2 URL Configuration
ไปที่: **Authentication → URL Configuration**

**Site URL:**
```
Development: http://localhost:3000
Production: https://your-domain.com
```

**Redirect URLs:**
```
http://localhost:3000/auth/callback
http://localhost:3000/reset-password
http://localhost:3000/login
```

#### 3.3 Email Templates (Optional)
ไปที่: **Authentication → Email Templates**

สามารถ customize email templates ได้:
- Confirm signup
- Invite user
- Magic Link
- Change Email Address
- Reset Password

### ขั้นตอนที่ 4: Environment Variables

เพิ่มตัวแปรเหล่านี้ใน `.env.local`:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

หา API Keys ได้ที่: **Project Settings → API**

### ขั้นตอนที่ 5: Test การทำงาน

1. รันแอพ: `npm run dev`
2. ไปที่ http://localhost:3000/login
3. ลองสมัครสมาชิกใหม่
4. เช็ค Supabase Dashboard → Table Editor → profiles
   - ควรเห็นข้อมูล user ที่สมัครใหม่

---

## โครงสร้างตาราง

### ตารางหลัก (Essential)
| Table | คำอธิบาย |
|-------|---------|
| `profiles` | ข้อมูลผู้ใช้ (เชื่อมกับ auth.users) |
| `audit_logs` | บันทึก log การใช้งาน |

### ตารางเสริม (Full Schema)
| Table | คำอธิบาย |
|-------|---------|
| `assets` | สินทรัพย์ในพอร์ต |
| `trades` | ประวัติการซื้อขาย |
| `allocation_targets` | เป้าหมายการจัดสรร |
| `sessions` | Sessions ที่ login อยู่ |
| `notifications` | การแจ้งเตือน |

---

## Troubleshooting

### ปัญหา: สมัครสมาชิกไม่ได้
**แก้ไข:**
1. เช็คว่ารัน SQL schema แล้วหรือยัง
2. เช็คว่า RLS policies ถูกต้องไหม
3. ดู error log ใน browser console

### ปัญหา: ไม่เห็นข้อมูลใน Table Editor
**แก้ไข:**
1. เช็คว่าเลือก schema `public` แล้ว
2. Refresh หน้าเว็บ

### ปัญหา: Email confirmation ไม่ส่ง
**แก้ไข:**
1. เช็ค spam/junk folder
2. ใน development สามารถดู email ได้ที่: **Authentication → Emails**
3. หรือปิด email confirmation ไปก่อน

---

## Security Best Practices

1. **RLS Enabled**: ทุกตารางที่สร้างมี RLS enabled
2. **Service Role Key**: เก็บไว้ที่ server-side เท่านั้น (ไม่ expose ไป client)
3. **Anon Key**: ใช้สำหรับ client-side (public)
4. **Audit Logs**: ทุกการ login/register มีการ log ไว้

---

## ขั้นตอนสรุป

```bash
# 1. สร้าง Supabase Project
# 2. รัน SQL: supabase-essential-only.sql (หรือ full schema)
# 3. Configure Auth URLs
# 4. เอา API Keys ใส่ใน .env.local
# 5. ทดสอบสมัครสมาชิก
```

หากมีปัญหาเพิ่มเติมให้เช็ค error logs ใน browser console และ Supabase Dashboard → Logs
