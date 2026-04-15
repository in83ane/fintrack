"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Shield, FileText, Scale, Lock, Globe } from "lucide-react";
import Link from "next/link";

// Translations
interface Translations {
  th: {
    backToLogin: string;
    legal: string;
    termsOfService: string;
    lastUpdated: string;
    acceptanceOfTerms: string;
    acceptanceDesc: string;
    userAccounts: string;
    userAccountsDesc: string;
    accountReq1: string;
    accountReq2: string;
    accountReq3: string;
    dataSecurity: string;
    dataSecurityDesc: string;
    limitationsOfLiability: string;
    limitationsDesc: string;
    changesToTerms: string;
    changesDesc: string;
    contactUs: string;
    contactDesc: string;
    allRightsReserved: string;
    and: string;
    privacyPolicy: string;
  };
  en: {
    backToLogin: string;
    legal: string;
    termsOfService: string;
    lastUpdated: string;
    acceptanceOfTerms: string;
    acceptanceDesc: string;
    userAccounts: string;
    userAccountsDesc: string;
    accountReq1: string;
    accountReq2: string;
    accountReq3: string;
    dataSecurity: string;
    dataSecurityDesc: string;
    limitationsOfLiability: string;
    limitationsDesc: string;
    changesToTerms: string;
    changesDesc: string;
    contactUs: string;
    contactDesc: string;
    allRightsReserved: string;
    and: string;
    privacyPolicy: string;
  };
}

const translations: Translations = {
  th: {
    backToLogin: "กลับไปหน้าเข้าสู่ระบบ",
    legal: "กฎหมาย",
    termsOfService: "ข้อกำหนดการใช้งาน",
    lastUpdated: "อัปเดตล่าสุด",
    acceptanceOfTerms: "1. การยอมรับข้อกำหนด",
    acceptanceDesc:
      "การเข้าถึงหรือใช้งาน FinTrack ถือว่าคุณยอมรับที่จะผูกพันตามข้อกำหนดการใช้งานเหล่านี้ หากคุณไม่เห็นด้วยกับข้อใดข้อหนึ่งในข้อกำหนด คุณอาจไม่เข้าถึงบริการได้ ข้อกำหนดเหล่านี้มีผลบังคับใช้กับผู้ใช้ทุกคน รวมถึงผู้เยี่ยมชม ผู้ใช้ที่ลงทะเบียน และผู้มีส่วนร่วม",
    userAccounts: "2. บัญชีผู้ใช้",
    userAccountsDesc:
      "เมื่อคุณสร้างบัญชีกับเรา คุณต้องให้ข้อมูลที่ถูกต้อง ครบถ้วน และเป็นปัจจุบันเสมอ หากไม่ทำตามถือเป็นการละเมิดข้อกำหนด ซึ่งอาจส่งผลให้ยุติบัญชีของคุณทันที",
    accountReq1: "คุณมีหน้าที่รักษาความปลอดภัยรหัสผ่านที่คุณใช้",
    accountReq2: "คุณตกลงที่จะไม่เปิดเผยรหัสผ่านของคุณแก่บุคคลที่สาม",
    accountReq3: "คุณต้องแจ้งให้เราทราบทันทีที่ทราบถึงการละเมิดความปลอดภัยใดๆ",
    dataSecurity: "3. ความปลอดภัยของข้อมูล",
    dataSecurityDesc:
      "เราให้ความสำคัญกับความปลอดภัยของข้อมูลทางการเงินของคุณ ข้อมูลทั้งหมดที่ส่งระหว่างอุปกรณ์ของคุณและเซิร์ฟเวอร์ของเราถูกเข้ารหัสด้วยการเข้ารหัส TLS ตามมาตรฐานอุตสาหกรรม เราไม่เก็บข้อมูลประจำตัวธนาคารของคุณ และเราไม่ขายข้อมูลส่วนบุคคลของคุณให้แก่บุคคลที่สาม",
    limitationsOfLiability: "4. ข้อจำกัดความรับผิดชอบ",
    limitationsDesc:
      "FinTrack ให้เครื่องมือติดตามทางการเงินเพื่อวัตถุประสงค์ในการให้ข้อมูลเท่านั้น เราไม่ให้คำแนะนำทางการเงิน และคุณควรปรึกษากับผู้เชี่ยวชาญที่มีคุณสมบัติเหมาะสมก่อนตัดสินใจลงทุน เราไม่รับผิดชอบต่อความสูญเสียใดๆ ที่เกิดจากการใช้บริการของคุณ",
    changesToTerms: "5. การเปลี่ยนแปลงข้อกำหนด",
    changesDesc:
      "เราขอสงวนสิทธิ์ในการแก้ไขหรือเปลี่ยนแปลงข้อกำหนดเหล่านี้ได้ตลอดเวลา หากมีการแก้ไขที่สำคัญ เราจะพยายามแจ้งให้ทราบล่วงหน้าอย่างน้อย 30 วันก่อนที่เงื่อนไขใหม่จะมีผลบังคับใช้ สิ่งที่ถือว่าเป็นการเปลี่ยนแปลงที่สำคัญจะถูกพิจารณาตามดุลยพินิษของเรา",
    contactUs: "6. ติดต่อเรา",
    contactDesc: "หากคุณมีคำถามใดๆ เกี่ยวกับข้อกำหนดเหล่านี้ โปรดติดต่อเราที่",
    allRightsReserved: "สงวนลิขสิทธิ์",
    and: "และ",
    privacyPolicy: "นโยบายความเป็นส่วนตัว",
  },
  en: {
    backToLogin: "Back to Login",
    legal: "Legal",
    termsOfService: "Terms of Service",
    lastUpdated: "Last updated",
    acceptanceOfTerms: "1. Acceptance of Terms",
    acceptanceDesc:
      "By accessing or using FinTrack, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the service. These terms apply to all users, including visitors, registered users, and contributors.",
    userAccounts: "2. User Accounts",
    userAccountsDesc:
      "When you create an account with us, you must provide accurate, complete, and current information at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account.",
    accountReq1: "You are responsible for safeguarding the password you use",
    accountReq2: "You agree not to disclose your password to any third party",
    accountReq3: "You must notify us immediately upon becoming aware of any breach of security",
    dataSecurity: "3. Data Security",
    dataSecurityDesc:
      "We take the security of your financial data seriously. All data transmitted between your device and our servers is encrypted using industry-standard TLS encryption. We do not store your banking credentials, and we never sell your personal data to third parties.",
    limitationsOfLiability: "4. Limitations of Liability",
    limitationsDesc:
      "FinTrack provides financial tracking tools for informational purposes only. We do not provide financial advice, and you should consult with qualified professionals before making investment decisions. We are not liable for any losses resulting from your use of the service.",
    changesToTerms: "5. Changes to Terms",
    changesDesc:
      "We reserve the right to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.",
    contactUs: "6. Contact Us",
    contactDesc: "If you have any questions about these Terms, please contact us at",
    allRightsReserved: "All rights reserved",
    and: "and",
    privacyPolicy: "Privacy Policy",
  },
};

