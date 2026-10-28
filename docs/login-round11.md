# รอบ 11 — Login layout

## สาเหตุที่ยืนยันก่อนแก้

หน้า `http://localhost:3000/login` ที่ viewport 1905×908 มี outer `display:grid` แต่ไม่มี `grid-template-columns` และไม่มี CSS definition ให้ `.ft-auth`, `.ft-auth-brand`, `.ft-auth-form` ในโปรเจกต์ Browser จึงคำนวณ grid เป็นคอลัมน์เดียว `1794px` ภายใน padding 48px แทนสองคอลัมน์:

- ก่อนแก้: intro x=48, y=48, width=1794, height=565px; card wrapper x=721, y=613, width=448, height=758px; document height=1419px
- หลังแก้: container สูงสุด 1200px, grid `minmax(0,1fr) 440px`, gap 72px; card x=1105, y=194.86, width=440, height=540.28px; document height=908px

ตรวจ `git log --all` และ diff ของ Login, global CSS และ root layout แล้ว: commit ล่าสุดที่แตะ Login คือ `a795310` วันที่ 2026-10-13 ซึ่งยังเป็น **การ์ดเดียวจัดกลางด้วย flex** ไม่ใช่สองคอลัมน์ คอลัมน์ข้อความและการเปลี่ยน outer เป็น grid เพิ่งถูกเพิ่มใน uncommitted working tree โดยไม่มีการกำหนด columns ไม่พบ commit สองคอลัมน์ที่เคยทำงานใน history ที่มีอยู่ จึงไม่อ้างวันที่ที่ยืนยันไม่ได้

ไม่ได้เกิดจาก breakpoint ถูก global override, root padding หรือฟอนต์เปลี่ยน การใช้ `self-stretch`, `justify-between` และ padding ใน intro เดิมยิ่งเพิ่มความสูงของแถวแรก ไม่มีหน้าอื่นพบสาเหตุเดียวกัน เพราะ class กลุ่มนี้มีเฉพาะ Login

พบเพิ่มเติมระหว่างทดสอบ autofill: global CSS เดิม reset box-shadow ของ autofill ทุกหน้า และ input มี `transition-all` ทำให้ inset fill ที่เติมใหม่ค่อย ๆ ปรากฏ แก้ด้วย selector ที่ scope `.ft-auth-card` และปิด transition เฉพาะ autofill ไม่แก้ global CSS หรือพฤติกรรม autofill ของหน้าอื่น

## สิ่งที่เปลี่ยน

- Desktop ≥1024px สองคอลัมน์จัดกลางแนวตั้ง; ต่ำกว่า 1024px ฟอร์มขึ้นก่อนและมีแบรนด์/คำอธิบายสั้นด้านบน ข้อดีสามข้ออยู่หลังฟอร์มและซ่อนเมื่อ <768px
- แบรนด์ FinTrack เหลือหนึ่งที่, TH/EN segmented control ไม่เลื่อน, footer ขนาดเล็ก
- การ์ดทึบจาก theme tokens, radius 20px, padding 32px (ลดระยะแนวตั้งเมื่อหน้าจอสั้น), fields และปุ่มหลักสูง 48px
- Intro heading 44–48px, description 17px, icon tiles 36px จาก Lucide ชุดเดียวกับแอป ไม่มีเส้นคั่นรายการ
- ใช้ Noto Sans Thai ที่ root layout มีอยู่และสีของแอป; dark/light ตามกลไกเดิมของโปรเจกต์ รวมพื้นหลังเขียวจางแบบนิ่ง
- คอลัมน์และการ์ด fade-in พร้อมกันผ่าน parent เดียว 200ms ครั้งเดียว ไม่มี scale/translate/stagger และปิดเมื่อ reduced-motion
- Loading แสดงข้อความตามภาษา ไม่มี spinner, error อยู่ใต้ฟอร์มใน `aria-live="polite"`
- ตัดป้าย Secure connection ที่ไม่มีหน้ายืนยันออกทั้งหมด จึงไม่กล่าวอ้างว่าการเชื่อมต่อ localhost/http ปลอดภัย
- คง Google, สมัครสมาชิก, remember me, forgot password, terms/privacy links, validation และ redirect เดิม
- Email/current-password autocomplete คงอยู่; autofill inset เป็นพื้นทึบจาก token ทันที และแสดง keyboard focus สำหรับปุ่ม/ลิงก์/checkbox

ไม่มีการแก้ sidebar/top bar, route transition, shared CSS, root layout หรือ auth actions ในรอบนี้

