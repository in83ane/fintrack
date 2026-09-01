# บทที่ 3
# วิธีการดำเนินงานวิจัย

ในบทนี้จะกล่าวถึงวิธีการดำเนินงานวิจัยของระบบ FinTrack ซึ่งเป็นเว็บแอปพลิเคชันจัดการพอร์ตโฟลิโอและการเงินส่วนบุคคล โดยจะอธิบายถึงขั้นตอนการพัฒนาระบบ เครื่องมือที่ใช้ในการพัฒนา สถาปัตยกรรมของระบบ การออกแบบฐานข้อมูล การออกแบบส่วนติดต่อผู้ใช้ ระบบรักษาความปลอดภัย และการทดสอบระบบ

## 3.1 วิธีการดำเนินงานวิจัย

การดำเนินงานวิจัยในโครงงานนี้ใช้วิธีการพัฒนาซอฟต์แวร์แบบ Agile Development โดยแบ่งการพัฒนาออกเป็นรอบ (Sprint) เพื่อให้สามารถปรับปรุงและพัฒนาฟีเจอร์ต่าง ๆ ได้อย่างต่อเนื่อง ขั้นตอนการดำเนินงานวิจัยมีดังต่อไปนี้

### 3.1.1 ขั้นตอนการศึกษาและวิเคราะห์ความต้องการ

ขั้นตอนนี้เป็นการศึกษาปัญหาและความต้องการของผู้ใช้ในการจัดการพอร์ตโฟลิโอและการเงินส่วนบุคคล โดยศึกษาจากแอปพลิเคชันที่มีอยู่ในตลาดปัจจุบัน เช่น Investing.com, Yahoo Finance และ Money Forward รวมถึงศึกษาทฤษฎีที่เกี่ยวข้องกับ Technical Analysis เช่น RSI, MACD, EMA, Stochastic Oscillator, ADX, VWAP และ Smart Money Concepts (SMC) เพื่อนำมาประยุกต์ใช้ในระบบ Trade Signal Analysis

### 3.1.2 ขั้นตอนการออกแบบระบบ

ขั้นตอนนี้เป็นการออกแบบสถาปัตยกรรมของระบบทั้งหมด ประกอบด้วยการออกแบบฐานข้อมูล (Database Design) การออกแบบส่วนติดต่อผู้ใช้ (UI/UX Design) การออกแบบโครงสร้างของแอปพลิเคชัน (Application Architecture) และการออกแบบระบบรักษาความปลอดภัย (Security Architecture) ซึ่งจะอธิบายรายละเอียดในหัวข้อถัดไป

### 3.1.3 ขั้นตอนการพัฒนาระบบ

ขั้นตอนนี้เป็นการเขียนโปรแกรมตามที่ได้ออกแบบไว้ โดยแบ่งการพัฒนาออกเป็นโมดูลต่าง ๆ ดังนี้

1. **โมดูลระบบยืนยันตัวตน (Authentication Module)** — ระบบล็อกอินผ่าน Google OAuth 2.0 และ Email/Password
2. **โมดูลจัดการพอร์ตโฟลิโอ (Portfolio Module)** — จัดการสินทรัพย์ ติดตามราคาหุ้น/คริปโต แสดงผลตอบแทน
3. **โมดูลบันทึกการซื้อขาย (Trade Module)** — บันทึกรายการซื้อ/ขาย/เงินปันผล พร้อมระบบ DCA Order
4. **โมดูลวิเคราะห์สัญญาณซื้อขาย (Trade Signal Module)** — วิเคราะห์ Technical Indicators และให้สัญญาณซื้อขาย
5. **โมดูลกระแสเงินสด (Cashflow Module)** — บันทึกรายรับ-รายจ่าย จัดหมวดหมู่
6. **โมดูลถังเงิน (Money Buckets Module)** — จัดสรรเงินตามเป้าหมาย
7. **โมดูลงบประมาณ (Budget Module)** — ตั้งงบประมาณและติดตามการใช้จ่าย
8. **โมดูล Dashboard** — แสดงภาพรวมทางการเงินผ่าน Widget แบบ Drag-and-Drop
9. **โมดูลที่ปรึกษาทางการเงิน AI (AI Financial Advisor Module)** — ระบบ AI Chatbot ที่วิเคราะห์ข้อมูลทางการเงินส่วนบุคคลและให้คำแนะนำ
10. **โมดูลปฏิทิน (Calendar Module)** — แสดงข้อมูลธุรกรรมในรูปแบบปฏิทิน

### 3.1.4 ขั้นตอนการทดสอบระบบ

ขั้นตอนนี้เป็นการทดสอบระบบเพื่อตรวจสอบความถูกต้องของการทำงาน ซึ่งจะอธิบายรายละเอียดในหัวข้อ 3.7

### 3.1.5 ขั้นตอนการสรุปและประเมินผล

ขั้นตอนนี้เป็นการสรุปผลการดำเนินงานวิจัยและประเมินผลของระบบ

รูปที่ 3.1 แผนภาพขั้นตอนการดำเนินงานวิจัย (Research Methodology Flowchart)

---

## 3.2 เครื่องมือที่ใช้ในการพัฒนา

ในการพัฒนาระบบ FinTrack ได้ใช้เครื่องมือต่าง ๆ ดังต่อไปนี้

### 3.2.1 เครื่องมือด้านฮาร์ดแวร์

ตารางที่ 3.1 เครื่องมือด้านฮาร์ดแวร์ที่ใช้ในการพัฒนา

| ลำดับ | รายการ | รายละเอียด |
|:---:|:---|:---|
| 1 | คอมพิวเตอร์ MacBook | ใช้ในการพัฒนาและทดสอบระบบ |
| 2 | สมาร์ทโฟน/แท็บเล็ต | ใช้ในการทดสอบ Responsive Design |

### 3.2.2 เครื่องมือด้านซอฟต์แวร์

ตารางที่ 3.2 เครื่องมือด้านซอฟต์แวร์ที่ใช้ในการพัฒนา

