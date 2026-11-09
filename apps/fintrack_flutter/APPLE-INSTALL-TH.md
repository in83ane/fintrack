# ติดตั้ง FinTrack บน Mac และ iPhone

แอปนี้เปิดเว็บ FinTrack ที่ https://fintrackinvest.vercel.app/dashboard ในหน้าต่างแอป โดยใช้บัญชีและข้อมูลเดิม ต้องเชื่อมต่ออินเทอร์เน็ต สีและหน้าจอจะอัปเดตตามเว็บที่ deploy แล้ว

## Mac: ไฟล์ติดตั้งสำเร็จรูป

เมื่อ Apple build ใน GitHub Actions สำเร็จ ให้ดาวน์โหลด artifact `FinTrack-macOS` จาก https://github.com/in83ane/fintrack/actions/workflows/apple-build.yml แล้วแตก ZIP เปิด `FinTrack-macOS.dmg` และลาก FinTrack ไป Applications

ไฟล์นี้เซ็นแบบ ad hoc สำหรับใช้งานส่วนตัว ยังไม่ผ่าน Apple notarization หาก macOS บล็อก ให้ใช้ System Settings > Privacy & Security > Open Anyway สำหรับแอปนี้ หรือเลือก build บน Mac ของตัวเองตามขั้นตอนด้านล่าง ไม่ต้องปิด Gatekeeper ทั้งระบบ

## Mac: สร้างและติดตั้งจากชุดซอร์ส

ต้องมี Xcode จาก App Store เปิด Xcode ให้ติดตั้งส่วนประกอบครั้งแรกเสร็จ และมี CocoaPods (`brew install cocoapods` หากใช้ Homebrew)

แตก ZIP ชุดซอร์ส เปิด Terminal แล้วพิมพ์ `cd ` ตามด้วยลากโฟลเดอร์ `FinTrack-Apple-Install` ลงใน Terminal กด Enter จากนั้นรัน:

```bash
bash Install-Mac.command
```

สคริปต์ดาวน์โหลด Flutter รุ่นที่โปรเจกต์ใช้ไว้ใน Library ของผู้ใช้ สร้างแอป ติดตั้งที่ `~/Applications/FinTrack.app` และเปิดให้ หากมีแอปเดิมจะเก็บสำรองไว้ โดยไม่ลบข้อมูลล็อกอิน

## iPhone: เตรียมและติดตั้งผ่าน Xcode

บน Mac เครื่องเดียวกัน ต่อ iPhone ด้วยสาย กด Trust และเปิด Settings > Privacy & Security > Developer Mode บน iPhone แล้วรัน:

```bash
bash Prepare-iPhone.command
```

ใน Xcode ที่เปิดขึ้น:

1. ไปที่ Settings > Accounts เพิ่ม Apple ID ของคุณบน Mac
2. เลือกโปรเจกต์ Runner แล้วเลือก target Runner > Signing & Capabilities
3. เปิด Automatically manage signing และเลือก Team ของคุณ (Personal Team ใช้ทดสอบเครื่องตัวเองได้)
4. ถ้า Bundle Identifier ซ้ำ ให้เปลี่ยนเป็นชื่อเฉพาะ เช่น `com.yourname.fintrack`
5. เลือก iPhone ที่ต่ออยู่ด้านบน แล้วกด Run รอจนแอปเปิดบนโทรศัพท์
6. หาก iPhone ขอเชื่อถือนักพัฒนา ให้เปิด Settings > General > VPN & Device Management แล้วเชื่อถือบัญชีของคุณ

แอปที่ใช้ Personal Team อาจต้องเซ็นและติดตั้งซ้ำเมื่อ provisioning หมดอายุ ไฟล์ iOS ที่ไม่ได้เซ็นไม่สามารถกดติดตั้งบน iPhone โดยตรงได้ ชุดนี้ไม่ใช่ TestFlight และไม่ส่งขึ้น App Store

## ข้อจำกัดของแอปรุ่นนี้

- รุ่น 1.1.1 สำหรับ Mac/iPhone รองรับ Google ผ่านหน้าต่างล็อกอินของ Apple แล้วกลับเข้าแอปอัตโนมัติ ต้องติดตั้งรุ่นใหม่แทน 1.0.0 และใช้เว็บที่ deploy โค้ดใหม่แล้ว ควรทดสอบเลือกบัญชี ยกเลิก ล็อกเอาต์ และเปิดแอปซ้ำบนเครื่องจริง
- การดาวน์โหลด/ส่งออกไฟล์บางชนิดต้องเปิดในเบราว์เซอร์; ยังไม่มี native blob export
- ต้องทดสอบการล็อกอิน คีย์บอร์ด อัปโหลด และ session บนอุปกรณ์จริง การตรวจซอร์สไม่ใช่การยืนยันว่าติดตั้งบนเครื่องคุณแล้ว

เอกสาร: [Flutter macOS](https://docs.flutter.dev/deployment/macos), [Flutter iOS setup](https://docs.flutter.dev/platform-integration/ios/setup)

## ตรวจว่ากำลังเปิดรุ่นแก้ไข

หลังติดตั้งทับ ให้ปิด FinTrack ทุกหน้าต่างและเปิดจาก Applications ชื่อบนแถบด้านบนต้องแสดง `FinTrack · 1.1.1` รุ่นนี้ถามความสามารถจากตัวแอปโดยตรง ไม่ใช้ User-Agent เป็นตัวตัดสิน Google Login และไม่ปล่อยลิงก์ Google ไปจบในแท็บเบราว์เซอร์ธรรมดา
