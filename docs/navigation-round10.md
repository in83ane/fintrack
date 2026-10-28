# Round 10 — navigation fade regression

แก้การเด้งกลับของหน้าเดิมโดยให้ `data-page-wrapper` เพียงตัวเดียวควบคุม opacity ผ่าน `data-phase` ไม่มี animation บน wrapper ซ้อนกันอีก ไม่เปลี่ยนรูปแบบ sidebar/top bar, tokens, ข้อมูล หรือสูตรคำนวณ และไม่ได้โหลด design/frontend skill

## สาเหตุที่ reproduce ได้ก่อนแก้

หลักฐานดิบอยู่ใน `output/navigation-round10/before-dev.json` และ `before-production.json` พร้อม server logs และวิดีโอก่อนแก้

| ตัวอย่าง | เวลา (ms) | phase | router / rendered route | opacity | page roots |
|---|---:|---|---|---:|---:|
| dev ก่อนเด้ง | 11899.70 | waiting | /cashflow / /cashflow | 0.173800 | 1 |
| dev หลังเด้ง | 11903.90 | waiting | /cashflow / /cashflow | 1.000000 | 1 |
| production ก่อนเด้ง | 5877.90 | waiting | /cashflow / /cashflow | 0.174048 | 1 |
| production หลังเด้ง | 5882.10 | waiting | /cashflow / /cashflow | 1.000000 | 1 |

ตอนนั้น title และ active menu เป็น Dashboard แล้ว แต่ DOM ยังเป็น Cash Flow เดิม ใน dev log animation ยัง running และ fill=auto ก่อนเด้ง; เฟรมถัดมาไม่มี animation เหลือและ base opacity กลับเป็น 1 พบการเด้งลักษณะนี้ 5 ครั้งใน dev และ 5 ครั้งใน production จากการเปลี่ยนหน้า 8 ครั้งต่อโหมด รายงานสาเหตุให้ผู้ใช้ก่อนแก้พฤติกรรมแล้ว

| ประเด็นที่ผู้ใช้ให้ตรวจ | ผล | หลักฐาน/ข้อสรุป |
|---|---|---|
| leaving ถูกล้าง / กลับ idle ก่อน commit | ไม่ใช่การ reset state | โค้ดเดิมไม่มี leaving phase ที่ถือ opacity; log อยู่ waiting ทั้งก่อนและหลังเด้ง จึงไม่มี state ป้องกันการคืนค่า |
| ขาออกไม่มี forwards / animation ถูกยกเลิกแล้วคืนค่า | ใช่ | WAAPI เดิม animate 1→0.15 โดยไม่กำหนด fill; computed opacity 0.174→1 โดย route ไม่เปลี่ยน การ abort ก็ cancel animation ได้ |
| timer swap ไม่ตรงกับ async route commit | ใช่ | timer 120ms เพิ่งเรียก router.push เมื่อ fade จบ ขณะที่ Next ยังต้อง commit; ไม่มี held คั่น จึงเผย base opacity ระหว่างรอ |
| StrictMode cleanup | ไม่ใช่ต้นเหตุที่ reproduce นี้ | production ที่ไม่มีการ replay effects แบบ StrictMode dev ยังเด้ง 5 ครั้งเหมือนกัน |
| Suspense แสดง tree หน้าเก่าซ้ำ | ไม่พบเป็นต้นเหตุ | จุดที่เด้งยังอยู่ waiting, ไม่ใช่ skeleton, route เดิม และ 1 root; เป็น tree ที่ Next ยังคงไว้และ animation หมด ไม่ใช่หน้าใหม่ mount ซ้อน |
| prefetch / คลิกทำ navigation สองครั้ง | ไม่พบ | captured click/request เป็นหนึ่งรายการต่อ navigation; prefetch เป็นการโหลดล่วงหน้า ไม่ได้เรียก push รอบที่สอง |
| next dev compile ทำให้รอนานขึ้น | ใช่ แต่ไม่ใช่ต้นเหตุ | cold Portfolio click→content: dev 4286ms เทียบ production 1202ms; Ledger 2084→1207ms; Cash Flow 2065→1219ms แต่ทั้งสองโหมดมี bounce |

