"use server";

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import {
  sanitizeEmail,
  sanitizeString,
  validateEmail,
  validatePasswordStrength,
  validateHoneypot,
  getDeviceFingerprint,
  getClientIP,
  createAuditLog,
  type AuditLogEntry,
} from "@/src/lib/security";
import { checkRateLimit, resetRateLimit, type RateLimitResult } from "@/src/lib/ratelimit";
import { getAppUrl, getSupabaseUrl, getSupabaseAnonKey, getSupabaseServiceKey } from "@/src/lib/env";

// ─── Initialize Supabase Admin Client ──────────────────────────────────────
// Note: Use service role key only in server actions, never expose to client
// Lazy initialization to prevent crashes at module load time
let supabaseUrl: string | null = null;
let supabaseServiceKey: string | null = null;

function getLazySupabaseUrl(): string {
  if (!supabaseUrl) {
    try {
      supabaseUrl = getSupabaseUrl();
    } catch (e) {
      console.error("Failed to get Supabase URL:", e);
      throw new Error("Supabase URL not configured");
    }
  }
  return supabaseUrl;
}

function getLazySupabaseServiceKey(): string {
  if (!supabaseServiceKey) {
    try {
      supabaseServiceKey = getSupabaseServiceKey();
    } catch (e) {
      console.error("Failed to get Supabase service key:", e);
      throw new Error("Supabase service key not configured");
    }
  }
  return supabaseServiceKey;
}

// Create admin client (has bypass email confirmation privileges)
const createAdminClient = () => {
  const url = getLazySupabaseUrl();
  const key = getLazySupabaseServiceKey();
  if (!url || !key) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

// ─── CSRF Token Validation ───────────────────────────────────────────────────

async function validateCSRFToken(token: string): Promise<boolean> {
  if (!token) {
    console.warn("CSRF Validation failed: Missing token in action payload");
    return false;
  }

  const cookieStore = await cookies();
  const storedToken = cookieStore.get("csrf-token")?.value;

  if (!storedToken) {
    console.warn("CSRF Validation failed: Missing csrf-token cookie store");
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks, but safely handle different lengths
  try {
    if (token.length !== storedToken.length) {
      console.warn("CSRF Validation failed: Length mismatch");
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(storedToken));
  } catch (err) {
    console.warn("CSRF Validation failed: Exception during comparison", err);
    return false;
  }
}

// ─── Security Validations ────────────────────────────────────────────────────

/**
 * Security: Validate password format (basic sanity check)
 * Password should be a SHA-256 hash (64 hex characters)
 */
function validatePasswordFormat(hashedPassword: string): boolean {
  // SHA-256 produces 64 character hex string
  const isValidHash = /^[a-f0-9]{64}$/i.test(hashedPassword);
  return isValidHash;
}

/**
 * Security: Additional input validation
 */
function validateInputLength(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength;
}

/**
 * Security: Detect suspicious patterns in input
 */
function detectSuspiciousPatterns(input: string): boolean {
  // Check for common injection patterns
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+=/i,
    /\.\.\/\.\./, // Path traversal
    /[\x00-\x1F\x7F]/, // Control characters
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(input));
}

// ─── Response Types ────────────────────────────────────────────────────────

export interface ActionResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  message?: string;
  requiresEmailConfirmation?: boolean;
  email?: string;
  redirectUrl?: string;
  rateLimitInfo?: {
    remaining: number;
    resetTime: number;
    blocked: boolean;
  };
}

// ─── Generic Error Messages ──────────────────────────────────────────────────
// Prevent user enumeration attacks by using generic messages