| ลำดับ | ซอฟต์แวร์ | เวอร์ชัน | รายละเอียดการใช้งาน |
|:---:|:---|:---:|:---|
| 1 | Node.js | 18+ | Runtime สำหรับรัน JavaScript ฝั่งเซิร์ฟเวอร์ |
| 2 | Next.js | 15.5 | React Framework สำหรับพัฒนาเว็บแอปพลิเคชัน (App Router) |
| 3 | React | 19.0 | JavaScript Library สำหรับสร้าง User Interface |
| 4 | TypeScript | 5.8 | Superset ของ JavaScript ที่เพิ่มระบบ Type Safety |
| 5 | Tailwind CSS | 4.1 | CSS Framework สำหรับจัดการ Style |
| 6 | Supabase | 2.103 | Backend-as-a-Service (BaaS) — ฐานข้อมูล PostgreSQL และระบบ Authentication |
| 7 | Recharts | 3.8 | Library สำหรับสร้างกราฟและแผนภูมิ |
| 8 | Framer Motion | 12.23 | Library สำหรับสร้าง Animation |
| 9 | Zod | 4.4 | Library สำหรับ Runtime Validation และ Schema Definition |
| 10 | Lucide React | 0.546 | Icon Library |
| 11 | PapaParse | 5.5 | Library สำหรับ Parse ไฟล์ CSV (Import ข้อมูลการซื้อขาย) |
| 12 | React Grid Layout | 2.2 | Library สำหรับ Drag-and-Drop Grid Layout (Dashboard Widget) |
| 13 | Google Gemini AI | 1.29 | AI SDK สำหรับระบบที่ปรึกษาทางการเงิน AI |
| 14 | TradingView Widgets | 1.2 | Widget สำหรับแสดง Chart หุ้นแบบ Real-time |
| 15 | Visual Studio Code | Latest | Text Editor / IDE สำหรับเขียนโค้ด |
| 16 | Git & GitHub | Latest | ระบบจัดการเวอร์ชัน (Version Control) |
| 17 | Google Chrome DevTools | Latest | เครื่องมือสำหรับ Debug และทดสอบ |

### 3.2.3 External API ที่ใช้ในระบบ

ตารางที่ 3.3 External API ที่ใช้ในระบบ

| ลำดับ | API | รายละเอียดการใช้งาน |
|:---:|:---|:---|
| 1 | Yahoo Finance API | ดึงข้อมูลราคาหุ้น/คริปโต แบบ Real-time และข้อมูลย้อนหลัง (Historical Data) สำหรับคำนวณ Technical Indicators |
| 2 | SET API | ดึงรายชื่อหุ้นในตลาดหลักทรัพย์แห่งประเทศไทย (SET) |
| 3 | NASDAQ Screener API | ดึงรายชื่อหุ้นในตลาด NASDAQ และ NYSE |
| 4 | Google OAuth 2.0 | ระบบยืนยันตัวตนผ่าน Google Account |
| 5 | Supabase Auth API | ระบบจัดการ Authentication, Session Management |
| 6 | Google Gemini API | ระบบ AI สำหรับวิเคราะห์และให้คำแนะนำทางการเงิน |

---

## 3.3 สถาปัตยกรรมของระบบ (System Architecture)

ระบบ FinTrack ออกแบบตามสถาปัตยกรรมแบบ Full-Stack Web Application โดยใช้ Next.js App Router เป็นแกนหลัก ซึ่งรองรับทั้ง Server-Side Rendering (SSR), Static Site Generation (SSG) และ Server Actions สถาปัตยกรรมของระบบแบ่งออกเป็น 3 ส่วนหลัก ดังนี้

### 3.3.1 ส่วนหน้าบ้าน (Frontend / Client-Side)

ส่วน Frontend พัฒนาด้วย React 19 ร่วมกับ TypeScript โดยใช้ Next.js App Router ในการจัดการ Routing และ Page Rendering ส่วนประกอบหลักมีดังนี้

1. **React Components** — คอมโพเนนต์แบบ Reusable จำนวน 24 คอมโพเนนต์ เช่น Dashboard, Portfolio, AddAssetModal, StockChart, AIFinancialAdvisor เป็นต้น
2. **AppContext (Global State)** — ใช้ React Context API ในการจัดการ State ส่วนกลางของแอปพลิเคชัน ครอบคลุมข้อมูลผู้ใช้ สินทรัพย์ การซื้อขาย Money Buckets กระแสเงินสด อัตราแลกเปลี่ยน และการตั้งค่า
3. **Tailwind CSS** — ใช้ Utility-first CSS Framework ในการจัดการ Style ร่วมกับ Framer Motion สำหรับ Animation
4. **Recharts & TradingView** — ใช้สำหรับแสดงกราฟข้อมูลทางการเงิน

### 3.3.2 ส่วนหลังบ้าน (Backend / Server-Side)

ส่วน Backend ใช้ Next.js Server Actions และ API Routes ในการจัดการ Business Logic ส่วนประกอบหลักมีดังนี้

1. **Server Actions** — ฟังก์ชันที่ทำงานบนฝั่ง Server สำหรับดึงข้อมูลจาก External API เช่น Yahoo Finance, SET API, NASDAQ Screener รวมถึงการคำนวณ Technical Indicators
2. **API Routes** — Endpoint สำหรับ Analytics, Chart Data, Market Data, Search และ Cache Metrics
3. **Middleware** — จัดการ Security Headers, Rate Limiting, CSRF Protection, Device Fingerprinting และ Route Protection
4. **Utility Libraries** — ไลบรารีเสริมสำหรับ Caching, Input Validation (Zod), Security Functions, Network Utilities และ Exchange Rate Calculation

### 3.3.3 ส่วนฐานข้อมูล (Database Layer)

ส่วนฐานข้อมูลใช้ Supabase ซึ่งเป็น Backend-as-a-Service (BaaS) ที่ทำงานบน PostgreSQL โดยมีฟีเจอร์หลัก ได้แก่

