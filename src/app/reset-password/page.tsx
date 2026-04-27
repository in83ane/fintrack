"use client";

import React, { useState, useEffect, Suspense } from "react";
import { motion } from "motion/react";
import { Lock, CheckCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useApp } from "@/src/context/AppContext";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/src/lib/env";

function ResetPasswordContent() {
  const router = useRouter();
  const { language: lang } = useApp();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const t = {
    th: {
      title: "ตั้งรหัสผ่านใหม่",
      description: "กรุณากรอกรหัสผ่านใหม่ของคุณ",
      password: "รหัสผ่านใหม่",
      confirmPassword: "ยืนยันรหัสผ่านใหม่",
      submit: "เปลี่ยนรหัสผ่าน",
      success: "เปลี่ยนรหัสผ่านสำเร็จ กำลังพากลับไปหน้าเข้าสู่ระบบ...",
      errorMatch: "รหัสผ่านไม่ตรงกัน",
      errorLength: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร",
      errorServer: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
    },
    en: {
      title: "Reset Password",
      description: "Please enter your new password",
      password: "New Password",
      confirmPassword: "Confirm New Password",
      submit: "Update Password",
      success: "Password updated successfully. Redirecting to login...",
      errorMatch: "Passwords do not match",
      errorLength: "Password must be at least 8 characters",
      errorServer: "An error occurred. Please try again.",
    },
  }[lang];

  useEffect(() => {
    // Supabase handles the recovery token implicitly in the URL hash,
    // so we need to set the session client-side if it exists in the hash.
    const handleRecovery = async () => {
      if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
        const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Error getting recovery session:", error);
        }
      }
    };
    handleRecovery();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t.errorLength);
      return;
    }

    if (password !== confirmPassword) {
      setError(t.errorMatch);
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());
      
      // Hash password client-side if we use the same hashing logic as login (Optional, check how login handles it)
      // Since login hashes the password before sending to Supabase, we should probably hash it here too.
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashedPassword = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      const { error: updateError } = await supabase.auth.updateUser({
        password: hashedPassword,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch (err) {
      console.error("Error updating password:", err);
      setError(t.errorServer);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-600/10 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-[#111111]/80 backdrop-blur-xl rounded-3xl border border-white/10 p-8 shadow-2xl relative z-10"
      >
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-6 ring-1 ring-white/10 shadow-inner">
            <Lock className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">{t.title}</h1>
          <p className="text-gray-400">{t.description}</p>
        </div>

        {success ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3"
          >
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <p className="text-emerald-400 text-sm">{t.success}</p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl"
              >
                <p className="text-red-400 text-sm text-center">{error}</p>
              </motion.div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 ml-1">
                  {t.password}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-black/50 border border-white/10 rounded-2xl text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-300"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 ml-1">
                  {t.confirmPassword}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-black/50 border border-white/10 rounded-2xl text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-300"
                    required
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white rounded-2xl font-medium transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/25 active:translate-y-0 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : t.submit}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