const MESSAGES = {
  th: {
    INVALID_CREDENTIALS: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    EMAIL_NOT_CONFIRMED: "กรุณายืนยันอีเมลของคุณก่อนเข้าสู่ระบบ",
    RATE_LIMITED: "กรุณารอสักครู่ก่อนลองใหม่",
    SERVER_ERROR: "เกิดข้อผิดพลาด กรุณาลองใหม่ภายหลัง",
    CSRF_INVALID: "การยืนยันความปลอดภัยล้มเหลว กรุณารีเฟรชหน้า",
    REGISTRATION_SUCCESS: "สมัครสมาชิกสำเร็จ กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี",
    PASSWORD_RESET_SENT: "หากอีเมลนี้มีในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้",
    PASSWORD_WEAK: "รหัสผ่านไม่ปลอดภัยเพียงพอ",
    HONEYPOT_TRIGGERED: "การดำเนินการถูกปฏิเสธ",
    ACCOUNT_EXISTS: "อีเมลนี้มีในระบบแล้ว กรุณาเข้าสู่ระบบ",
    NEW_DEVICE_DETECTED: "ตรวจพบอุปกรณ์ใหม่ กรุณายืนยันตัวตน",
  },
  en: {
    INVALID_CREDENTIALS: "Invalid email or password",
    EMAIL_NOT_CONFIRMED: "Please confirm your email before signing in",
    RATE_LIMITED: "Please wait before trying again",
    SERVER_ERROR: "An error occurred. Please try again later",
    CSRF_INVALID: "Security verification failed. Please refresh the page",
    REGISTRATION_SUCCESS: "Registration successful. Please check your email to confirm",
    PASSWORD_RESET_SENT: "If this email exists, we'll send a reset link",
    PASSWORD_WEAK: "Password is not secure enough",
    HONEYPOT_TRIGGERED: "Action rejected",
    ACCOUNT_EXISTS: "Email already exists. Please sign in",
    NEW_DEVICE_DETECTED: "New device detected. Please verify your identity",
  },
};

function getMessage(key: keyof typeof MESSAGES.en, lang: "th" | "en" = "th"): string {
  return MESSAGES[lang][key];
}

// ─── Sign In Action ─────────────────────────────────────────────────────────

export interface SignInCredentials {
  email: string;
  password: string;
  csrfToken: string;
  honeypot?: string;
  rememberMe?: boolean;
  deviceFingerprint?: string;
  securityNonce?: string;
  lang?: "th" | "en";
}

