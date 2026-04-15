"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Shield, Eye, Database, Trash2, Lock, Globe, FileText } from "lucide-react";
import Link from "next/link";

// Translations
interface Translations {
  th: {
    backToLogin: string;
    privacy: string;
    privacyPolicy: string;
    lastUpdated: string;
    introduction: string;
    introText: string;
    infoWeCollect: string;
    infoWeCollectDesc: string;
    accountInfo: string;
    accountInfoDesc: string;
    financialData: string;
    financialDataDesc: string;
    usageData: string;
    usageDataDesc: string;
    deviceInfo: string;
    deviceInfoDesc: string;
    howWeUse: string;
    howWeUseDesc: string;
    use1: string;
    use2: string;
    use3: string;
    use4: string;
    use5: string;
    dataSecurity: string;
    dataSecurityDesc: string;
    security1: string;
    security2: string;
    security3: string;
    security4: string;
    security5: string;
    dataSharing: string;
    dataSharingDesc: string;
    yourRights: string;
    yourRightsDesc: string;
    right1: string;
    right2: string;
    right3: string;
    right4: string;
    right5: string;
    cookiePolicy: string;
    cookiePolicyDesc: string;
    changes: string;
    changesDesc: string;
    contact: string;
    contactDesc: string;
    allRightsReserved: string;
    termsOfService: string;
  };
  en: {
    backToLogin: string;
    privacy: string;
    privacyPolicy: string;
    lastUpdated: string;
    introduction: string;
    introText: string;
    infoWeCollect: string;
    infoWeCollectDesc: string;
    accountInfo: string;
    accountInfoDesc: string;
    financialData: string;
    financialDataDesc: string;
    usageData: string;
    usageDataDesc: string;
    deviceInfo: string;
    deviceInfoDesc: string;
    howWeUse: string;
    howWeUseDesc: string;
    use1: string;
    use2: string;
    use3: string;
    use4: string;
    use5: string;
    dataSecurity: string;
    dataSecurityDesc: string;
    security1: string;
    security2: string;
    security3: string;
    security4: string;
    security5: string;
    dataSharing: string;
    dataSharingDesc: string;
    yourRights: string;
    yourRightsDesc: string;
    right1: string;
    right2: string;
    right3: string;
    right4: string;
    right5: string;
    cookiePolicy: string;
    cookiePolicyDesc: string;
    changes: string;
    changesDesc: string;
    contact: string;
    contactDesc: string;
    allRightsReserved: string;
    termsOfService: string;
  };
}