1. **PostgreSQL Database** — ฐานข้อมูลเชิงสัมพันธ์สำหรับจัดเก็บข้อมูลทั้งหมด
2. **Row Level Security (RLS)** — ระบบรักษาความปลอดภัยระดับแถว ทำให้ผู้ใช้เข้าถึงได้เฉพาะข้อมูลของตัวเองเท่านั้น
3. **Supabase Authentication** — ระบบจัดการการยืนยันตัวตนรวมถึง OAuth Provider (Google)
4. **Database Triggers** — Trigger สำหรับอัปเดต updated_at อัตโนมัติ และสร้าง Profile อัตโนมัติเมื่อมีผู้ใช้ใหม่ลงทะเบียน

รูปที่ 3.2 แผนภาพสถาปัตยกรรมของระบบ FinTrack (System Architecture Diagram)

---

## 3.4 การออกแบบฐานข้อมูล (Database Design)

ฐานข้อมูลของระบบ FinTrack ออกแบบบน PostgreSQL ผ่าน Supabase โดยใช้ UUID เป็น Primary Key ของทุกตาราง เพื่อรองรับการขยายตัวของระบบในอนาคต ฐานข้อมูลประกอบด้วยตารางหลักทั้งหมด 9 ตาราง ดังนี้

### 3.4.1 ตาราง Profiles

ตารางสำหรับจัดเก็บข้อมูลโปรไฟล์ผู้ใช้ โดยเชื่อมโยงกับตาราง auth.users ของ Supabase Authentication ผ่าน Foreign Key

ตารางที่ 3.4 โครงสร้างตาราง Profiles

| คอลัมน์ | ชนิดข้อมูล | คำอธิบาย |
|:---|:---|:---|
| id | UUID (PK, FK → auth.users) | รหัสผู้ใช้ |
| email | TEXT (NOT NULL) | อีเมลผู้ใช้ |
| full_name | TEXT | ชื่อเต็มผู้ใช้ |
| avatar_url | TEXT | URL รูปโปรไฟล์ |
| language | TEXT (Default: 'th') | ภาษาที่ใช้แสดงผล |
| currency | TEXT (Default: 'USD') | สกุลเงินหลัก |
| email_verified | BOOLEAN (Default: false) | สถานะยืนยันอีเมล |
| account_status | TEXT (Default: 'active') | สถานะบัญชี |
| registration_ip | INET | IP Address ที่ลงทะเบียน |
| device_fingerprint | TEXT | ลายนิ้วมืออุปกรณ์ |
| user_agent | TEXT | ข้อมูล User Agent |
| last_login_at | TIMESTAMPTZ | เวลาล็อกอินล่าสุด |
| created_at | TIMESTAMPTZ (Default: NOW()) | เวลาสร้าง |
| updated_at | TIMESTAMPTZ (Default: NOW()) | เวลาอัปเดตล่าสุด |

### 3.4.2 ตาราง Assets

ตารางสำหรับจัดเก็บข้อมูลสินทรัพย์ของผู้ใช้ เช่น หุ้น คริปโต ETF สินค้าโภคภัณฑ์ เป็นต้น

ตารางที่ 3.5 โครงสร้างตาราง Assets

| คอลัมน์ | ชนิดข้อมูล | คำอธิบาย |
|:---|:---|:---|
| id | UUID (PK) | รหัสสินทรัพย์ |
| user_id | UUID (FK → auth.users) | รหัสผู้ใช้ |
| name | TEXT (NOT NULL) | ชื่อสินทรัพย์ |
| symbol | TEXT (NOT NULL) | สัญลักษณ์ เช่น AAPL, PTT |
| asset_type | TEXT (Default: 'stock') | ประเภทสินทรัพย์ (stock, crypto, etf, commodity, forex) |
| value_usd | NUMERIC(15,2) | มูลค่ารวม (USD) |
| quantity | NUMERIC(15,6) | จำนวนหน่วย |
| avg_purchase_price | NUMERIC(15,2) | ราคาซื้อเฉลี่ย |
| current_price | NUMERIC(15,2) | ราคาปัจจุบัน |
| change_24h | NUMERIC(5,2) | การเปลี่ยนแปลง 24 ชั่วโมง |
| change_percentage | NUMERIC(5,2) | เปอร์เซ็นต์การเปลี่ยนแปลง |
| allocation_target | NUMERIC(5,2) | สัดส่วนเป้าหมาย |
| allocation_current | NUMERIC(5,2) | สัดส่วนปัจจุบัน |
| sector | TEXT | ภาคธุรกิจ |
| country | TEXT | ประเทศ |
| notes | TEXT | บันทึก |
| is_active | BOOLEAN (Default: true) | สถานะ Active |
| is_favorite | BOOLEAN (Default: false) | สถานะรายการโปรด |
| sort_order | INTEGER (Default: 0) | ลำดับการเรียง |
| created_at | TIMESTAMPTZ | เวลาสร้าง |
| updated_at | TIMESTAMPTZ | เวลาอัปเดตล่าสุด |

### 3.4.3 ตาราง Trades

ตารางสำหรับจัดเก็บประวัติการซื้อขายสินทรัพย์ของผู้ใช้

ตารางที่ 3.6 โครงสร้างตาราง Trades