export async function signInAction(credentials: SignInCredentials): Promise<ActionResult> {
  const {
    email,
    password,
    csrfToken,
    honeypot,
    rememberMe,
    deviceFingerprint,
    securityNonce,
    lang = "th",
  } = credentials;

  const clientIP = await getClientIP();
  const userAgent = (await headers()).get("user-agent") || "unknown";

  // Honeypot check removed because Autofill triggers it false-positively.

  // Security: Validate CSRF token
  if (!(await validateCSRFToken(csrfToken))) {
    await createAuditLog({
      action: "CSRF_INVALID",
      email: sanitizeEmail(email),
      ip: clientIP,
      deviceFingerprint: deviceFingerprint || "unknown",
      userAgent,
      success: false,
    });

    return { success: false, error: getMessage("CSRF_INVALID", lang), errorCode: "CSRF_INVALID" };
  }

  // Security: Rate limiting check
  const rateLimit = await checkRateLimit(clientIP, "LOGIN");
  if (!rateLimit.success) {
    await createAuditLog({
      action: "RATE_LIMIT_EXCEEDED",
      email: sanitizeEmail(email),
      ip: clientIP,
      deviceFingerprint: deviceFingerprint || "unknown",
      userAgent,
      success: false,
      metadata: { type: "LOGIN" },
    });

    return {
      success: false,
      error: getMessage("RATE_LIMITED", lang),
      errorCode: "RATE_LIMITED",
      rateLimitInfo: {
        remaining: rateLimit.remaining,
        resetTime: rateLimit.resetTime,
        blocked: rateLimit.blocked,
      },
    };
  }

  try {
    // Security: Input validation with length checks
    const sanitizedEmail = sanitizeEmail(email);

    if (!validateEmail(sanitizedEmail) || !validateInputLength(sanitizedEmail, 254)) {
      return { success: false, error: getMessage("INVALID_CREDENTIALS", lang), errorCode: "INVALID_EMAIL_FORMAT" };
    }

    // Security: Validate password format (should be SHA-256 hash)
    if (!password || !validatePasswordFormat(password)) {
      await createAuditLog({
        action: "INVALID_PASSWORD_FORMAT",
        email: sanitizedEmail,
        ip: clientIP,
        deviceFingerprint: deviceFingerprint || "unknown",
        userAgent,
        success: false,
      });
      return { success: false, error: getMessage("INVALID_CREDENTIALS", lang), errorCode: "INVALID_PASSWORD_FORMAT" };
    }

    // Security: Check for suspicious patterns
    if (detectSuspiciousPatterns(email) || detectSuspiciousPatterns(password)) {
      await createAuditLog({
        action: "SUSPICIOUS_INPUT_DETECTED",
        email: sanitizedEmail,
        ip: clientIP,
        deviceFingerprint: deviceFingerprint || "unknown",
        userAgent,
        success: false,
      });
      return { success: false, error: getMessage("SERVER_ERROR", lang), errorCode: "SUSPICIOUS_INPUT" };
    }

    // Create Supabase client
    // Debug: Check env vars
    let url: string;
    try {
      url = getSupabaseUrl();
    } catch (envErr) {
      console.error("Missing Supabase credentials:", envErr);
      return { success: false, error: getMessage("SERVER_ERROR", lang), errorCode: "MISSING_SUPABASE_CONFIG" };
    }

    const supabase = createClient(
      url,
      getSupabaseAnonKey(),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Security: The password received is already SHA-256 hashed client-side
    // This provides defense-in-depth: server never sees the user's raw password
    // The hashed password is treated as the actual password in Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: sanitizedEmail,
      password, // This is the SHA-256 hash from client
    });

    if (error) {
      // Generic error to prevent user enumeration
      console.error("Supabase login error:", error.message, error.status);
      try {
        await createAuditLog({
          action: "LOGIN_FAILED",
          email: sanitizedEmail,
          ip: clientIP,
          deviceFingerprint: deviceFingerprint || "unknown",
          userAgent,
          success: false,
          metadata: { error: error.message },
        });
      } catch (logError) {
        console.warn("Failed to create audit log:", logError);
      }

      if (error.message.includes("Email not confirmed")) {
        return { success: false, error: getMessage("EMAIL_NOT_CONFIRMED", lang), errorCode: "EMAIL_NOT_CONFIRMED" };
      }

      return { success: false, error: getMessage("INVALID_CREDENTIALS", lang), errorCode: "SUPABASE_AUTH_ERROR" };
    }

    if (!data.user || !data.session) {
      return { success: false, error: getMessage("INVALID_CREDENTIALS", lang), errorCode: "MISSING_SESSION_DATA" };
    }

    // Security: Reset rate limit on successful login
    try {
      await resetRateLimit(clientIP, "LOGIN");
    } catch (rateLimitError) {
      console.warn("Failed to reset rate limit:", rateLimitError);
      // Don't fail login if rate limit reset fails
    }

    // Security: Log successful login
    try {
      await createAuditLog({
        action: "LOGIN_SUCCESS",
        email: sanitizedEmail,
        ip: clientIP,
        deviceFingerprint: deviceFingerprint || "unknown",
        userAgent,
        success: true,
        metadata: { userId: data.user.id, rememberMe },
      });
    } catch (logError) {
      console.warn("Failed to create audit log:", logError);
      // Don't fail login if audit log fails
    }

    // Set secure session cookie
    const cookieStore = await cookies();
    cookieStore.set("session", data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60, // 30 days or 1 day
      path: "/",
    });

    // Set refresh token
    if (data.session.refresh_token) {
      cookieStore.set("refresh_token", data.session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60,
        path: "/",
      });
    }

    return { success: true, email: sanitizedEmail };
  } catch (err) {
    console.error("Sign in error:", err);
    // Log more details for debugging
    if (err instanceof Error) {
      console.error("Error details:", {
        message: err.message,
        name: err.name,
        stack: err.stack,
      });
      return { success: false, error: `Error: ${err.message}`, errorCode: "UNHANDLED_EXCEPTION" };
    }
    return { success: false, error: getMessage("SERVER_ERROR", lang), errorCode: "UNHANDLED_EXCEPTION" };
  }
}