const translations: Translations = {
  th: {
    backToLogin: "กลับไปหน้าเข้าสู่ระบบ",
    privacy: "ความเป็นส่วนตัว",
    privacyPolicy: "นโยบายความเป็นส่วนตัว",
    lastUpdated: "อัปเดตล่าสุด",
    introduction: "บทนำ",
    introText:
      "ที่ FinTrack เราให้คุณค่ากับความเป็นส่วนตัวของคุณ และมุ่งมั่นที่จะปกป้องข้อมูลส่วนบุคคลของคุณ นโยบายความเป็นส่วนตัวนี้อธิบายว่าเรารวบรวม ใช้ จัดเก็บ และปกป้องข้อมูลของคุณอย่างไร เมื่อคุณใช้แพลตฟอร์มการติดตามทางการเงินของเรา",
    infoWeCollect: "1. ข้อมูลที่เรารวบรวม",
    infoWeCollectDesc: "เรารวบรวมข้อมูลประเภทต่อไปนี้เพื่อให้บริการและปรับปรุงบริการของเรา:",
    accountInfo: "ข้อมูลบัญชี",
    accountInfoDesc: "ที่อยู่อีเมล รหัสผ่าน (เข้ารหัส) และข้อมูลโปรไฟล์",
    financialData: "ข้อมูลทางการเงิน",
    financialDataDesc: "ประวัติธุรกรรม การถือครองพอร์ตโฟลิโอ และกิจกรรมการซื้อขาย",
    usageData: "ข้อมูลการใช้งาน",
    usageDataDesc: "วิธีที่คุณโต้ตอบกับแพลตฟอร์มของเรา ฟีเจอร์ที่ใช้ และระยะเวลาเซสชัน",
    deviceInfo: "ข้อมูลอุปกรณ์",
    deviceInfoDesc: "ที่อยู่ IP ประเภทเบราวเซอร์ และตัวระบุอุปกรณ์",
    howWeUse: "2. วิธีที่เราใช้ข้อมูลของคุณ",
    howWeUseDesc: "ข้อมูลของคุณถูกใช้เพื่อวัตถุประสงค์ต่อไปนี้เท่านั้น:",
    use1: "ให้บริการติดตามและวิเคราะห์ทางการเงินที่เป็นส่วนบุคคล",
    use2: "สร้างข้อมูลเชิงลึกเกี่ยวกับพอร์ตโฟลิโอและรายงานประสิทธิภาพ",
    use3: "ปรับปรุงบริการและประสบการณ์ผู้ใช้ของเรา",
    use4: "ส่งการแจ้งเตือนบัญชีและการอัปเดตที่สำคัญ",
    use5: "ป้องกันการฉ้อโกงและรับประกันความปลอดภัยของแพลตฟอร์ม",
    dataSecurity: "3. ความปลอดภัยของข้อมูล",
    dataSecurityDesc: "เราใช้มาตรการรักษาความปลอดภัยตามมาตรฐานอุตสาหกรรมเพื่อปกป้องข้อมูลของคุณ:",
    security1: "การเข้ารหัส SSL/TLS 256-bit สำหรับการส่งข้อมูลทั้งหมด",
    security2: "การแฮชรหัสผ่านอย่างปลอดภัยโดยใช้ bcrypt",
    security3: "การตรวจสอบความปลอดภัยและการทดสอบเจาะระบบเป็นประจำ",
    security4: "การควบคุมการเข้าถึงอย่างเข้มงวดสำหรับพนักงาน",
    security5: "โครงสร้างพื้นฐนคลาวด์ที่ปลอดภัยด้วย uptime 99.9%",
    dataSharing: "4. การแชร์ข้อมูล",
    dataSharingDesc:
      "เราไม่ขาย เช่า หรือแลกเปลี่ยนข้อมูลส่วนบุคคลของคุณให้แก่บุคคลที่สาม เราแชร์ข้อมูลกับผู้ให้บริการที่เชื่อถือได้เท่านั้นที่ช่วยเราดำเนินการแพลตฟอร์ม และเฉพาะภายใต้ข้อตกลงความลับที่เข้มงวด เราอาจแชร์ข้อมูลหากกฎหมายกำหนด",
    yourRights: "5. สิทธิของคุณ",
    yourRightsDesc: "คุณมีสิทธิต่อไปนี้เกี่ยวกับข้อมูลของคุณ:",
    right1: "เข้าถึงข้อมูลส่วนบุคคลของคุณได้ตลอดเวลา",
    right2: "ขอแก้ไขข้อมูลที่ไม่ถูกต้อง",
    right3: "ขอลบบัญชีและข้อมูลที่เกี่ยวข้อง",
    right4: "ส่งออกข้อมูลของคุณในรูปแบบที่พกพาได้",
    right5: "ปฏิเสธการรับสื่อสารทางการตลาด",
    cookiePolicy: "6. นโยบายคุกกี้",
    cookiePolicyDesc:
      "เราใช้คุกกี้และเทคโนโลยีการติดตามที่คล้ายกันเพื่อเพิ่มประสบการณ์ของคุณ สิ่งเหล่านี้รวมถึงคุกกี้ที่จำเป็นสำหรับการตรวจสอบสิทธิ และคุกกี้วิเคราะห์ที่เลือกได้เพื่อช่วยเราเข้าใจว่าผู้ใช้โต้ตอบกับแพลตฟอร์มของเราอย่างไร คุณสามารถควบคุมการตั้งค่าคุกกี้ผ่านการตั้งค่าเบราว์เซอร์ของคุณ",
    changes: "7. การเปลี่ยนแปลงนโยบายนี้",
    changesDesc:
      "เราอาจอัปเดตนโยบายความเป็นส่วนตัวของเราเป็นครั้งคราว เราจะแจ้งให้คุณทราบถึงการเปลี่ยนแปลงใดๆ โดยโพสต์นโยบายใหม่ในหน้านี้และอัปเดตวันที่ เราขอแนะนำให้คุณตรวจสอบนโยบายนี้เป็นระยะเพื่อดูการเปลี่ยนแปลง",
    contact: "8. ติดต่อเรา",
    contactDesc: "หากคุณมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัวนี้หรือสิทธิในข้อมูลของคุณ โปรดติดต่อเราที่",
    allRightsReserved: "สงวนลิขสิทธิ์",
    termsOfService: "ข้อกำหนดการใช้งาน",
  },
  en: {
    backToLogin: "Back to Login",
    privacy: "Privacy",
    privacyPolicy: "Privacy Policy",
    lastUpdated: "Last updated",
    introduction: "Introduction",
    introText:
      "At FinTrack, we value your privacy and are committed to protecting your personal data. This Privacy Policy explains how we collect, use, store, and safeguard your information when you use our financial tracking platform.",
    infoWeCollect: "1. Information We Collect",
    infoWeCollectDesc: "We collect the following types of information to provide and improve our services:",
    accountInfo: "Account Information",
    accountInfoDesc: "Email address, password (encrypted), and profile data",
    financialData: "Financial Data",
    financialDataDesc: "Transaction history, portfolio holdings, and trading activity",
    usageData: "Usage Data",
    usageDataDesc: "How you interact with our platform, features used, and session duration",
    deviceInfo: "Device Information",
    deviceInfoDesc: "IP address, browser type, and device identifiers",
    howWeUse: "2. How We Use Your Data",
    howWeUseDesc: "Your data is used solely for the following purposes:",
    use1: "Providing personalized financial tracking and analytics",
    use2: "Generating portfolio insights and performance reports",
    use3: "Improving our services and user experience",
    use4: "Sending important account notifications and updates",
    use5: "Preventing fraud and ensuring platform security",
    dataSecurity: "3. Data Security",
    dataSecurityDesc: "We implement industry-standard security measures to protect your data:",
    security1: "256-bit SSL/TLS encryption for all data transmission",
    security2: "Secure password hashing using bcrypt",
    security3: "Regular security audits and penetration testing",
    security4: "Strict access controls for employee data access",
    security5: "Secure cloud infrastructure with 99.9% uptime",
    dataSharing: "4. Data Sharing",
    dataSharingDesc:
      "We do not sell, rent, or trade your personal information to third parties. We only share data with trusted service providers who assist us in operating our platform, and only under strict confidentiality agreements. We may also share information if required by law.",
    yourRights: "5. Your Rights",
    yourRightsDesc: "You have the following rights regarding your data:",
    right1: "Access your personal data at any time",
    right2: "Request correction of inaccurate information",
    right3: "Request deletion of your account and associated data",
    right4: "Export your data in a portable format",
    right5: "Opt-out of marketing communications",
    cookiePolicy: "6. Cookie Policy",
    cookiePolicyDesc:
      "We use cookies and similar tracking technologies to enhance your experience. These include essential cookies for authentication and optional analytics cookies to help us understand how users interact with our platform. You can control cookie preferences through your browser settings.",
    changes: "7. Changes to This Policy",
    changesDesc:
      "We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the date. We encourage you to review this policy periodically for any changes.",
    contact: "8. Contact Us",
    contactDesc: "If you have any questions about this Privacy Policy or your data rights, please contact us at",
    allRightsReserved: "All rights reserved",
    termsOfService: "Terms of Service",
  },
};