ตัวเลขเวลาเป็น integration fixture ที่จงใจหน่วง server page 1200ms เพื่อทดสอบการรอ Next จริง ไม่ใช่การวัด latency ของบัญชีหรือ API จริง

## โครงสร้างหลังแก้

- `idle` opacity 1 ระหว่างรอปลายทางที่ยังไม่พร้อม; prefetch เริ่มจาก hover/focus/pointerdown และคำสั่ง navigation
- เส้นทางที่เคยพร้อมและยังอยู่ใน TTL พร้อมข้อมูล ใช้ขาออกได้ทันที เส้นทางเย็นเก็บหน้าเดิมจนถึง SKELETON_DELAY 300ms
- `leaving` keyframes จาก opacity ปัจจุบันไป 0, 120ms ease-in, fill both; base ของ phase นี้เป็น 0 จึง cancel animation แล้วไม่คืนเป็น 1
- `held` opacity 0 ไม่มี animation/transition; timer ถึงก่อนหรือหลัง compositor ก็ไม่ทำให้หน้าเก่าปรากฏ
- router.push ทำหลัง commit held; Next outlet คง mounted เพื่อให้ router ทำงาน ส่วน actual page ถูกแทนที่ภายใน template เดียว
- destination acknowledgement ผ่าน useLayoutEffect ทำให้ entering ถูก commit ก่อน paint; ขาเข้า 0→1, 180ms ease-out, fill both แล้ว timer เปลี่ยนเป็น idle
- คลิกใหม่ระหว่าง leaving เปลี่ยนเฉพาะเป้าหมายและยกเลิก wait/request ของคำสั่งเก่า ไม่ restart exit หรือคืน opacity; ระหว่าง entering อ่าน computed opacity ก่อนเปลี่ยนเป็น leaving
- คลิกเมนูเดิมซ้ำก็ preventDefault ของ Next Link ก่อน deduplicate เสมอ เพื่อไม่ให้คลิกซ้ำหลุดไปเรียก router.push นอก state machine
- presentation ที่กำลังออกถูกเก็บจน swap รวมถึง route/เวลาเริ่มของ skeleton จึงไม่ย้อนกลับเป็น actual page เก่าขณะคลิกรัว
- ready destination ใช้ minimum skeleton เฉพาะเมื่อ revision นั้นเคยแสดง skeleton จริง ไม่ใช้ loading state ที่ตกค้างจาก revision ก่อน
- skeleton ขั้นต่ำ 300ms นับจากการมีสิทธิ์แสดง ไม่ใช่จากการ mount แบบ held; watchdog 8s/20s และ Retry คงอยู่
- ทดสอบ Next server-error fallback ที่อยู่ภายใน template เดิม: มี root เดียวและกลับมาแสดง error/Retry ได้ ไม่ค้าง held
- ปุ่มภายใน Dashboard, Terminal, Trade, asset detail และลิงก์ Bucket ใน Portfolio ใช้ตัวควบคุมเดียวกับเมนู ปลายทางเดิมทั้งหมด
- reduced motion ข้าม fade และสลับโดยตรง ไม่มีการบังคับ animation ให้ผู้ใช้กลุ่มนี้

เงื่อนไข “หน้าเก่ามองเห็นไม่ได้หลังเริ่ม fade-out” ถ้าอ่านตามตัวอักษรจะขัดกับการ fade 120ms: หน้าเก่าต้องมองเห็นบางส่วนระหว่างขาออก การตรวจจึงบังคับว่า opacity ห้ามเพิ่มระหว่างขาออก และหลังถึง held/0 แล้วหน้าเก่าห้ามกลับมา ขณะคลิกขัดจังหวะขาเข้า จะเริ่มรอบขาออกใหม่จากค่าปัจจุบันตามข้อกำหนด