| คอลัมน์ | ชนิดข้อมูล | คำอธิบาย |
|:---|:---|:---|
| id | UUID (PK) | รหัสรายการซื้อขาย |
| user_id | UUID (FK → auth.users) | รหัสผู้ใช้ |
| asset_id | UUID (FK → assets) | รหัสสินทรัพย์ |
| asset_name | TEXT (NOT NULL) | ชื่อสินทรัพย์ |
| symbol | TEXT (NOT NULL) | สัญลักษณ์สินทรัพย์ |
| type | TEXT (NOT NULL) | ประเภท (BUY, SELL, DIVIDEND) — ตรวจสอบด้วย CHECK Constraint |
| amount_usd | NUMERIC(15,2) | มูลค่า (USD) |
| quantity | NUMERIC(15,6) | จำนวนหน่วย |
| price_at_execution | NUMERIC(15,6) | ราคาขณะทำรายการ |
| currency | TEXT (Default: 'USD') | สกุลเงิน |
| exchange_rate_at_time | NUMERIC(10,4) | อัตราแลกเปลี่ยนขณะทำรายการ |
| fees | NUMERIC(10,2) | ค่าธรรมเนียม |
| taxes | NUMERIC(10,2) | ภาษี |
| total_cost | NUMERIC(15,2) | ต้นทุนรวม |
| profit_loss | NUMERIC(15,2) | กำไร/ขาดทุน |
| profit_loss_percentage | NUMERIC(5,2) | เปอร์เซ็นต์กำไร/ขาดทุน |
| execution_date | TIMESTAMPTZ | วันที่ทำรายการ |
| settlement_date | TIMESTAMPTZ | วันที่ชำระเงิน |
| status | TEXT (Default: 'completed') | สถานะ |
| notes | TEXT | บันทึก |
| tags | TEXT[] | แท็ก (Array) |
| created_at | TIMESTAMPTZ | เวลาสร้าง |
| updated_at | TIMESTAMPTZ | เวลาอัปเดตล่าสุด |

### 3.4.4 ตาราง Allocations

ตารางสำหรับจัดเก็บข้อมูลสัดส่วนการจัดสรรสินทรัพย์ (Asset Allocation) ที่ผู้ใช้กำหนด

ตารางที่ 3.7 โครงสร้างตาราง Allocations

| คอลัมน์ | ชนิดข้อมูล | คำอธิบาย |
|:---|:---|:---|
| id | UUID (PK) | รหัส |
| user_id | UUID (FK → auth.users) | รหัสผู้ใช้ |
| label | TEXT (NOT NULL) | ชื่อประเภทสัดส่วน |
| value | NUMERIC(10,2) | สัดส่วน (%) |
| color | TEXT | สีที่ใช้แสดงผล |

*UNIQUE Constraint: (user_id, label)*

### 3.4.5 ตาราง Money Buckets

ตารางสำหรับจัดเก็บข้อมูลถังเงิน (Money Buckets) ที่ผู้ใช้สร้างเพื่อจัดสรรเงินตามเป้าหมาย

ตารางที่ 3.8 โครงสร้างตาราง Money Buckets

| คอลัมน์ | ชนิดข้อมูล | คำอธิบาย |
|:---|:---|:---|
| id | UUID (PK) | รหัสถังเงิน |
| user_id | UUID (FK → auth.users) | รหัสผู้ใช้ |
| name | TEXT (NOT NULL) | ชื่อถังเงิน |
| target_percent | NUMERIC(5,2) | เปอร์เซ็นต์เป้าหมาย |
| target_amount | NUMERIC(15,2) | จำนวนเงินเป้าหมาย |
| current_amount | NUMERIC(15,2) | จำนวนเงินปัจจุบัน |
| color | TEXT | สีที่ใช้แสดงผล |
| icon | TEXT | ไอคอน |
| linked_to_expenses | BOOLEAN (Default: false) | เชื่อมกับรายจ่ายหรือไม่ |
| created_at | TIMESTAMPTZ | เวลาสร้าง |
| updated_at | TIMESTAMPTZ | เวลาอัปเดตล่าสุด |

### 3.4.6 ตาราง Bucket Activities

ตารางสำหรับจัดเก็บประวัติกิจกรรมของถังเงิน เช่น ฝาก ถอน แบ่งรายได้ ลงทุน แบ่งกำไร

ตารางที่ 3.9 โครงสร้างตาราง Bucket Activities

| คอลัมน์ | ชนิดข้อมูล | คำอธิบาย |
|:---|:---|:---|
| id | UUID (PK) | รหัสกิจกรรม |
| user_id | UUID (FK → auth.users) | รหัสผู้ใช้ |
| bucket_id | UUID (FK → money_buckets) | รหัสถังเงิน |
| type | TEXT (NOT NULL) | ประเภท (deposit, withdraw, income_split, invest, profit_split) — ตรวจสอบด้วย CHECK Constraint |
| amount | NUMERIC(15,2) | จำนวนเงิน |
| note | TEXT | บันทึก |
| date | TIMESTAMPTZ | วันที่ทำรายการ |
| created_at | TIMESTAMPTZ | เวลาสร้าง |

### 3.4.7 ตาราง Cash Activities

ตารางสำหรับจัดเก็บรายรับ-รายจ่ายของผู้ใช้ในระบบ Cashflow

ตารางที่ 3.10 โครงสร้างตาราง Cash Activities

| คอลัมน์ | ชนิดข้อมูล | คำอธิบาย |
|:---|:---|:---|
| id | UUID (PK) | รหัสรายการ |
| user_id | UUID (FK → auth.users) | รหัสผู้ใช้ |
| type | TEXT (NOT NULL) | ประเภท (INCOME, EXPENSE) — ตรวจสอบด้วย CHECK Constraint |
| amount | NUMERIC(15,2) | จำนวนเงิน |
| category | TEXT (NOT NULL) | หมวดหมู่ |
| note | TEXT | บันทึก |
| date | TIMESTAMPTZ | วันที่ทำรายการ |
| created_at | TIMESTAMPTZ | เวลาสร้าง |

### 3.4.8 แผนภาพความสัมพันธ์ของฐานข้อมูล (Entity-Relationship Diagram)

ความสัมพันธ์ระหว่างตารางในฐานข้อมูลมีลักษณะดังนี้

- ตาราง **auth.users** มีความสัมพันธ์แบบ One-to-One กับ **profiles** (ผู้ใช้ 1 คน มีโปรไฟล์ 1 รายการ)
- ตาราง **auth.users** มีความสัมพันธ์แบบ One-to-Many กับ **assets**, **trades**, **allocations**, **money_buckets** และ **cash_activities** (ผู้ใช้ 1 คน มีข้อมูลได้หลายรายการ)
- ตาราง **assets** มีความสัมพันธ์แบบ One-to-Many กับ **trades** (สินทรัพย์ 1 รายการ มีประวัติซื้อขายได้หลายรายการ)
- ตาราง **money_buckets** มีความสัมพันธ์แบบ One-to-Many กับ **bucket_activities** (ถังเงิน 1 ถัง มีกิจกรรมได้หลายรายการ)