export default function PrivacyPolicyPage() {
  const [lang, setLang] = React.useState<"th" | "en">("th");

  React.useEffect(() => {
    const savedLang = localStorage.getItem("preferred-lang") as "th" | "en";
    if (savedLang) setLang(savedLang);
  }, []);

  const toggleLang = () => {
    const newLang = lang === "th" ? "en" : "th";
    setLang(newLang);
    localStorage.setItem("preferred-lang", newLang);
  };

  const t = translations[lang];

  return (
    <div className="min-h-screen bg-[#131313] text-gray-300">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#131313]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/login"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">{t.backToLogin}</span>
          </Link>
          <div className="flex items-center gap-2 ml-auto">
            {/* Language Toggle */}
            <motion.button
              onClick={toggleLang}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-2 mr-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-full text-white text-xs font-bold uppercase tracking-wide hover:bg-white/10 transition-all"
            >
              <Globe className="w-4 h-4" />
              <span className={lang === "th" ? "text-[#4EDEA3]" : "text-gray-500"}>
                TH
              </span>
              <span className="text-gray-600">|</span>
              <span className={lang === "en" ? "text-[#4EDEA3]" : "text-gray-500"}>
                EN
              </span>
            </motion.button>

            <div className="w-8 h-8 bg-gradient-to-br from-[#4EDEA3] to-[#3DC992] rounded-lg flex items-center justify-center">
              <svg
                width="16"
                height="16"
                fill="none"
                viewBox="0 0 24 24"
                stroke="#fff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3v18h18" />
                <path d="M7 16l4-6 4 4 4-8" />
              </svg>
            </div>
            <span className="text-white font-bold tracking-wide">FinTrack</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#ADC6FF]/10 border border-[#ADC6FF]/20 rounded-full mb-6">
              <Shield className="w-4 h-4 text-[#ADC6FF]" />
              <span className="text-sm text-[#ADC6FF] font-semibold">{t.privacy}</span>
            </div>
            <h1 className="text-4xl font-black text-white mb-4">{t.privacyPolicy}</h1>
            <p className="text-gray-500">
              {t.lastUpdated}: {lang === "th" ? "11 เมษายน 2568" : "April 11, 2025"}
            </p>
          </div>

          <div className="space-y-8">
            {/* Introduction */}
            <div className="bg-gradient-to-r from-[#4EDEA3]/5 to-[#ADC6FF]/5 rounded-2xl p-8 border border-white/5">
              <p className="text-gray-300 leading-relaxed">{t.introText}</p>
            </div>

            {/* Section 1 */}
            <section className="bg-[#1C1B1B] rounded-2xl p-8 border border-white/5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 bg-[#ADC6FF]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Eye className="w-5 h-5 text-[#ADC6FF]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">{t.infoWeCollect}</h2>
                  <p className="text-gray-400 leading-relaxed mb-4">{t.infoWeCollectDesc}</p>
                  <ul className="list-disc list-inside text-gray-400 space-y-2">
                    <li><strong className="text-white">{t.accountInfo}:</strong> {t.accountInfoDesc}</li>
                    <li><strong className="text-white">{t.financialData}:</strong> {t.financialDataDesc}</li>
                    <li><strong className="text-white">{t.usageData}:</strong> {t.usageDataDesc}</li>
                    <li><strong className="text-white">{t.deviceInfo}:</strong> {t.deviceInfoDesc}</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 2 */}
            <section className="bg-[#1C1B1B] rounded-2xl p-8 border border-white/5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 bg-[#ADC6FF]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Database className="w-5 h-5 text-[#ADC6FF]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">{t.howWeUse}</h2>
                  <p className="text-gray-400 leading-relaxed mb-4">{t.howWeUseDesc}</p>
                  <ul className="list-disc list-inside text-gray-400 space-y-2">
                    <li>{t.use1}</li>
                    <li>{t.use2}</li>
                    <li>{t.use3}</li>
                    <li>{t.use4}</li>
                    <li>{t.use5}</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 3 */}
            <section className="bg-[#1C1B1B] rounded-2xl p-8 border border-white/5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 bg-[#ADC6FF]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Lock className="w-5 h-5 text-[#ADC6FF]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">{t.dataSecurity}</h2>
                  <p className="text-gray-400 leading-relaxed">
                    {t.dataSecurityDesc}
                  </p>
                  <ul className="list-disc list-inside text-gray-400 space-y-2 mt-4">
                    <li>{t.security1}</li>
                    <li>{t.security2}</li>
                    <li>{t.security3}</li>
                    <li>{t.security4}</li>
                    <li>{t.security5}</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 4 */}
            <section className="bg-[#1C1B1B] rounded-2xl p-8 border border-white/5">
              <h2 className="text-xl font-bold text-white mb-4">{t.dataSharing}</h2>
              <p className="text-gray-400 leading-relaxed">{t.dataSharingDesc}</p>
            </section>

            {/* Section 5 */}
            <section className="bg-[#1C1B1B] rounded-2xl p-8 border border-white/5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 bg-[#ADC6FF]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-5 h-5 text-[#ADC6FF]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">{t.yourRights}</h2>
                  <p className="text-gray-400 leading-relaxed mb-4">{t.yourRightsDesc}</p>
                  <ul className="list-disc list-inside text-gray-400 space-y-2">
                    <li>{t.right1}</li>
                    <li>{t.right2}</li>
                    <li>{t.right3}</li>
                    <li>{t.right4}</li>
                    <li>{t.right5}</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 6 */}
            <section className="bg-[#1C1B1B] rounded-2xl p-8 border border-white/5">
              <h2 className="text-xl font-bold text-white mb-4">{t.cookiePolicy}</h2>
              <p className="text-gray-400 leading-relaxed">{t.cookiePolicyDesc}</p>
            </section>

            {/* Section 7 */}
            <section className="bg-[#1C1B1B] rounded-2xl p-8 border border-white/5">
              <h2 className="text-xl font-bold text-white mb-4">{t.changes}</h2>
              <p className="text-gray-400 leading-relaxed">{t.changesDesc}</p>
            </section>

            {/* Section 8 */}
            <section className="bg-[#1C1B1B] rounded-2xl p-8 border border-white/5">
              <h2 className="text-xl font-bold text-white mb-4">{t.contact}</h2>
              <p className="text-gray-400 leading-relaxed">
                {t.contactDesc}{" "}
                <a href="mailto:privacy@fintrack.com" className="text-[#ADC6FF] hover:underline">
                  privacy@fintrack.com
                </a>
              </p>
            </section>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-white/5 text-center">
            <p className="text-gray-500 text-sm">
              © 2025 FinTrack. {t.allRightsReserved}. |{" "}
              <Link href="/terms-of-service" className="text-[#ADC6FF] hover:underline">
                {t.termsOfService}
              </Link>
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