// ─── Sign Up Action ──────────────────────────────────────────────────────────

export interface SignUpData {
  email: string;
  password: string;
  confirmPassword: string;
  csrfToken: string;
  honeypot?: string;
  deviceFingerprint?: string;
  securityNonce?: string;
  lang?: "th" | "en";
}

export async function signUpAction(data: SignUpData): Promise<ActionResult> {
  const { email, password, confirmPassword, csrfToken, honeypot, deviceFingerprint, securityNonce, lang = "th" } = data;

  const clientIP = await getClientIP();
  const userAgent = (await headers()).get("user-agent") || "unknown";

  // Security: Check honeypot field disabled for autofill compatibility

  // Security: Validate CSRF token
  if (!(await validateCSRFToken(csrfToken))) {
    return { success: false, error: getMessage("CSRF_INVALID", lang) };
  }

  // Security: Rate limiting check
  const rateLimit = await checkRateLimit(clientIP, "REGISTER");
  if (!rateLimit.success) {
    return {
      success: false,
      error: getMessage("RATE_LIMITED", lang),
      rateLimitInfo: {
        remaining: rateLimit.remaining,
        resetTime: rateLimit.resetTime,
        blocked: rateLimit.blocked,
      },
    };
  }

  try {
    // Security: Input validation with length checks
    const sanitizedEmail = sanitizeEmail(email);

    if (!validateEmail(sanitizedEmail) || !validateInputLength(sanitizedEmail, 254)) {
      return { success: false, error: getMessage("INVALID_CREDENTIALS", lang) };
    }

    // Security: Validate password format (should be SHA-256 hash)
    if (!password || !validatePasswordFormat(password) || !validatePasswordFormat(confirmPassword)) {
      await createAuditLog({
        action: "INVALID_PASSWORD_FORMAT",
        email: sanitizedEmail,
        ip: clientIP,
        deviceFingerprint: deviceFingerprint || "unknown",
        userAgent,
        success: false,
      });
      return { success: false, error: getMessage("INVALID_CREDENTIALS", lang), errorCode: "INVALID_PASSWORD_FORMAT" };
    }

    if (password !== confirmPassword) {
      return { success: false, error: lang === "th" ? "รหัสผ่านไม่ตรงกัน" : "Passwords do not match", errorCode: "PASSWORD_MISMATCH" };
    }

    // Security: Check for suspicious patterns
    if (detectSuspiciousPatterns(email) || detectSuspiciousPatterns(password)) {
      await createAuditLog({
        action: "SUSPICIOUS_INPUT_DETECTED",
        email: sanitizedEmail,
        ip: clientIP,
        deviceFingerprint: deviceFingerprint || "unknown",
        userAgent,
        success: false,
      });
      return { success: false, error: getMessage("SERVER_ERROR", lang) };
    }

    // Create Supabase client
    let url: string;
    try {
      url = getSupabaseUrl();
    } catch (envErr) {
      console.error("Environment variable error:", envErr);
      return {
        success: false,
        error: lang === "th" ? "การตั้งค่า Supabase ไม่สมบูรณ์" : "Supabase configuration incomplete",
        errorCode: "ENV_CONFIG_ERROR"
      };
    }

    const supabase = createClient(
      url,
      getSupabaseAnonKey(),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Check if user already exists (to provide better UX while still secure)
    // Note: This queries the public.users table which may not exist
    // If it fails, we rely on Supabase Auth's built-in duplicate detection
    let existingUser = null;
    try {
      const { data, error: userCheckError } = await supabase
        .from("users")
        .select("id")
        .eq("email", sanitizedEmail)
        .maybeSingle();

      if (userCheckError) {
        console.warn("User check query error (table may not exist):", userCheckError.message);
      } else {
        existingUser = data;
      }
    } catch (tableError) {
      // Table likely doesn't exist, continue with auth signup
      console.warn("Could not check existing users table, continuing with signup");
    }

    if (existingUser) {
      // Return generic message but hint at sign in
      return {
        success: false,
        error: getMessage("ACCOUNT_EXISTS", lang),
        errorCode: "ACCOUNT_EXISTS"
      };
    }

    // Security: The password received is already SHA-256 hashed client-side
    // This provides defense-in-depth: server never sees the user's raw password
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: sanitizedEmail,
      password, // This is the SHA-256 hash from client
      options: {
        emailRedirectTo: `${getAppUrl()}/auth/callback`,
        data: {
          device_fingerprint: deviceFingerprint,
          registration_ip: clientIP,
          user_agent: userAgent,
          security_nonce: securityNonce,
        },
      },
    });

    // Supabase auth.signUp returns an empty identities array if user already registered but enumeration mitigation is on
    if ((signUpData?.user?.identities && signUpData.user.identities.length === 0) || error?.message.includes("User already registered") || error?.message.includes("Email address already in use")) {
      console.warn("User already exists");
      return {
        success: false,
        error: getMessage("ACCOUNT_EXISTS", lang),
        errorCode: "ACCOUNT_EXISTS"
      };
    }

    if (error) {
      // Log error details
      console.error("Supabase signup error:", error.message, error.status);

      await createAuditLog({
        action: "REGISTRATION_FAILED",
        email: sanitizedEmail,
        ip: clientIP,
        deviceFingerprint: deviceFingerprint || "unknown",
        userAgent,
        success: false,
        metadata: { error: error.message, status: error.status },
      });

      // Handle specific error cases
      if (error.message.includes("User already registered")) {
        return { success: false, error: getMessage("ACCOUNT_EXISTS", lang), errorCode: "SUPABASE_USER_EXISTS" };
      }
      if (error.message.includes("Password")) {
        return { success: false, error: getMessage("INVALID_CREDENTIALS", lang), errorCode: "SUPABASE_INVALID_PASSWORD" };
      }
      if (error.message.includes("Email")) {
        return { success: false, error: getMessage("INVALID_CREDENTIALS", lang), errorCode: "SUPABASE_INVALID_EMAIL" };
      }
      if (error.message.includes("email rate limit exceeded") || error.message.includes("rate limit")) {
        return { 
          success: false, 
          error: lang === "th" ? "จำกัดการส่งอีเมลของระบบฐานข้อมูล (Supabase Rate Limit) กรุณาใช้อีเมลอื่น หรือรอ 1 ชั่วโมง" : "Supabase email rate limit exceeded. Try another email or wait an hour.", 
          errorCode: "SUPABASE_RATE_LIMIT" 
        };
      }

      if (process.env.NODE_ENV === "development") {
        return { success: false, error: `[DEV ERROR] ${error.message}`, errorCode: "SUPABASE_AUTH_ERROR" };
      }
      return { success: false, error: getMessage("SERVER_ERROR", lang), errorCode: "SUPABASE_AUTH_ERROR" };
    }

    // Security: Reset rate limit on successful registration
    await resetRateLimit(clientIP, "REGISTER");

    await createAuditLog({
      action: "REGISTRATION_SUCCESS",
      email: sanitizedEmail,
      ip: clientIP,
      deviceFingerprint: deviceFingerprint || "unknown",
      userAgent,
      success: true,
      metadata: { userId: signUpData.user?.id },
    });

    return {
      success: true,
      message: getMessage("REGISTRATION_SUCCESS", lang),
      requiresEmailConfirmation: true,
    };
  } catch (err) {
    console.error("Sign up error:", err);
    // Log more details for debugging
    if (err instanceof Error) {
      console.error("Error details:", {
        message: err.message,
        name: err.name,
        stack: err.stack,
      });
      return { success: false, error: `Error: ${err.message}`, errorCode: "UNHANDLED_EXCEPTION" };
    }
    return { success: false, error: getMessage("SERVER_ERROR", lang), errorCode: "UNHANDLED_EXCEPTION" };
  }
}