ทุกตารางเปิดใช้งาน Row Level Security (RLS) เพื่อให้ผู้ใช้เข้าถึงได้เฉพาะข้อมูลของตนเองเท่านั้น โดย Policy จะตรวจสอบ `auth.uid() = user_id` ในทุกการ Query

รูปที่ 3.3 แผนภาพความสัมพันธ์ของฐานข้อมูล (ER Diagram)

---

## 3.5 การออกแบบส่วนติดต่อผู้ใช้ (User Interface Design)

ส่วนติดต่อผู้ใช้ของ FinTrack ออกแบบตามหลัก Modern Web Design โดยเน้น Dark Theme เป็นหลักและใช้โทนสีม่วง-น้ำเงิน (Purple-Blue Gradient) เป็นสี Accent ระบบรองรับ Responsive Design ทำให้สามารถรองรับการใช้งานทั้งบนหน้าจอคอมพิวเตอร์ แท็บเล็ต และสมาร์ทโฟน โครงสร้างหน้าจอหลักของระบบประกอบด้วยส่วนต่าง ๆ ดังต่อไปนี้

### 3.5.1 หน้า Landing Page

หน้าแรกของเว็บแอปพลิเคชันสำหรับแนะนำฟีเจอร์ของ FinTrack และปุ่ม Call-to-Action สำหรับล็อกอินเข้าสู่ระบบ

รูปที่ 3.4 หน้า Landing Page

### 3.5.2 หน้า Login/Register

หน้าสำหรับล็อกอินเข้าสู่ระบบ รองรับการล็อกอินผ่าน Google OAuth 2.0 และ Email/Password พร้อมระบบ Reset Password

รูปที่ 3.5 หน้า Login

### 3.5.3 หน้า Dashboard

หน้าภาพรวมทางการเงินที่แสดงข้อมูลสำคัญผ่าน Widget แบบ Drag-and-Drop ประกอบด้วย Total Net Worth, Portfolio Performance, Asset Allocation Chart, Recent Transactions, Monthly Cashflow Summary, Money Buckets Overview และ AI Insights

รูปที่ 3.6 หน้า Dashboard

### 3.5.4 หน้า Portfolio

หน้าจัดการพอร์ตโฟลิโอแสดงรายการสินทรัพย์ทั้งหมด พร้อมข้อมูลราคาปัจจุบัน กำไร/ขาดทุน สัดส่วนการจัดสรร และกราฟ Donut Chart สำหรับ Asset Allocation รองรับการเพิ่ม แก้ไข และลบสินทรัพย์

รูปที่ 3.7 หน้า Portfolio

### 3.5.5 หน้า Trade Signal

หน้าวิเคราะห์สัญญาณซื้อขายที่รวม Technical Indicators หลายตัว (RSI, MACD, EMA, Stochastic, ADX, VWAP) พร้อม Smart Money Concepts (Order Block, FVG, Supply/Demand Zone) ระบบจะคำนวณ Confidence Score และแนะนำจุด Entry, Take Profit, Stop Loss พร้อมค่า Risk/Reward Ratio นอกจากนี้ยังมีฟังก์ชัน Market Scanner สำหรับสแกนหาหุ้นที่มีสัญญาณซื้อในตลาด SET, US Standard และ US Dime (Penny Stock)

รูปที่ 3.8 หน้า Trade Signal Analysis

### 3.5.6 หน้า Cashflow (Ledger)

หน้าบันทึกรายรับ-รายจ่ายแสดงข้อมูลในรูปแบบ Timeline พร้อมกราฟ Bar Chart แสดงรายรับ-รายจ่ายรายเดือน รองรับการเพิ่มรายการใหม่ จัดหมวดหมู่ และกรองตามช่วงเวลา

รูปที่ 3.9 หน้า Cashflow / Ledger

### 3.5.7 หน้า Money Buckets (Budget)

หน้าจัดการถังเงินแสดง Card สำหรับแต่ละถังพร้อม Progress Bar แสดงสถานะเทียบกับเป้าหมาย รองรับการฝาก ถอน แบ่งรายได้ และแบ่งกำไร

รูปที่ 3.10 หน้า Money Buckets

### 3.5.8 หน้า Calendar

หน้าปฏิทินแสดงข้อมูลธุรกรรมทั้งหมด (การซื้อขาย, รายรับ-รายจ่าย, กิจกรรมถังเงิน) ในรูปแบบ Monthly Calendar View

รูปที่ 3.11 หน้า Calendar

### 3.5.9 หน้า Settings

หน้าตั้งค่าของผู้ใช้ ประกอบด้วยการตั้งค่าภาษา (ไทย/อังกฤษ) สกุลเงินหลัก (USD, THB, JPY, EUR) การจัดการโปรไฟล์ และการลบข้อมูลทั้งหมด

รูปที่ 3.12 หน้า Settings

### 3.5.10 ส่วน AI Financial Advisor

ส่วน AI Chatbot ที่สามารถวิเคราะห์ข้อมูลทางการเงินส่วนบุคคลของผู้ใช้ ให้คำแนะนำเรื่องการลงทุน ตรวจสุขภาพทางการเงิน สรุปรายเดือน ตรวจงบประมาณ และรับคำสั่งบันทึกธุรกรรมผ่านภาษาธรรมชาติ (Natural Language Processing)

รูปที่ 3.13 ส่วน AI Financial Advisor

### 3.5.11 ส่วน Navigation

ระบบ Navigation ประกอบด้วย Sidebar (สำหรับหน้าจอขนาดใหญ่) และ Bottom Navigation Bar (สำหรับหน้าจอมือถือ) พร้อม Command Palette (⌘K) สำหรับค้นหาและเข้าถึงฟังก์ชันต่าง ๆ อย่างรวดเร็ว