export default function TermsOfServicePage() {
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
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#4EDEA3]/10 border border-[#4EDEA3]/20 rounded-full mb-6">
              <Scale className="w-4 h-4 text-[#4EDEA3]" />
              <span className="text-sm text-[#4EDEA3] font-semibold">{t.legal}</span>
            </div>
            <h1 className="text-4xl font-black text-white mb-4">{t.termsOfService}</h1>
            <p className="text-gray-500">
              {t.lastUpdated}: {lang === "th" ? "11 เมษายน 2568" : "April 11, 2025"}
            </p>
          </div>

          <div className="space-y-8">
            {/* Section 1 */}
            <section className="bg-[#1C1B1B] rounded-2xl p-8 border border-white/5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 bg-[#4EDEA3]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-[#4EDEA3]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">{t.acceptanceOfTerms}</h2>
                  <p className="text-gray-400 leading-relaxed">{t.acceptanceDesc}</p>
                </div>
              </div>
            </section>

            {/* Section 2 */}
            <section className="bg-[#1C1B1B] rounded-2xl p-8 border border-white/5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 bg-[#4EDEA3]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-[#4EDEA3]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">{t.userAccounts}</h2>
                  <p className="text-gray-400 leading-relaxed mb-4">{t.userAccountsDesc}</p>
                  <ul className="list-disc list-inside text-gray-400 space-y-2">
                    <li>{t.accountReq1}</li>
                    <li>{t.accountReq2}</li>
                    <li>{t.accountReq3}</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 3 */}
            <section className="bg-[#1C1B1B] rounded-2xl p-8 border border-white/5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 bg-[#4EDEA3]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Lock className="w-5 h-5 text-[#4EDEA3]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">{t.dataSecurity}</h2>
                  <p className="text-gray-400 leading-relaxed">{t.dataSecurityDesc}</p>
                </div>
              </div>
            </section>

            {/* Section 4 */}
            <section className="bg-[#1C1B1B] rounded-2xl p-8 border border-white/5">
              <h2 className="text-xl font-bold text-white mb-4">{t.limitationsOfLiability}</h2>
              <p className="text-gray-400 leading-relaxed">{t.limitationsDesc}</p>
            </section>

            {/* Section 5 */}
            <section className="bg-[#1C1B1B] rounded-2xl p-8 border border-white/5">
              <h2 className="text-xl font-bold text-white mb-4">{t.changesToTerms}</h2>
              <p className="text-gray-400 leading-relaxed">{t.changesDesc}</p>
            </section>

            {/* Section 6 */}
            <section className="bg-[#1C1B1B] rounded-2xl p-8 border border-white/5">
              <h2 className="text-xl font-bold text-white mb-4">{t.contactUs}</h2>
              <p className="text-gray-400 leading-relaxed">
                {t.contactDesc}{" "}
                <a href="mailto:legal@fintrack.com" className="text-[#4EDEA3] hover:underline">
                  legal@fintrack.com
                </a>
              </p>
            </section>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-white/5 text-center">
            <p className="text-gray-500 text-sm">
              © 2025 FinTrack. {t.allRightsReserved}. |{" "}
              <Link href="/privacy-policy" className="text-[#4EDEA3] hover:underline">
                {t.privacyPolicy}
              </Link>
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