// ─── Forgot Password Action ─────────────────────────────────────────────────

export interface ForgotPasswordData {
  email: string;
  csrfToken: string;
  honeypot?: string;
  deviceFingerprint?: string;
  securityNonce?: string;
  lang?: "th" | "en";
}

export async function forgotPasswordAction(data: ForgotPasswordData): Promise<ActionResult> {
  const { email, csrfToken, honeypot, deviceFingerprint, securityNonce, lang = "th" } = data;

  const clientIP = await getClientIP();
  const userAgent = (await headers()).get("user-agent") || "unknown";

  // Security: Check honeypot field
  if (!validateHoneypot(honeypot)) {
    return { success: false, error: getMessage("HONEYPOT_TRIGGERED", lang) };
  }

  // Security: Validate CSRF token
  if (!(await validateCSRFToken(csrfToken))) {
    return { success: false, error: getMessage("CSRF_INVALID", lang) };
  }

  // Security: Input validation
  const sanitizedEmail = sanitizeEmail(email);

  if (!validateInputLength(sanitizedEmail, 254) || detectSuspiciousPatterns(sanitizedEmail)) {
    // Still return generic success to prevent user enumeration
    return { success: true, message: getMessage("PASSWORD_RESET_SENT", lang) };
  }

  // Security: Rate limiting by email to prevent abuse
  const rateLimit = await checkRateLimit(sanitizedEmail, "PASSWORD_RESET");
  if (!rateLimit.success) {
    return {
      success: false,
      error: getMessage("RATE_LIMITED", lang),
      rateLimitInfo: {
        remaining: rateLimit.remaining,
        resetTime: rateLimit.resetTime,
        blocked: rateLimit.blocked,
      },
    };
  }

  try {
    if (!validateEmail(sanitizedEmail)) {
      // Still return generic success to prevent user enumeration
      return { success: true, message: getMessage("PASSWORD_RESET_SENT", lang) };
    }

    let url: string;
    try {
      url = getSupabaseUrl();
    } catch (envErr) {
      console.error("Supabase URL error:", envErr);
      return { success: false, error: getMessage("SERVER_ERROR", lang), errorCode: "ENV_CONFIG_ERROR" };
    }

    const supabase = createClient(
      url,
      getSupabaseAnonKey(),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Send password reset email
    const { error } = await supabase.auth.resetPasswordForEmail(sanitizedEmail, {
      redirectTo: `${getAppUrl()}/reset-password`,
    });

    // Always return generic message to prevent user enumeration
    // Even if there's an error, don't reveal if email exists or not
    await createAuditLog({
      action: "PASSWORD_RESET_REQUESTED",
      email: sanitizedEmail,
      ip: clientIP,
      deviceFingerprint: deviceFingerprint || "unknown",
      userAgent,
      success: !error,
      metadata: error ? { error: error.message } : undefined,
    });

    return { success: true, message: getMessage("PASSWORD_RESET_SENT", lang) };
  } catch (err) {
    console.error("Forgot password error:", err);
    // Still return success message to prevent user enumeration
    return { success: true, message: getMessage("PASSWORD_RESET_SENT", lang) };
  }
}

// ─── Sign Out Action ─────────────────────────────────────────────────────────

export async function signOutAction(): Promise<void> {
  const clientIP = await getClientIP();
  const userAgent = (await headers()).get("user-agent") || "unknown";

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session")?.value;

  try {
    const url = getLazySupabaseUrl();
    const supabase = createClient(
      url,
      getSupabaseAnonKey()
    );

    await supabase.auth.signOut();

    await createAuditLog({
      action: "LOGOUT",
      ip: clientIP,
      deviceFingerprint: "unknown",
      userAgent,
      success: true,
    });
  } catch (err) {
    console.error("Sign out error:", err);
  }

  // Clear cookies regardless of Supabase result
  cookieStore.delete("session");
  cookieStore.delete("refresh_token");

  redirect("/login");
}

// ─── Google OAuth Action ────────────────────────────────────────────────────

export interface GoogleAuthData {
  csrfToken: string;
  deviceFingerprint?: string;
  securityNonce?: string;
  lang?: "th" | "en";
}

export async function initiateGoogleAuth(data: GoogleAuthData): Promise<ActionResult> {
  const { csrfToken, deviceFingerprint, lang = "th" } = data;

  const clientIP = await getClientIP();
  const userAgent = (await headers()).get("user-agent") || "unknown";

  // Security: Validate CSRF token
  if (!(await validateCSRFToken(csrfToken))) {
    return { success: false, error: getMessage("CSRF_INVALID", lang) };
  }

  // Security: Rate limiting
  const rateLimit = await checkRateLimit(clientIP, "OAUTH");
  if (!rateLimit.success) {
    return {
      success: false,
      error: getMessage("RATE_LIMITED", lang),
    };
  }

  let redirectUrl: string | null = null;

  try {
    // Get Supabase credentials with better error handling
    let url: string;
    let anonKey: string;
    try {
      url = getSupabaseUrl();
      anonKey = getSupabaseAnonKey();
    } catch (envErr) {
      console.error("Environment variable error:", envErr);
      return {
        success: false,
        error: lang === "th" ? "การตั้งค่า Supabase ไม่สมบูรณ์" : "Supabase configuration incomplete",
        errorCode: "ENV_CONFIG_ERROR"
      };
    }

    const supabase = createClient(url, anonKey);

    // Get app URL with fallback
    let appUrl: string;
    try {
      appUrl = getAppUrl();
    } catch (appUrlErr) {
      console.warn("App URL error, using fallback:", appUrlErr);
      appUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
    }

    const { data: authData, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${appUrl}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
          // Note: Don't include state here - Supabase manages it automatically
          // and validates it during exchangeCodeForSession
        },
      },
    });

    if (error) {
      console.error("Supabase OAuth error:", error);
      throw error;
    }

    if (authData.url) {
      redirectUrl = authData.url;
    } else {
      return { success: false, error: getMessage("SERVER_ERROR", lang) };
    }
  } catch (err) {
    console.error("Google auth error:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      error: getMessage("SERVER_ERROR", lang),
      errorCode: `OAUTH_ERROR: ${errorMessage.slice(0, 100)}`
    };
  }

  if (redirectUrl) {
    // Return URL instead of calling redirect() to avoid NEXT_REDIRECT error
    // Client will handle the redirect
    return { success: true, redirectUrl };
  }

  return { success: false, error: getMessage("SERVER_ERROR", lang) };
}