รูปที่ 3.14 ส่วน Sidebar และ Bottom Navigation

---

## 3.6 ระบบรักษาความปลอดภัย (Security System)

ระบบ FinTrack ให้ความสำคัญกับการรักษาความปลอดภัยของข้อมูลผู้ใช้เป็นอย่างมาก โดยมีมาตรการรักษาความปลอดภัยหลายระดับ ดังนี้

### 3.6.1 ระบบยืนยันตัวตน (Authentication)

ระบบยืนยันตัวตนใช้ Supabase Authentication ร่วมกับ Google OAuth 2.0 ซึ่งมีกลไกหลัก ดังนี้

1. **OAuth 2.0 Flow** — ใช้ Authorization Code Flow สำหรับล็อกอินผ่าน Google Account
2. **Session Management** — จัดเก็บ Access Token และ Refresh Token ใน HttpOnly Cookie ที่มีการตั้งค่า Secure และ SameSite=Strict
3. **CSRF Token** — สร้าง Token สำหรับป้องกัน Cross-Site Request Forgery โดยเก็บใน Cookie และตรวจสอบจาก Header
4. **Audit Logging** — บันทึก Log ของทุกการล็อกอิน รวมถึง IP Address, Device Fingerprint และ User Agent

### 3.6.2 Middleware Security

ระบบ Middleware ที่ทำงานบน Edge Runtime มีกลไกรักษาความปลอดภัย ดังนี้

1. **Security Headers (OWASP Compliant)** — ตั้งค่า HTTP Security Headers ตามมาตรฐาน OWASP ได้แก่ X-Frame-Options, X-Content-Type-Options, Content-Security-Policy, Strict-Transport-Security, Permissions-Policy เป็นต้น
2. **Rate Limiting** — จำกัดจำนวน Request ต่อ IP Address โดยแบ่งเป็น 3 ระดับ ได้แก่ Auth (500 requests/15 min), API (100 requests/min) และ General (1000 requests/min)
3. **Device Fingerprinting** — ตรวจจับอุปกรณ์ที่ใช้เข้าถึงระบบจาก User-Agent, Accept-Language และ IP Address
4. **Suspicious Request Detection** — ตรวจจับ Request ที่น่าสงสัย เช่น Request ที่ไม่มี User-Agent หรือมาจากเครื่องมือสแกน (sqlmap, nikto, nmap, burp เป็นต้น)
5. **Request Size Limiting** — จำกัดขนาด Request สูงสุดที่ 10MB

### 3.6.3 Row Level Security (RLS)

ฐานข้อมูลทุกตารางเปิดใช้งาน Row Level Security (RLS) ซึ่งเป็นกลไกของ PostgreSQL ที่บังคับให้ผู้ใช้เข้าถึงได้เฉพาะข้อมูลของตัวเองเท่านั้น โดย Policy จะตรวจสอบ `auth.uid() = user_id` (หรือ `auth.uid() = id` สำหรับตาราง profiles) ในทุกการ SELECT, INSERT, UPDATE และ DELETE

### 3.6.4 การ Validate ข้อมูล (Input Validation)

ระบบใช้ Zod Schema ในการตรวจสอบความถูกต้องของข้อมูลที่ผู้ใช้ป้อนเข้ามา ครอบคลุมทุกฟอร์มในระบบ ได้แก่

- **TradeSchema** — ตรวจสอบข้อมูลการซื้อขาย (symbol, type, quantity, price, date, currency, fees, taxes)
- **AddAssetSchema** — ตรวจสอบข้อมูลสินทรัพย์ที่เพิ่มใหม่
- **CashActivitySchema** — ตรวจสอบข้อมูลรายรับ-รายจ่าย
- **ProfileUpdateSchema** — ตรวจสอบข้อมูลการอัปเดตโปรไฟล์

นอกจากนี้ ระบบยังมีฟังก์ชัน Input Sanitization สำหรับกรองอักขระพิเศษ (เช่น `<` และ `>`) เพื่อป้องกัน XSS Attack

---

## 3.7 การทดสอบระบบ (System Testing)

การทดสอบระบบ FinTrack แบ่งออกเป็น 3 ส่วนหลัก ดังนี้

### 3.7.1 การทดสอบฟังก์ชันการทำงาน (Functional Testing)

ทดสอบว่าฟังก์ชันต่าง ๆ ของระบบทำงานได้ถูกต้องตามที่ออกแบบไว้ ครอบคลุมทุกโมดูลของระบบ

ตารางที่ 3.11 รายการทดสอบฟังก์ชันการทำงาน

| ลำดับ | รายการทดสอบ | สิ่งที่คาดหวัง |
|:---:|:---|:---|
| 1 | ล็อกอินผ่าน Google OAuth | ผู้ใช้สามารถล็อกอินและเข้าสู่ Dashboard ได้ |
| 2 | เพิ่มสินทรัพย์ใหม่ | สินทรัพย์ปรากฏในรายการ Portfolio พร้อมข้อมูลราคาปัจจุบัน |
| 3 | บันทึกการซื้อขาย (BUY/SELL) | รายการซื้อขายบันทึกลงฐานข้อมูลและอัปเดต Portfolio อัตโนมัติ |
| 4 | วิเคราะห์สัญญาณซื้อขาย | ระบบแสดง Technical Indicators, Confidence Score และจุด Entry/TP/SL ได้ถูกต้อง |
| 5 | สแกนตลาด (Market Scanner) | ระบบสแกนหาหุ้นที่มีสัญญาณซื้อได้จากตลาด SET และ US |
| 6 | บันทึกรายรับ-รายจ่าย | รายการบันทึกลงฐานข้อมูลและปรากฏใน Ledger |
| 7 | จัดการ Money Buckets | สร้าง แก้ไข ฝาก ถอน และลบถังเงินได้ |
| 8 | แสดง Dashboard Widgets | Widget แสดงข้อมูลถูกต้อง Drag-and-Drop ใช้งานได้ |
| 9 | AI Financial Advisor | AI ตอบคำถามและวิเคราะห์ข้อมูลทางการเงินได้ |
| 10 | เปลี่ยนภาษา/สกุลเงิน | ระบบแสดงผลตามภาษาและสกุลเงินที่เลือก |
| 11 | Import ข้อมูลจาก CSV | ระบบ Parse ไฟล์ CSV และนำเข้าข้อมูลการซื้อขายได้ |
| 12 | ลบข้อมูลทั้งหมด | ข้อมูลทั้งหมดของผู้ใช้ถูกลบจากทุกตาราง |

