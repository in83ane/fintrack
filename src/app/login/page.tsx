"use client";

import React, { Suspense, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowLeft,
  CheckCircle,
  Check,
  X,
  Shield,
  Loader2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signInAction,
  signUpAction,
  forgotPasswordAction,
  initiateGoogleAuth,
  getCSRFToken,
  setSessionAction,
  type ActionResult,
} from "./actions";
import { useApp } from "@/src/context/AppContext";

// ─── Security Utilities ───────────────────────────────────────────────────

/**
 * XSS Prevention: Escape HTML special characters
 * This prevents XSS attacks when displaying user input
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Security: Hash password client-side before sending
 * This adds an extra layer of security - server never sees raw password
 * Note: This is in addition to HTTPS, not a replacement
 */
async function hashPassword(password: string): Promise<string> {
  // Use SubtleCrypto for client-side password hashing
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Security: Generate cryptographically secure random string
 * Used for nonce and other security tokens
 */
function generateSecureRandom(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Security: Validate password strength on client (defense in depth)
 */
function validatePasswordStrength(password: string): boolean {
  const minLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  return minLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;
}

/**
 * Security: Add exponential backoff for failed attempts
 * This slows down brute force attacks
 */
function getBackoffDelay(attemptCount: number): number {
  // Exponential backoff: 2^attempt * 1000ms, capped at 30 seconds
  return Math.min(Math.pow(2, attemptCount) * 1000, 30000);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TranslationKeys {
  login: string;
  register: string;
  welcomeBack: string;
  createAccount: string;
  email: string;
  password: string;
  confirmPassword: string;
  forgotPassword: string;
  rememberMe: string;
  orContinueWith: string;
  signInWithGoogle: string;
  noAccount: string;
  hasAccount: string;
  registerNow: string;
  loginNow: string;
  emailPlaceholder: string;
  passwordPlaceholder: string;
  confirmPasswordPlaceholder: string;
  errorRequired: string;
  errorInvalidEmail: string;
  errorPasswordMatch: string;
  errorAuth: string;
  errorGoogle: string;
  successCheckEmail: string;
  passwordResetSent: string;
  termsText: string;
  termsLink: string;
  privacyLink: string;
  and: string;
  showPassword: string;
  hidePassword: string;
  secureConnection: string;
  passwordRequirements: string;
  minLength: string;
  hasUppercase: string;
  hasLowercase: string;
  hasNumber: string;
  hasSpecial: string;
  back: string;
  resetPassword: string;
  resetDescription: string;
  sendResetLink: string;
  veryWeak: string;
  weak: string;
  fair: string;
  good: string;
  strong: string;
  accountLocked: string;
  accountLockedDesc: string;
  rateLimitError: string;
  csrfError: string;
  serverError: string;
  passwordsMatch: string;
}

interface Translations {
  th: TranslationKeys;
  en: TranslationKeys;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_FAILED_ATTEMPTS = process.env.NODE_ENV === "development" ? 500 : 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const translations: Translations = {
  th: {
    login: "เข้าสู่ระบบ",
    register: "สมัครสมาชิก",
    welcomeBack: "ยินดีต้อนรับกลับมา",
    createAccount: "สร้างบัญชีใหม่",
    email: "อีเมล",
    password: "รหัสผ่าน",
    confirmPassword: "ยืนยันรหัสผ่าน",
    forgotPassword: "ลืมรหัสผ่าน?",
    rememberMe: "จดจำฉันไว้",
    orContinueWith: "หรือดำเนินการต่อด้วย",
    signInWithGoogle: "เข้าสู่ระบบด้วย Google",
    noAccount: "ยังไม่มีบัญชี?",
    hasAccount: "มีบัญชีอยู่แล้ว?",
    registerNow: "สมัครสมาชิก",
    loginNow: "เข้าสู่ระบบ",
    emailPlaceholder: "your@email.com",
    passwordPlaceholder: "รหัสผ่านของคุณ",
    confirmPasswordPlaceholder: "กรอกรหัสผ่านอีกครั้ง",
    errorRequired: "กรุณากรอกข้อมูลให้ครบถ้วน",
    errorInvalidEmail: "รูปแบบอีเมลไม่ถูกต้อง",
    errorPasswordMatch: "รหัสผ่านไม่ตรงกัน",
    errorAuth: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    errorGoogle: "ไม่สามารถเข้าสู่ระบบด้วย Google ได้",
    successCheckEmail: "กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี",
    passwordResetSent: "หากอีเมลนี้มีในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้",
    termsText: "การใช้งานถือว่าคุณยอมรับ",
    termsLink: "ข้อกำหนดการใช้งาน",
    privacyLink: "นโยบายความเป็นส่วนตัว",
    and: "และ",
    showPassword: "แสดงรหัสผ่าน",
    hidePassword: "ซ่อนรหัสผ่าน",
    secureConnection: "การเชื่อมต่อที่ปลอดภัย",
    passwordRequirements: "ความปลอดภัยของรหัสผ่าน",
    minLength: "อย่างน้อย 8 ตัวอักษร",
    hasUppercase: "ตัวพิมพ์ใหญ่ (A-Z)",
    hasLowercase: "ตัวพิมพ์เล็ก (a-z)",
    hasNumber: "ตัวเลข (0-9)",
    hasSpecial: "อักขระพิเศษ (!@#$%)",
    back: "กลับ",
    resetPassword: "รีเซ็ตรหัสผ่าน",
    resetDescription: "กรอกอีเมลเพื่อรับลิงก์รีเซ็ตรหัสผ่าน",
    sendResetLink: "ส่งลิงก์รีเซ็ต",
    veryWeak: "ต่ำมาก",
    weak: "ไม่ปลอดภัย",
    fair: "พอใช้",
    good: "ดี",
    strong: "แข็งแรง",
    accountLocked: "บัญชีถูกล็อกชั่วคราว",
    accountLockedDesc: "มีการพยายามเข้าสู่ระบบไม่สำเร็จหลายครั้ง กรุณาลองใหม่ภายหลัง",
    rateLimitError: "กรุณารอสักครู่ก่อนลองใหม่",
    csrfError: "การยืนยันความปลอดภัยล้มเหลว กรุณารีเฟรชหน้า",
    serverError: "เกิดข้อผิดพลาด กรุณาลองใหม่ภายหลัง",
    passwordsMatch: "รหัสผ่านตรงกัน",
  },
  en: {
    login: "Sign In",
    register: "Sign Up",
    welcomeBack: "Welcome Back",
    createAccount: "Create Account",
    email: "Email",
    password: "Password",
    confirmPassword: "Confirm Password",
    forgotPassword: "Forgot password?",
    rememberMe: "Remember me",
    orContinueWith: "Or continue with",
    signInWithGoogle: "Continue with Google",
    noAccount: "Don't have an account?",
    hasAccount: "Already have an account?",
    registerNow: "Sign up",
    loginNow: "Sign in",
    emailPlaceholder: "your@email.com",
    passwordPlaceholder: "Your password",
    confirmPasswordPlaceholder: "Re-enter your password",
    errorRequired: "Please fill in all fields",
    errorInvalidEmail: "Invalid email format",
    errorPasswordMatch: "Passwords do not match",
    errorAuth: "Invalid email or password",
    errorGoogle: "Failed to sign in with Google",
    successCheckEmail: "Please check your email to confirm",
    passwordResetSent: "If this email exists, we'll send a reset link",
    termsText: "By continuing, you agree to our",
    termsLink: "Terms of Service",
    privacyLink: "Privacy Policy",
    and: "and",
    showPassword: "Show password",
    hidePassword: "Hide password",
    secureConnection: "Secure connection",
    passwordRequirements: "Password Requirements",
    minLength: "At least 8 characters",
    hasUppercase: "Uppercase letter (A-Z)",
    hasLowercase: "Lowercase letter (a-z)",
    hasNumber: "Number (0-9)",
    hasSpecial: "Special character (!@#$%)",
    back: "Back",
    resetPassword: "Reset Password",
    resetDescription: "Enter your email to receive a reset link",
    sendResetLink: "Send Reset Link",
    veryWeak: "Very Weak",
    weak: "Weak",
    fair: "Fair",
    good: "Good",
    strong: "Strong",
    accountLocked: "Account temporarily locked",
    accountLockedDesc: "Multiple failed attempts detected. Please try again later.",
    rateLimitError: "Please wait before trying again",
    csrfError: "Security verification failed. Please refresh the page",
    serverError: "An error occurred. Please try again later",
    passwordsMatch: "Passwords match",
  },
};

// ─── Animation Variants ───────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 120, damping: 15 },
  },
};

// ─── Helper Functions ───────────────────────────────────────────────────────

interface PasswordStrength {
  score: number;
  checks: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
}

function checkPasswordStrength(password: string): PasswordStrength {
  const checks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;
  return { score, checks };
}

const STRENGTH_COLORS = ["#EF4444", "#EF4444", "#F97316", "#EAB308", "#22C55E", "#4EDEA3"];

function getStrengthColor(score: number): string {
  return STRENGTH_COLORS[Math.min(score, 5)];
}

function getStrengthLabel(score: number, t: TranslationKeys): string {
  const labels = [t.veryWeak, t.weak, t.fair, t.fair, t.good, t.strong];
  return labels[Math.min(score, 5)];
}

// Security: Get CSRF token from cookie (httpOnly cookie cannot be read by JS)
// This function checks for non-httpOnly fallback cookie
function getCSRFTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  try {
    return (
      document.cookie
        .split("; ")
        .find((row) => row.startsWith("csrf-token="))
        ?.split("=")[1] || null
    );
  } catch {
    return null;
  }
}

// Security: Generate device fingerprint using Web Crypto API
async function generateDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "";

  const components = [
    window.screen.width,
    window.screen.height,
    window.screen.colorDepth,
    window.screen.pixelDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    navigator.languages?.join(","),
    navigator.platform,
    navigator.hardwareConcurrency,
    navigator.maxTouchPoints,
    // @ts-expect-error - deviceMemory is not in standard types
    typeof navigator.deviceMemory !== "undefined" ? navigator.deviceMemory : "",
  ].join("|");

  // Use Web Crypto API for secure hashing
  const encoder = new TextEncoder();
  const data = encoder.encode(components);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// Security: Failed attempts tracking
function recordFailedAttempt(): number {
  const attempts = parseInt(sessionStorage.getItem("failed-login-attempts") || "0", 10) + 1;
  sessionStorage.setItem("failed-login-attempts", String(attempts));
  sessionStorage.setItem("last-failed-attempt", Date.now().toString());
  return attempts;
}

function clearFailedAttempts(): void {
  sessionStorage.removeItem("failed-login-attempts");
  sessionStorage.removeItem("last-failed-attempt");
}

function isAccountLocked(): boolean {
  const attempts = parseInt(sessionStorage.getItem("failed-login-attempts") || "0", 10);
  const lastAttempt = parseInt(sessionStorage.getItem("last-failed-attempt") || "0", 10);
  return attempts >= MAX_FAILED_ATTEMPTS && Date.now() - lastAttempt < LOCKOUT_DURATION_MS;
}

function getLockoutTimeRemaining(): number {
  const lastAttempt = parseInt(sessionStorage.getItem("last-failed-attempt") || "0", 10);
  return Math.max(0, LOCKOUT_DURATION_MS - (Date.now() - lastAttempt));
}

// ─── Main Component ──────────────────────────────────────────────────────────

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isRegister, setIsRegister] = useState(searchParams.get("mode") === "register");
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { language: lang, setLanguage: setLang, setUserProfile } = useApp();
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showPasswordStrength, setShowPasswordStrength] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  // Security states
  const [accountLocked, setAccountLocked] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState(0);
  const [deviceFingerprint, setDeviceFingerprint] = useState("");
  const [securityNonce, setSecurityNonce] = useState("");
  const [lastSubmitTime, setLastSubmitTime] = useState(0);

  // Honeypot field (invisible to users, bots will fill it)
  const [honeypot, setHoneypot] = useState("");

  // Field errors
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const t = translations[lang];
  const passwordStrength = checkPasswordStrength(password);

  // Initialize
  useEffect(() => {
    const initSecurity = async () => {

      // Generate secure device fingerprint
      const fingerprint = await generateDeviceFingerprint();
      setDeviceFingerprint(fingerprint);

      // Generate security nonce for this session
      setSecurityNonce(generateSecureRandom(16));

      // Check for remembered email (not password for security)
      const rememberedEmail = localStorage.getItem("remembered-email");
      if (rememberedEmail) {
        // Validate email format before setting
        if (validateEmail(rememberedEmail)) {
          setEmail(rememberedEmail);
          setRememberMe(true);
        } else {
          // Invalid stored email, remove it
          localStorage.removeItem("remembered-email");
        }
      }

      // Check account lockout status
      const checkLockout = () => {
        if (isAccountLocked()) {
          setAccountLocked(true);
          setLockoutTimer(Math.ceil(getLockoutTimeRemaining() / 1000));
        }
      };
      checkLockout();

      // Set up visibility change listener to clear sensitive data when tab is hidden
      const handleVisibilityChange = () => {
        if (document.hidden) {
          // Clear password from memory when tab is not visible
          setPassword("");
          setConfirmPassword("");
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    };

    initSecurity();

    // Handle Implicit Grant Flow tokens embedded in the hash (e.g. from Supabase OAuth/Google)
    // This MUST run before checking query params errors, as OAuth may return tokens in hash
    // even when there are errors in query params (e.g. state validation issues that we can ignore)
    if (typeof window !== "undefined" && window.location.hash.includes("access_token=")) {
      // Clear any query params errors since we have a valid token in hash
      // Remove error from URL without reloading
      if (window.location.search) {
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, "", cleanUrl);
      }

      // Small delay to ensure UI mounts and doesn't flicker randomly
      setTimeout(() => {
        setLoading(true);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken) {
          setSessionAction(accessToken, refreshToken || undefined).then((res) => {
            if (res.success) {
              // Clear fragment and navigate out securely
              window.location.hash = "";
              router.push("/dashboard");
              router.refresh();
            } else {
              setLoading(false);
              setError("Session initialization failed. " + (res.error || ""));
            }
          });
        }
      }, 500);
    }

    const interval = setInterval(() => {
      if (isAccountLocked()) {
        setLockoutTimer(Math.ceil(getLockoutTimeRemaining() / 1000));
      } else {
        setAccountLocked(false);
        setLockoutTimer(0);
        clearFailedAttempts();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Fetch fresh CSRF token from server
  const refreshCSRFToken = useCallback(async () => {
    try {
      const token = await getCSRFToken();
      setCsrfToken(token);
      return token;
    } catch {
      return getCSRFTokenFromCookie();
    }
  }, []);

  // Get initial CSRF token
  useEffect(() => {
    const initCSRF = async () => {
      const token = getCSRFTokenFromCookie();
      if (token) {
        setCsrfToken(token);
      } else {
        await refreshCSRFToken();
      }
    };
    initCSRF();
  }, [refreshCSRFToken]);

  // Update mode based on search params
  useEffect(() => {
    setIsRegister(searchParams.get("mode") === "register");
  }, [searchParams]);

  // Validation
  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validateForm = useCallback(() => {
    const errors: { email?: string; password?: string; confirmPassword?: string } = {};
    let isValid = true;

    if (!email.trim()) {
      errors.email = t.errorRequired;
      isValid = false;
    } else if (!validateEmail(email)) {
      errors.email = t.errorInvalidEmail;
      isValid = false;
    }

    if (!password) {
      errors.password = t.errorRequired;
      isValid = false;
    } else if (isRegister && passwordStrength.score < 4) {
      errors.password = t.passwordRequirements;
      isValid = false;
    }

    if (isRegister && password !== confirmPassword) {
      errors.confirmPassword = t.errorPasswordMatch;
      isValid = false;
    }

    setFieldErrors(errors);
    return isValid;
  }, [email, password, confirmPassword, isRegister, t, passwordStrength.score]);

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  // Handle email/password auth with enhanced security
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setError(null);
    setErrorCode(null);

    // Security: Timing check - ensure form wasn't filled too fast
    const now = Date.now();
    const timeSinceLastSubmit = now - lastSubmitTime;
    if (lastSubmitTime > 0 && timeSinceLastSubmit < 500) {
      // Form submitted completely instantly (double click prevention)
      return;
    }
    setLastSubmitTime(now);

    // Security: Check account lockout
    if (accountLocked || isAccountLocked()) {
      setError(t.accountLockedDesc);
      return;
    }

    if (!validateForm()) return;

    // Security: Additional password validation for registration
    if (isRegister && !validatePasswordStrength(password)) {
      setError(t.passwordRequirements);
      return;
    }

    // Get CSRF token
    let token = csrfToken || getCSRFTokenFromCookie();
    if (!token) {
      token = await refreshCSRFToken();
    }

    if (!token) {
      setError(t.csrfError);
      return;
    }

    // Security: Apply backoff delay based on failed attempts
    const attempts = parseInt(sessionStorage.getItem("failed-login-attempts") || "0", 10);
    if (attempts > 0) {
      await new Promise((resolve) => setTimeout(resolve, getBackoffDelay(attempts)));
    }

    setLoading(true);

    try {
      // Security: Hash password client-side before sending
      // This ensures server never sees raw password (defense in depth with HTTPS)
      const hashedPassword = await hashPassword(password);
      const hashedConfirmPassword = isRegister ? await hashPassword(confirmPassword) : "";

      let result: ActionResult;

      if (isRegister) {
        // Registration
        result = await signUpAction({
          email: email.trim().toLowerCase(),
          password: hashedPassword,
          confirmPassword: hashedConfirmPassword,
          csrfToken: token,
          honeypot,
          deviceFingerprint,
          securityNonce,
          lang,
        });
      } else {
        // Login
        result = await signInAction({
          email: email.trim().toLowerCase(),
          password: hashedPassword,
          csrfToken: token,
          honeypot,
          rememberMe,
          deviceFingerprint,
          securityNonce,
          lang,
        });
      }

      if (!result.success) {
        // Security: Track failed attempts
        if (!isRegister) {
          const attempts = recordFailedAttempt();
          if (attempts >= MAX_FAILED_ATTEMPTS) {
            setAccountLocked(true);
            setLockoutTimer(Math.ceil(LOCKOUT_DURATION_MS / 1000));
          }
        }

        // Handle rate limiting
        if (result.rateLimitInfo?.blocked) {
          setAccountLocked(true);
          setLockoutTimer(Math.ceil((result.rateLimitInfo.resetTime - Date.now()) / 1000));
        }

        setError(result.error || t.errorAuth);
        if (result.errorCode) setErrorCode(result.errorCode);
      } else {
        // Success
        clearFailedAttempts();

        // Security: Regenerate CSRF token after successful login
        await refreshCSRFToken();

        // Remember email if requested (validate first)
        if (rememberMe && !isRegister && validateEmail(email)) {
          localStorage.setItem("remembered-email", email.trim().toLowerCase());
        } else {
          localStorage.removeItem("remembered-email");
        }

        if (isRegister) {
          setSuccess(result.message || t.successCheckEmail);
          // Clear password immediately for security
          setPassword("");
          setConfirmPassword("");
        } else {
          // Security: Clear sensitive data before redirect
          setPassword("");
          setConfirmPassword("");
          setCsrfToken(null);

          // Update user profile with actual email from server response
          const userEmail = result.email || email.trim().toLowerCase();
          const initials = userEmail.substring(0, 2).toUpperCase();
          localStorage.setItem("remembered-email", userEmail);
          setUserProfile({
            email: userEmail,
            initials,
            avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${userEmail}&backgroundColor=1C1B1B`,
          });

          // Login success - redirect
          const returnUrl = searchParams.get("returnUrl") || "/dashboard";
          // Validate returnUrl to prevent open redirect
          const validReturnUrl = validateReturnUrl(returnUrl);
          router.push(validReturnUrl);
          router.refresh();
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(t.serverError);
      setErrorCode(`CLIENT_EXCEPTION: ${errorMessage}`);
    } finally {
      setLoading(false);
      // Security: Clear password from memory
      setPassword("");
      setConfirmPassword("");
    }
  };

  /**
   * Security: Validate return URL to prevent open redirect attacks
   */
  function validateReturnUrl(url: string): string {
    // Only allow relative URLs or URLs from same origin
    if (url.startsWith("/") && !url.startsWith("//")) {
      return url;
    }
    // Reject absolute URLs
    return "/dashboard";
  }

  // Handle Google OAuth with security checks
  const handleGoogleLogin = async () => {
    setError(null);
    setErrorCode(null);
    setLoading(true);

    // Security: Check account lockout
    if (accountLocked || isAccountLocked()) {
      setError(t.accountLockedDesc);
      setLoading(false);
      return;
    }

    // Security: Timing check
    const now = Date.now();
    const timeSinceLastSubmit = now - lastSubmitTime;
    if (lastSubmitTime > 0 && timeSinceLastSubmit < 1000) {
      setError(t.rateLimitError);
      setLoading(false);
      return;
    }
    setLastSubmitTime(now);

    // Get CSRF token
    let token = csrfToken || getCSRFTokenFromCookie();
    if (!token) {
      token = await refreshCSRFToken();
    }

    if (!token) {
      setError(t.csrfError);
      setLoading(false);
      return;
    }

    try {
      const result = await initiateGoogleAuth({
        csrfToken: token,
        deviceFingerprint,
        securityNonce,
        lang,
      });

      // Check if result exists and is a valid object
      if (!result || typeof result !== "object") {
        recordFailedAttempt();
        setError(t.errorGoogle);
        setErrorCode("SERVER_NO_RESPONSE");
        setLoading(false);
        return;
      }

      // Handle successful OAuth URL return
      if (result.success && result.redirectUrl) {
        // Redirect to Google OAuth
        window.location.href = result.redirectUrl;
        return; // Don't set loading to false, we're redirecting
      }

      // Handle error response
      if (result.success === false) {
        recordFailedAttempt();
        setError(result.error || t.errorGoogle);
        if (result.errorCode) setErrorCode(result.errorCode);
      }
    } catch (err: unknown) {
      // Check if this is a redirect error (which means success for OAuth)
      // Next.js redirect() throws an error with specific properties
      const errorObj = err as { name?: string; message?: string; digest?: string };
      if (
        errorObj?.name === "NEXT_REDIRECT" ||
        errorObj?.digest?.startsWith("NEXT_") ||
        errorObj?.message?.includes("redirect") ||
        errorObj?.message?.includes("NEXT_REDIRECT")
      ) {
        // This is expected - OAuth redirect is happening
        // Don't show error, the redirect will happen automatically
        return;
      }

      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(t.errorGoogle);
      setErrorCode(`CLIENT_EXCEPTION: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle forgot password with security checks
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setError(null);

    // Security: Timing check
    const now = Date.now();
    const timeSinceLastSubmit = now - lastSubmitTime;
    if (lastSubmitTime > 0 && timeSinceLastSubmit < 2000) {
      setError(t.rateLimitError);
      return;
    }
    setLastSubmitTime(now);

    // Security: Check honeypot
    if (honeypot) {
      console.warn("Honeypot triggered on forgot password");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      // Still show success message to prevent user enumeration
      setSuccess(t.passwordResetSent);
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !validateEmail(trimmedEmail)) {
      setFieldErrors({ email: t.errorInvalidEmail });
      return;
    }

    let token = csrfToken || getCSRFTokenFromCookie();
    if (!token) {
      token = await refreshCSRFToken();
    }

    if (!token) {
      setError(t.csrfError);
      return;
    }

    setLoading(true);

    try {
      const result = await forgotPasswordAction({
        email: trimmedEmail,
        csrfToken: token,
        honeypot,
        deviceFingerprint,
        securityNonce,
        lang,
      });

      if (!result.success && result.error) {
        setError(result.error);
      } else {
        setSuccess(t.passwordResetSent);
        setTimeout(() => {
          setShowForgotPassword(false);
          setSuccess(null);
          // Clear email for security
          setEmail("");
        }, 3000);
      }
    } catch {
      // Even on error, show generic success message to prevent user enumeration
      setSuccess(t.passwordResetSent);
    } finally {
      setLoading(false);
    }
  };

  // Toggle language
  const toggleLang = () => {
    const newLang = lang === "th" ? "en" : "th";
    setLang(newLang);
    localStorage.setItem("preferred-lang", newLang);
  };

  // Switch mode (login/register)
  const switchMode = () => {
    const newIsRegister = !isRegister;
    setIsRegister(newIsRegister);
    setError(null);
    setErrorCode(null);
    setSuccess(null);
    setPassword("");
    setConfirmPassword("");
    setShowPasswordStrength(false);
    setFieldErrors({});

    // Update URL without navigation
    const url = new URL(window.location.href);
    if (newIsRegister) {
      url.searchParams.set("mode", "register");
    } else {
      url.searchParams.delete("mode");
    }
    window.history.pushState({}, "", url);
  };

  // Requirement item component
  const RequirementItem = ({ met, text }: { met: boolean; text: string }) => (
    <div className="flex items-center gap-2 text-xs">
      {met ? (
        <Check className="w-3.5 h-3.5 text-[#4EDEA3] flex-shrink-0" />
      ) : (
        <X className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
      )}
      <span className={met ? "text-gray-300" : "text-gray-500"}>{text}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#131313] flex items-center justify-center p-4 sm:p-6 relative">
      {/* Language Toggle */}
      <button
        onClick={toggleLang}
        className="fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-md border border-white/10 rounded-full text-white text-xs font-bold uppercase tracking-wide hover:bg-white/10 transition-all cursor-pointer shadow-lg pointer-events-auto"
      >
        <span className={lang === "th" ? "text-[#4EDEA3]" : "text-gray-500"}>TH</span>
        <span className="text-gray-600">|</span>
        <span className={lang === "en" ? "text-[#4EDEA3]" : "text-gray-500"}>EN</span>
      </button>

      {/* Security Badge */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="fixed top-6 left-6 z-50 flex items-center gap-2 text-xs text-gray-500 font-bold"
      >
        <Shield className="w-4 h-4 text-[#4EDEA3]" />
        <span className={lang === "th" ? "font-normal" : "uppercase tracking-wide"}>
          {t.secureConnection}
        </span>
      </motion.div>

      <motion.div
        initial={{ opacity: 1, y: 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <div className="bg-[#1C1B1B] rounded-3xl p-6 sm:p-8 border border-white/5 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none rounded-3xl" />

          <div className="relative z-10 w-full mt-2">
            {showForgotPassword ? (
              <div key="forgot" className="relative z-10">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="flex items-center gap-2 text-gray-400 hover:text-white text-sm font-medium mb-6 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className={lang === "th" ? "" : "uppercase tracking-wider text-xs font-bold"}>{t.back}</span>
                </button>

                <div className="mb-8">
                  <h2 className="text-2xl font-black text-white tracking-tight mb-2">{t.resetPassword}</h2>
                  <p className="text-sm text-gray-500">{t.resetDescription}</p>
                </div>

                {error && (
                  <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm text-center">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="mb-6 p-4 bg-[#4EDEA3]/10 border border-[#4EDEA3]/20 rounded-2xl text-[#4EDEA3] text-sm text-center flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    {success}
                  </div>
                )}

                <form onSubmit={handleForgotPassword} method="POST" className="space-y-3">
                  {/* Honeypot field - invisible to users */}
                  <div className="absolute opacity-0 pointer-events-none" aria-hidden="true">
                    <input
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold text-gray-500 ml-1 ${lang === "th" ? "" : "uppercase tracking-wider"}`}>
                      {t.email}
                    </label>
                    <div className={`relative group transition-all duration-300 ${focusedField === "reset-email" ? "transform scale-[1.02]" : ""}`}>
                      <Mail
                        className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-300 ${
                          fieldErrors.email ? "text-red-400" : focusedField === "reset-email" ? "text-[#4EDEA3]" : "text-gray-500"
                        }`}
                      />
                      <input
                        type="email"
                        id="reset-email"
                        name="email"
                        value={email}
                        onChange={(e) => {
                          // Security: Limit input length
                          const value = e.target.value.slice(0, 254);
                          setEmail(value);
                          clearFieldError("email");
                        }}
                        onFocus={() => setFocusedField("reset-email")}
                        onBlur={() => setFocusedField(null)}
                        placeholder={t.emailPlaceholder}
                        disabled={loading}
                        autoComplete="email"
                        inputMode="email"
                        maxLength={254}
                        required
                        aria-label={t.email}
                        aria-invalid={!!fieldErrors.email}
                        className={`w-full bg-white/5 border pl-12 pr-6 py-3.5 text-white outline-none transition-all text-sm disabled:opacity-50 rounded-lg ${
                          fieldErrors.email
                            ? "border-red-500/50 focus:border-red-500 focus:bg-red-500/5"
                            : "border-white/10 focus:border-[#4EDEA3]/50 focus:bg-white/[0.07]"
                        }`}
                      />
                    </div>
                    {fieldErrors.email && (
                      <div className="text-xs text-red-400 ml-1">
                        {fieldErrors.email}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 bg-[#4EDEA3] text-[#0E0E0E] rounded-xl font-black text-sm uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t.sendResetLink}
                  </button>
                </form>
              </div>
            ) : (
              <div key="auth" className="relative z-10 w-full">
                {/* Logo Section */}
                <div className="text-center mb-6">
                  <div className="w-14 h-14 bg-gradient-to-br from-[#4EDEA3] to-[#3DC992] rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#4EDEA3]/20">
                    <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3v18h18" />
                      <path d="M7 16l4-6 4 4 4-8" />
                    </svg>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-wide mb-2">FinTrack</h1>
                  <p className="text-sm text-gray-500">{isRegister ? t.createAccount : t.welcomeBack}</p>
                </div>

                {/* Error/Success Messages */}
                <div>
                  {accountLocked && (
                    <div className="mb-6 overflow-hidden">
                      <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl text-orange-400 text-sm text-center">
                        <div className="font-bold mb-1">{t.accountLocked}</div>
                        <div className="text-xs">
                          {t.accountLockedDesc}
                          <br />
                          {lockoutTimer > 0 && (
                            <span className="font-mono mt-1 inline-block">
                              {Math.floor(lockoutTimer / 60)}:{String(lockoutTimer % 60).padStart(2, "0")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {error && !accountLocked && (
                    <div className="mb-6 overflow-hidden">
                      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm text-center">
                        <div className="font-bold">{error}</div>
                        {errorCode && (
                          <div className="text-xs uppercase tracking-wider text-red-400/70 mt-1.5 font-mono">
                            Ref: {errorCode}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {success && (
                    <div className="mb-6 overflow-hidden">
                      <div className="p-4 bg-[#4EDEA3]/10 border border-[#4EDEA3]/20 rounded-2xl text-[#4EDEA3] text-sm text-center flex items-center justify-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        {success}
                      </div>
                    </div>
                  )}
                </div>

                <form onSubmit={handleEmailAuth} method="POST" className="space-y-4 relative z-20">
                  {/* Honeypot API bot defense */}
                  <div className="absolute opacity-0 pointer-events-none" aria-hidden="true">
                    <input
                      type="text"
                      name="url"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="email" className={`text-xs font-semibold text-gray-500 ml-1 ${lang === "th" ? "" : "uppercase tracking-wider"}`}>
                      {t.email}
                    </label>
                    <div className={`relative group transition-all duration-300 ${focusedField === "email" ? "transform scale-[1.02]" : ""}`}>
                      <Mail
                        className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-300 ${
                          fieldErrors.email ? "text-red-400" : focusedField === "email" ? "text-[#4EDEA3]" : "text-gray-500"
                        }`}
                      />
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={email}
                        onChange={(e) => {
                          const value = e.target.value.slice(0, 254);
                          setEmail(value);
                          clearFieldError("email");
                        }}
                        onFocus={() => setFocusedField("email")}
                        onBlur={() => setFocusedField(null)}
                        placeholder={t.emailPlaceholder}
                        disabled={loading || accountLocked}
                        autoComplete="email"
                        inputMode="email"
                        maxLength={254}
                        required
                        aria-label={t.email}
                        aria-invalid={!!fieldErrors.email}
                        aria-describedby={fieldErrors.email ? "email-error" : undefined}
                        className={`w-full bg-white/5 border pl-12 pr-6 py-3.5 text-white outline-none transition-all text-sm disabled:opacity-50 rounded-lg ${
                          fieldErrors.email
                            ? "border-red-500/50 focus:border-red-500 focus:bg-red-500/5"
                            : "border-white/10 focus:border-[#4EDEA3]/50 focus:bg-white/[0.07]"
                        }`}
                      />
                    </div>
                    {fieldErrors.email && (
                      <div id="email-error" role="alert" className="text-xs text-red-400 ml-1">
                        {fieldErrors.email}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="password" className={`text-xs font-semibold text-gray-500 ml-1 ${lang === "th" ? "" : "uppercase tracking-wider"}`}>
                      {t.password}
                    </label>
                    <div className="relative">
                      <div className={`relative group transition-all duration-300 ${focusedField === "password" ? "transform scale-[1.02]" : ""}`}>
                        <Lock
                          className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-300 ${
                            fieldErrors.password ? "text-red-400" : focusedField === "password" ? "text-[#4EDEA3]" : "text-gray-500"
                          }`}
                        />
                        <input
                          type={showPassword ? "text" : "password"}
                          id="password"
                          name="password"
                          value={password}
                          onChange={(e) => {
                            const value = e.target.value.slice(0, 128);
                            setPassword(value);
                            clearFieldError("password");
                            if (isRegister) setShowPasswordStrength(true);
                          }}
                          onFocus={() => {
                            setFocusedField("password");
                            if (isRegister) setShowPasswordStrength(true);
                          }}
                          onBlur={() => {
                            setFocusedField(null);
                            setTimeout(() => setShowPasswordStrength(false), 200);
                          }}
                          placeholder={t.passwordPlaceholder}
                          disabled={loading || accountLocked}
                          autoComplete={isRegister ? "new-password" : "current-password"}
                          maxLength={128}
                          required
                          aria-label={t.password}
                          aria-invalid={!!fieldErrors.password}
                          aria-describedby={fieldErrors.password ? "password-error" : "password-requirements"}
                          className={`w-full bg-white/5 border pl-12 pr-12 py-3.5 text-white outline-none transition-all text-sm disabled:opacity-50 rounded-lg ${
                            fieldErrors.password
                              ? "border-red-500/50 focus:border-red-500 focus:bg-red-500/5"
                              : "border-white/10 focus:border-[#4EDEA3]/50 focus:bg-white/[0.07]"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                             e.preventDefault();
                             setShowPassword(!showPassword);
                          }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors z-[60] bg-transparent border-none cursor-pointer w-8 h-8 flex items-center justify-center p-0 outline-none"
                          title={showPassword ? t.hidePassword : t.showPassword}
                          aria-label={showPassword ? t.hidePassword : t.showPassword}
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>

                      {/* Password Strength Indicator */}
                      {isRegister && showPasswordStrength && password.length > 0 && (
                        <div
                          className="mt-2 p-3 bg-[#141414] rounded-xl border border-white/10 shadow-xl shadow-black/60"
                        >
                          <div className="flex items-center justify-between mb-2.5">
                            <span className="text-xs text-gray-500">{t.passwordRequirements}</span>
                            <span className="text-xs font-bold" style={{ color: getStrengthColor(passwordStrength.score) }}>
                              {getStrengthLabel(passwordStrength.score, t)}
                            </span>
                          </div>

                          <div className="flex gap-1 mb-3">
                            {[1, 2, 3, 4, 5].map((seg) => (
                              <div
                                key={seg}
                                className="h-1.5 flex-1 rounded-full transition-all duration-300"
                                style={{
                                  backgroundColor: passwordStrength.score >= seg ? getStrengthColor(passwordStrength.score) : "#2a2a2a",
                                }}
                              />
                            ))}
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            <RequirementItem met={passwordStrength.checks.minLength} text={t.minLength} />
                            <RequirementItem met={passwordStrength.checks.hasUppercase} text={t.hasUppercase} />
                            <RequirementItem met={passwordStrength.checks.hasLowercase} text={t.hasLowercase} />
                            <RequirementItem met={passwordStrength.checks.hasNumber} text={t.hasNumber} />
                            <RequirementItem met={passwordStrength.checks.hasSpecial} text={t.hasSpecial} />
                          </div>
                        </div>
                      )}
                    </div>

                    {fieldErrors.password && (
                      <div id="password-error" role="alert" className="text-xs text-red-400 ml-1">
                        {fieldErrors.password}
                      </div>
                    )}
                  </div>

                  {/* Confirm Password Field */}
                  {isRegister && (
                    <div className="space-y-1.5">
                      <label htmlFor="confirmPassword" className={`text-xs font-semibold text-gray-500 ml-1 ${lang === "th" ? "" : "uppercase tracking-wider"}`}>
                        {t.confirmPassword}
                      </label>
                      <div className={`relative group transition-all duration-300 ${focusedField === "confirmPassword" ? "transform scale-[1.02]" : ""}`}>
                        <Lock
                          className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-300 ${
                            fieldErrors.confirmPassword ? "text-red-400" : focusedField === "confirmPassword" ? "text-[#4EDEA3]" : "text-gray-500"
                          }`}
                        />
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          id="confirmPassword"
                          name="confirmPassword"
                          value={confirmPassword}
                          onChange={(e) => {
                            const value = e.target.value.slice(0, 128);
                            setConfirmPassword(value);
                            clearFieldError("confirmPassword");
                          }}
                          onFocus={() => setFocusedField("confirmPassword")}
                          onBlur={() => setFocusedField(null)}
                          placeholder={t.confirmPasswordPlaceholder}
                          disabled={loading || accountLocked}
                          autoComplete="new-password"
                          maxLength={128}
                          required
                          aria-label={t.confirmPassword}
                          aria-invalid={!!fieldErrors.confirmPassword}
                          aria-describedby={fieldErrors.confirmPassword ? "confirm-password-error" : undefined}
                          className={`w-full bg-white/5 border pl-12 pr-12 py-3.5 text-white outline-none transition-all text-sm disabled:opacity-50 rounded-lg ${
                            fieldErrors.confirmPassword
                              ? "border-red-500/50 focus:border-red-500 focus:bg-red-500/5"
                              : "border-white/10 focus:border-[#4EDEA3]/50 focus:bg-white/[0.07]"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                             e.preventDefault();
                             setShowConfirmPassword(!showConfirmPassword);
                          }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors z-[60] bg-transparent border-none cursor-pointer w-8 h-8 flex items-center justify-center p-0 outline-none"
                          title={showConfirmPassword ? t.hidePassword : t.showPassword}
                          aria-label={showConfirmPassword ? t.hidePassword : t.showPassword}
                        >
                          {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      {fieldErrors.confirmPassword && (
                        <div id="confirm-password-error" role="alert" className="text-xs text-red-400 ml-1">
                          {fieldErrors.confirmPassword}
                        </div>
                      )}
                    </div>
                  )}

                  {!isRegister && (
                    <div className="flex items-center justify-between mt-2 px-1">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <div className="relative flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            disabled={loading || accountLocked}
                            className="peer appearance-none w-4 h-4 border border-gray-600 rounded cursor-pointer checked:bg-[#4EDEA3] checked:border-[#4EDEA3] transition-colors focus:ring-2 focus:ring-[#4EDEA3]/30 focus:outline-none"
                          />
                          <Check className="absolute w-3 h-3 text-[#0E0E0E] opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" strokeWidth={3} />
                        </div>
                        <span className="text-xs text-gray-400 group-hover:text-white transition-colors select-none">{t.rememberMe}</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => {
                          setShowForgotPassword(true);
                          setError(null);
                          setSuccess(null);
                        }}
                        disabled={loading || accountLocked}
                        className="text-xs text-[#4EDEA3] hover:text-[#3DC992] transition-colors bg-transparent border-none p-0 cursor-pointer w-auto relative z-[60]"
                      >
                        {t.forgotPassword}
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || accountLocked}
                    className="w-full py-3.5 bg-[#4EDEA3] text-[#0E0E0E] rounded-xl font-black text-sm uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6 relative z-[60]"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isRegister ? t.registerNow : t.loginNow}
                  </button>

                  <div className="relative py-4 z-10">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-white/10"></div>
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-[#1C1B1B] px-4 text-xs text-gray-500">{t.orContinueWith}</span>
                    </div>
                  </div>

                  <div className="z-20 relative">
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={loading || accountLocked}
                      className="w-full py-3.5 bg-white/5 text-white border border-white/10 rounded-xl font-semibold text-sm hover:bg-white/10 hover:border-white/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      <svg className="w-5 h-5 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      {t.signInWithGoogle}
                    </button>
                  </div>

                  {/* Switch Mode */}
                  <p className="text-center text-sm text-gray-500">
                    {isRegister ? t.hasAccount : t.noAccount}{" "}
                    <button
                      type="button"
                      onClick={switchMode}
                      className="text-[#4EDEA3] hover:text-[#3DC992] cursor-pointer bg-transparent border-none p-0 font-semibold underline underline-offset-2 relative z-[60]"
                    >
                      {isRegister ? t.loginNow : t.registerNow}
                    </button>
                  </p>

                  {/* Terms */}
                  <p className="text-center text-xs text-gray-600 pt-2">
                    {t.termsText}{" "}
                    <a href="/terms-of-service" className="text-gray-500 hover:text-[#4EDEA3] transition-colors relative z-[60]">
                      {t.termsLink}
                    </a>{" "}
                    {t.and}{" "}
                    <a href="/privacy-policy" className="text-gray-500 hover:text-[#4EDEA3] transition-colors relative z-[60]">
                      {t.privacyLink}
                    </a>
                  </p>
                </form>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function LoginSkeleton() {
  return (
    <div className="min-h-screen bg-[#131313] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#1C1B1B] rounded-[2.5rem] p-10 border border-white/5">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 bg-white/5 rounded-[1.5rem] animate-pulse" />
          <div className="w-32 h-8 bg-white/5 rounded-lg animate-pulse" />
          <div className="w-48 h-4 bg-white/5 rounded-lg animate-pulse" />
        </div>
        <div className="mt-8 space-y-4">
          <div className="h-14 bg-white/5 rounded-2xl animate-pulse" />
          <div className="h-14 bg-white/5 rounded-2xl animate-pulse" />
          <div className="h-12 bg-white/5 rounded-2xl animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ─── Page Export ────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginContent />
    </Suspense>
  );
}