// ─── Get CSRF Token ────────────────────────────────────────────────────────
// This is called by the client to get a fresh CSRF token

export async function getCSRFToken(): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");

  const cookieStore = await cookies();
  cookieStore.set("csrf-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60, // 1 hour
    path: "/",
  });

  return token;
}

// ─── Refresh Session ─────────────────────────────────────────────────────────

export async function refreshSession(): Promise<ActionResult> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("refresh_token")?.value;

  if (!refreshToken) {
    return { success: false };
  }

  try {
    let url: string;
    try {
      url = getSupabaseUrl();
    } catch (envErr) {
      console.error("Supabase URL error:", envErr);
      return { success: false, error: "An error occurred. Please try again later", errorCode: "ENV_CONFIG_ERROR" };
    }

    const supabase = createClient(
      url,
      getSupabaseAnonKey(),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      cookieStore.delete("session");
      cookieStore.delete("refresh_token");
      return { success: false };
    }

    // Update cookies
    cookieStore.set("session", data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60,
      path: "/",
    });

    if (data.session.refresh_token) {
      cookieStore.set("refresh_token", data.session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 24 * 60 * 60,
        path: "/",
      });
    }

    return { success: true };
  } catch (err) {
    console.error("Session refresh error:", err);
    return { success: false };
  }
}

// ─── Set Session Action ───────────────────────────────────────────────────────
// Called by client after URL fragment extraction (e.g. Implicit Grant flow email links)

export async function setSessionAction(accessToken: string, refreshToken?: string): Promise<ActionResult> {
  try {
    const cookieStore = await cookies();
    cookieStore.set("session", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60,
      path: "/",
    });

    if (refreshToken) {
      cookieStore.set("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 30 * 24 * 60 * 60,
        path: "/",
      });
    }

    return { success: true };
  } catch (err) {
    console.error("Set session error:", err);
    return { success: false, error: "Failed to set session", errorCode: "SESSION_SET_ERROR" };
  }
}