## ผลทดสอบตัวเลข

ใช้ Chromium/Edge headless, Next 15.5.15 App Router จริง, template/shell/transition และ skeleton ของโปรเจกต์จริง; แยก auth/data ด้วย fixture ไม่เรียกเขียนข้อมูลบัญชี ใช้ 9 เมนูที่เปลี่ยน route จริง: Dashboard, Portfolio, Ledger, Cash Flow, Terminal, Trade Plan, Bucket, History, Settings ทั้ง dark/light (ครึ่งแรก/ครึ่งหลังของแต่ละชุด) Support เป็น href=# และ Global Settings เป็น modal จึงไม่ใช่ route navigation

| เงื่อนไข | คลิก | rAF frames | opacity violations | roots สูงสุด | opacity เฟรมแรก entering สูงสุด |
|---|---:|---:|---:|---:|---:|
| next dev cold (ครบทุกเมนูครั้งแรก แล้วสุ่มต่อ) | 30 | 7880 | 0 | 1 | 0 |
| ปกติ / cache อุ่น | 30 | 2962 | 0 | 1 | 0 |
| CPU throttle 6× | 30 | 1703 | 0 | 1 | 0 |
| Slow 3G + Disable cache | 30 | 3285 | 0 | 1 | 0 |
| burst 5 clicks / 375ms | 30 | 1272 | 0 | 1 | 0 |
| prefers-reduced-motion | 30 | 3049 | 0 | 1 | 1 (สลับทันที ไม่ animate) |
| next build + next start | 30 | 5474 | 0 | 1 | 0 |

รวม 210 คลิก / 25,625 sampled frames ค่า tolerance ของ opacity = 0.02 ชุดปกติที่ cache อุ่นมี skeleton 0 เฟรม ตรวจ root ของ template จริง (`data-page-root`) ไม่ใช่นับเฉพาะ shell ที่อยู่ถาวร ชื่อหน้าและ active menu ตรงกันทุกเฟรมที่สุ่มตัวอย่าง และ sidebar/header เป็น DOM nodes เดิม

ตรวจเพิ่มเติมทั้ง dev/prod: กดเมนูเดิมซ้ำ 5 ครั้งใน 100ms, คลิกขณะ entering จริง (opacity อยู่ระหว่าง 0 และ 1), คลิกขณะ skeleton กำลังเข้าและข้อมูลยังไม่พร้อม, Back/Forward, cancel ขาออกด้วย WAAPI (computed opacity หลัง cancel = 0), watchdog 8s/20s, Retry และ server-error boundary รายละเอียดอยู่ใน `extras-dev.json` / `extras-production.json`

สคริปต์จับข้อมูลทุก rAF และ assert: leaving ไม่เพิ่ม, held เป็น 0, first entering เป็น 0, entering ไม่ลด, ไม่เปลี่ยน outgoing route ก่อนถึง 0, ไม่คืน actual page เก่าจาก skeleton ระหว่างออก และมี root เดียว คำสั่งแต่ละชุดใช้ seed คงที่เพื่อ reproduce ได้

## วิดีโอ / ความสว่างจริงของพิกเซล

`video-dev.webm` อัด 10 warm transitions มี marker สำหรับเทียบเวลาอยู่นอกพื้นที่เนื้อหา ใช้ FFmpeg crop `1186:926:254:74` ที่ viewport 1440×1000 แล้วคำนวณ signalstats.YAVG ทุกเฟรม ผลล่าสุด: 10/10 ช่วงเป็นลดลงแล้วเพิ่มขึ้นครั้งเดียว ไม่มี rebound/second dip; luminance ลดลง 0.593–0.670 หน่วย Y ใน crop นี้ ค่า tolerance YAVG 0.08/219 เพื่อเผื่อ compression และความต่างของตัวอักษรแต่ละ route

หลักฐาน: `video-dev-analysis.json`, `video-dev-luminance.txt`, `video-dev-marker.txt` และ `video-dev.json` สำหรับเทียบเวลา browser กับ video PTS