## การตรวจ

ตรวจ layout จากแอปจริง localhost:3000/login ด้วย Edge/Chromium รวม **44 กรณี**: 11 viewport × TH/EN × dark/light ไม่มี pageerror, ไม่มี horizontal overflow, แบรนด์ไม่ซ้ำ, ไม่มี i18n key ดิบ ทุก desktop column center ตรงกัน <1px และ field สูง 48px

ตัวอย่าง EN/dark (TH/light ผ่านเกณฑ์เดียวกัน):

| Viewport | Card top | Card bottom | Submit bottom | Page height |
|---|---:|---:|---:|---:|
| 1366×768 | 124.86 | 665.14 | 476.55 | 768 |
| 1440×900 | 190.86 | 731.14 | 542.55 | 900 |
| 1905×908 | 194.86 | 735.14 | 546.55 | 908 |
| 1280×720 | 125.86 | 616.14 | 451.55 | 720 |
| 1024×768 | 124.86 | 665.14 | 476.55 | 768 |
| 768×900 | 103.80 | 644.08 | 455.48 | 900 |
| 390×844 | 164.81 | 706.69 | 508.50 | 844 |
| 1280×640 | 85.86 | 576.14 | 411.55 | 640 |
| 768×640 | 74.50 | 580.78 | 408.19 | 789 |
| 390×640 | 79.81 | 587.69 | 405.50 | 640 |
| 1024×600 | 65.86 | 556.14 | 391.55 | 600 |

ที่ 768×640 การ์ดและปุ่มเห็นครบโดยไม่เลื่อน แต่รายการสามข้อกับ footer ใต้การ์ดเลื่อนดูได้ตามลำดับ mobile/tablet; จอ laptop สี่ขนาดหลักไม่มี document scroll ทั้งหน้า จอ 390px เห็นปุ่มได้ทันที ไม่ต้องเลื่อนหนึ่งจอ

แอปเดิมใช้ scrollbar-gutter:stable จึงมีพื้นที่สำรอง scrollbar 15px: viewport 1905 ให้ layout client width 1890px เป็นต้น ไม่เปลี่ยน shared rule นี้

ทดสอบ interaction ด้วย component Login จริง แต่ mock action boundary โดยไม่ส่งข้อมูลบัญชีจริง:

- Tab: Email → Password → Show/Hide → Remember me → Forgot password → Submit แล้ว Enter ส่งได้
- ทำซ้ำ EN/dark และ TH/light; loading label + disabled แสดงถูกต้อง
- Password visibility, error แบบ polite ใต้ฟอร์ม, forgot-password flow, register password mismatch และ redirect `/dashboard` ผ่าน
- Chrome autofill บังคับ pseudo-state ผ่าน DevTools Protocol: selector `:-webkit-autofill` match และ computed box-shadow เป็น `1000px inset` ทันที ข้อความใช้ foreground token ไม่ใช่สี browser; นี่เป็นการตรวจ CSS state ไม่ใช่การเข้าถึง password manager ของผู้ใช้
- reduced-motion ไม่มี animation; normal animation duration 0.2s
- เทียบ AST source ก่อน/หลังของ hashPassword, validatePasswordStrength, validateForm, handleEmailAuth, validateReturnUrl, handleGoogleLogin, handleForgotPassword, toggleLang และ switchMode เหมือนเดิมทุกตัว
- `npm run build` ผ่าน (warnings เดิมของ hook/img/Recharts ในหน้าอื่น), `git diff --check` ผ่าน

## ไฟล์

Production:
- `src/app/login/page.tsx` — markup, icon/copy, loading/error presentation และการนำเข้า CSS ของ Login
- `src/app/login/login.css` — responsive layout และ style ที่ scope เฉพาะ Login

QA/report:
- `scripts/login-round11-layout-qa.mjs`
- `scripts/login-round11-interaction-qa.mjs`
- `scripts/login-round11-source-check.mjs` (เทียบกับ snapshot ก่อนเริ่มรอบนี้ใน `%TEMP%/fintrack-login-round11-before.tsx`)
- `scripts/login-round11-probe.mjs`
- `docs/login-round11.md`
- `output/login-round11/` — screenshots, geometry, interaction, auth-source-check และ build log

ภาพหลัก: `before-1905.png`, `1905-908-dark-en.png`, `1905-908-light-th.png`, `390-844-dark-en.png`, `390-844-light-th.png`

ไม่มี design/frontend skill ถูก invoke/load/follow ในรอบนี้