### 3.7.2 การทดสอบความปลอดภัย (Security Testing)

ทดสอบกลไกรักษาความปลอดภัยของระบบ

ตารางที่ 3.12 รายการทดสอบความปลอดภัย

| ลำดับ | รายการทดสอบ | สิ่งที่คาดหวัง |
|:---:|:---|:---|
| 1 | เข้าถึงหน้า Protected โดยไม่ล็อกอิน | ระบบ Redirect ไปหน้า Login |
| 2 | เข้าถึงข้อมูลของผู้ใช้อื่น (RLS) | ระบบปฏิเสธ Access ไม่แสดงข้อมูล |
| 3 | ส่ง Request เกินจำนวนที่กำหนด (Rate Limit) | ระบบตอบกลับ HTTP 429 |
| 4 | ส่ง Request โดยไม่มี CSRF Token | ระบบตอบกลับ HTTP 403 |
| 5 | ส่ง Input ที่มี XSS Script | ระบบ Sanitize ข้อมูลก่อนบันทึก |
| 6 | ตรวจสอบ Security Headers | Response มี Headers ตามมาตรฐาน OWASP |

### 3.7.3 การทดสอบ Responsive Design

ทดสอบการแสดงผลของระบบบนหน้าจอขนาดต่าง ๆ

ตารางที่ 3.13 รายการทดสอบ Responsive Design

| ลำดับ | ขนาดหน้าจอ | อุปกรณ์ | สิ่งที่คาดหวัง |
|:---:|:---|:---|:---|
| 1 | ≥ 1024px | Desktop / Laptop | แสดง Sidebar, Dashboard Grid เต็มรูปแบบ |
| 2 | 768px – 1023px | Tablet | Sidebar ซ่อนได้, Layout ปรับเป็น 2 คอลัมน์ |
| 3 | < 768px | Mobile | แสดง Bottom Navigation, Layout ปรับเป็น 1 คอลัมน์ |

---

## 3.8 ขั้นตอนการทำงานของระบบ (System Workflow)

### 3.8.1 ขั้นตอนการวิเคราะห์สัญญาณซื้อขาย (Trade Signal Analysis Workflow)

ขั้นตอนการวิเคราะห์สัญญาณซื้อขายเป็นฟังก์ชันหลักของระบบ FinTrack ซึ่งทำงานผ่าน Server Action มีลำดับการทำงานดังนี้

1. ผู้ใช้กรอกสัญลักษณ์หุ้น (Symbol) เช่น AAPL, PTT, NVDA
2. ระบบตรวจสอบ Cache ว่ามีข้อมูลที่ยังไม่หมดอายุ (TTL = 60 วินาที) หรือไม่
3. หากไม่มีใน Cache ระบบจะดึงข้อมูลราคาย้อนหลัง 3 เดือน (Daily Interval) จาก Yahoo Finance API
4. ระบบคำนวณ Technical Indicators ทั้ง 12 ตัว ดังนี้

ตารางที่ 3.14 Technical Indicators ที่ใช้ในระบบ

| ลำดับ | Indicator | น้ำหนัก (Weight) | เงื่อนไขสัญญาณซื้อ |
|:---:|:---|:---:|:---|
| 1 | RSI (Relative Strength Index) | 8 | RSI อยู่ในช่วง 32–52 (SET) หรือ 36–54 (US) และมีแนวโน้มเพิ่มขึ้น |
| 2 | MACD (Moving Average Convergence Divergence) | 10 | MACD Line ตัดขึ้นเหนือ Signal Line (Bullish Crossover) |
| 3 | EMA Crossover (9/21) | 8 | EMA 9 ตัดขึ้นเหนือ EMA 21 หรือ EMA 9 อยู่เหนือ EMA 21 ร่วมกับ MACD Histogram > 0 |
| 4 | Volume Ratio | 7 | ปริมาณการซื้อขาย ≥ 1.6 เท่า (SET) หรือ 1.4 เท่า (US) ของค่าเฉลี่ย 10 วัน |
| 5 | VWAP (Volume Weighted Average Price) | 7 | ราคาอยู่ที่ VWAP หรือเหนือ VWAP |
| 6 | ADX (Average Directional Index) | 6 | ADX > 22 (SET) หรือ > 20 (US) — แสดงว่ามีเทรนด์ชัดเจน |
| 7 | Stochastic Oscillator (14,3) | 9 | %K ตัดขึ้นเหนือ %D ขณะที่ทั้งสองอยู่ต่ำกว่า 25 (Oversold Zone) |
| 8 | Moving Average Trend (20/50) | 7 | ราคา > MA20 และ MA20 > MA50 |
| 9 | Trendline Analysis | 8 | เทรนด์ปัจจุบันเป็นขาขึ้น (UP) และ R² > 0.6 |
| 10 | Price Action Pattern | 10 | พบรูปแบบแท่งเทียนขาขึ้น (Bullish Pattern) เช่น Hammer, Engulfing, Morning Star |
| 11 | SMC: Demand Zone / Order Block | 12 | ราคาอยู่ใน Demand Zone หรืออยู่ใกล้ Order Block ขาขึ้น (ห่างไม่เกิน 2%) |
| 12 | Speed Lines (1/3 & 2/3) | 8 | ราคาอยู่ในโซน Speed Line 1/3 หรือ 2/3 |

5. ระบบคำนวณ **Confidence Score** จากผลรวมน้ำหนักของ Indicator ที่ให้สัญญาณซื้อ หารด้วยน้ำหนักรวมทั้งหมด (100 คะแนน)
6. ระบบจัด **Label** ตามคะแนน ดังนี้