วิดีโอเป็น 25fps จึงไม่อาจรับรองช่องว่างสั้นกว่า 40ms ได้ด้วยวิดีโอเพียงอย่างเดียว ใช้ rAF/computed-opacity logs ตรวจช่องว่างเหล่านั้นแยกต่างหาก (ก่อนแก้พบ jump ห่างกันราว 4.2ms) ไม่ได้วิเคราะห์วิดีโอต้นฉบับของผู้ใช้ เนื่องจากข้อความรอบนี้ไม่มีไฟล์วิดีโอที่เข้าถึงได้แนบมา

## ไฟล์ที่แก้ในรอบนี้

| ไฟล์ | เปลี่ยนอะไร |
|---|---|
| src/components/PageTransition.tsx | phase machine, latest-request coordination, opacity interruption, shared push helper |
| src/components/RouteContent.tsx | persistent wrapper, pre-paint acknowledgement, presentation ที่คงจน swap, dev logger/assertions |
| src/components/RouteLoading.tsx | freeze outgoing skeleton identity, minimum ตาม reveal eligibility |
| src/index.css | เฉพาะ phase selectors/keyframes ของ page wrapper |
| src/app/(app)/dashboard/DashboardView.tsx | เปลี่ยน router hook ให้ปุ่มผ่าน transition |
| src/app/(app)/terminal/TerminalView.tsx | เปลี่ยน router hook |
| src/app/(app)/trade/[[...symbol]]/TradeView.tsx | เปลี่ยน router hook |
| src/app/(app)/portfolio/[symbol]/page.tsx | เปลี่ยน router hook |
| src/app/(app)/portfolio/PortfolioView.tsx | ปุ่ม Bucket ใช้ navigation event แทน full reload |
| scripts/navigation-round10-qa.mjs | baseline/matrix/extras/video integration QA |
| scripts/navigation-round10-video.mjs | FFmpeg luminance assertions |
| docs/navigation-round10.md | รายงานนี้ |

ไฟล์อื่นที่มี changes ใน working tree อยู่ก่อนรอบนี้ ไม่ได้ reset หรือรวมเป็นการแก้ของรอบ 10

## เรียกซ้ำ / diagnostics

```powershell
node scripts/navigation-round10-qa.mjs
$env:QA_MODE='production'; node scripts/navigation-round10-qa.mjs
Remove-Item Env:QA_MODE
$env:QA_EXTRA='1'; node scripts/navigation-round10-qa.mjs
Remove-Item Env:QA_EXTRA
$env:QA_VIDEO='1'; node scripts/navigation-round10-qa.mjs
Remove-Item Env:QA_VIDEO
node scripts/navigation-round10-video.mjs
```

ชุด QA ใช้ Playwright ที่ `%TEMP%/fintrack-cashflow-qa/node_modules` และ Edge; video analyzer รับ `FFMPEG_PATH` หรือใช้ binary จาก imageio-ffmpeg ใน `%TEMP%/fintrack-video-qa` มี fixtures แยก dev/prod ใน temp และใช้พอร์ต 3110/3111 ไม่ปิด dev server ของผู้ใช้ที่พอร์ต 3000

เปิด dev logger ด้วย `?traceNavigation` แล้วอ่าน `window.__fadeLog`; ปิดด้วย `sessionStorage.removeItem('fintrack:trace-navigation')` เก็บสูงสุดประมาณ 30,000 frames ไม่มีข้อมูลรายการ/ยอดเงินจริง production ไม่มี app logger (QA ใช้ external probe ของตัวเอง)

การตรวจอื่น: production build ของแอปจริงผ่าน; TypeScript ผ่าน; cache tests, Cash Flow selectors 7 tests และ FX tests ผ่าน; git diff --check ผ่าน Build ยังมี warnings เดิมเรื่อง hooks, img และ Recharts ขณะ prerender แต่ไม่มี build error