ตารางที่ 3.15 เกณฑ์การจัด Label สัญญาณ

| Confidence Score | Label | ความหมาย |
|:---:|:---|:---|
| ≥ 85% | STRONG BUY | สัญญาณซื้อที่แข็งแกร่งมาก |
| 70% – 84% | BUY | สัญญาณซื้อ |
| 50% – 69% | WATCH | น่าจับตาดู |
| < 50% | NO SIGNAL | ไม่มีสัญญาณ |

7. ระบบคำนวณจุด Entry, Take Profit (TP) และ Stop Loss (SL) จากค่า ATR (Average True Range) 14 วัน
   - **Entry** = ราคาปัจจุบัน
   - **Stop Loss** = ราคาปัจจุบัน − (ATR × 1.2)
   - **Take Profit** = ราคาปัจจุบัน + (ATR × 2)
   - **Risk/Reward Ratio** = (TP − Entry) / (Entry − SL)

8. ระบบบันทึกผลลัพธ์ลง Cache และส่งกลับไปยัง Frontend แสดงผล

รูปที่ 3.15 แผนภาพขั้นตอนการวิเคราะห์สัญญาณซื้อขาย (Trade Signal Analysis Flowchart)

### 3.8.2 ขั้นตอนการสแกนตลาด (Market Scanner Workflow)

ระบบ Market Scanner ทำงานดังนี้

1. ผู้ใช้เลือกตลาดที่ต้องการสแกน (SET, US Standard, US Dime หรือ All)
2. ระบบดึง Symbol Universe จาก SET API หรือ NASDAQ Screener API (Cache ไว้ 24 ชั่วโมง)
3. ระบบกรองหุ้นเบื้องต้น (Pre-filter) ด้วยเกณฑ์ปริมาณการซื้อขายและความผันผวน — โดยดึงข้อมูลแบบ Batch (50 ตัว/รอบ) จาก Yahoo Finance
4. ระบบนำหุ้นที่ผ่านเกณฑ์ (สูงสุด 80 ตัว) มาวิเคราะห์สัญญาณซื้อขายแบบ Parallel (Promise.allSettled)
5. ระบบกรองผลลัพธ์ที่มี Confidence ≥ 50% (หรือ ≥ 60% สำหรับ US Dime) เรียงตาม Confidence สูงสุด
6. ส่งผลลัพธ์สูงสุด 12 ตัว กลับไปยัง Frontend แสดงผล (Cache ไว้ 5 นาที)

รูปที่ 3.16 แผนภาพขั้นตอนการสแกนตลาด (Market Scanner Flowchart)

### 3.8.3 ขั้นตอนการทำงานของระบบ AI Financial Advisor

ระบบ AI Financial Advisor ทำงานดังนี้

1. ผู้ใช้พิมพ์ข้อความใน Chat Interface
2. ระบบวิเคราะห์ข้อความว่าเป็นคำสั่งบันทึกธุรกรรม (Natural Language Transaction) หรือคำถามทั่วไป
3. หากเป็นคำสั่งบันทึกธุรกรรม ระบบจะ Parse ข้อมูล (ประเภท จำนวนเงิน หมวดหมู่) และบันทึกลงฐานข้อมูลอัตโนมัติ
4. หากเป็นคำถามทั่วไป ระบบจะรวบรวมข้อมูลทางการเงินของผู้ใช้ (Assets, Trades, Cashflow, Buckets) เป็น Context ส่งไปยัง Google Gemini AI เพื่อวิเคราะห์และสร้างคำตอบ
5. ระบบแสดงคำตอบจาก AI พร้อม Data Visualization (กราฟ, ตัวเลข, ไอคอน) ใน Chat Interface

รูปที่ 3.17 แผนภาพขั้นตอนการทำงานของระบบ AI Financial Advisor

---

## 3.9 ระบบรองรับหลายสกุลเงิน (Multi-Currency Support)

ระบบ FinTrack รองรับ 4 สกุลเงิน ได้แก่ USD, THB, JPY และ EUR โดยมีกลไกการทำงานดังนี้

1. **สกุลเงินหลัก** — ผู้ใช้สามารถเลือกสกุลเงินหลักที่ต้องการแสดงผลได้ใน Settings
2. **การจัดเก็บข้อมูล** — ข้อมูลทางการเงินทั้งหมดจัดเก็บในรูปแบบ USD เป็นหลัก พร้อมบันทึก Original Amount, Original Currency และ Exchange Rate ณ ขณะทำรายการ
3. **การคำนวณอัตราแลกเปลี่ยน** — ระบบดึงอัตราแลกเปลี่ยนปัจจุบันจาก Yahoo Finance API (ตัวอย่าง: USDTHB=X, USDJPY=X, USDEUR=X) และ Cache ไว้เพื่อลดจำนวน API Call
4. **การแสดงผล** — จำนวนเงินทั้งหมดแสดงผลในสกุลเงินที่ผู้ใช้เลือก โดยแปลงจาก USD ตามอัตราแลกเปลี่ยนปัจจุบัน

---

## 3.10 สรุป

ในบทนี้ได้อธิบายถึงวิธีการดำเนินงานวิจัยของระบบ FinTrack ตั้งแต่ขั้นตอนการศึกษาและวิเคราะห์ความต้องการ การออกแบบระบบ การพัฒนา และการทดสอบ ระบบพัฒนาด้วย Next.js 15, React 19, TypeScript และ Supabase (PostgreSQL) โดยมีจุดเด่นคือ ระบบวิเคราะห์สัญญาณซื้อขายที่รวม Technical Indicators 12 ตัวร่วมกับ Smart Money Concepts, ระบบ AI Financial Advisor ที่ใช้ Google Gemini, ระบบ Money Buckets สำหรับจัดสรรเงินตามเป้าหมาย และระบบรักษาความปลอดภัยหลายระดับตามมาตรฐาน OWASP
