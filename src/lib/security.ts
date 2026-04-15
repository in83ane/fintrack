import crypto from "crypto";
import { headers } from "next/headers";

// ─── Device Fingerprinting ─────────────────────────────────────────────────

export interface DeviceInfo {
  fingerprint: string;
  userAgent: string;
  ip: string;
  timestamp: number;
}

export async function getDeviceFingerprint(): Promise<string> {
  const headersList = await headers();
  const userAgent = headersList.get("user-agent") || "unknown";
  const acceptLang = headersList.get("accept-language") || "unknown";
  const accept = headersList.get("accept") || "unknown";
  const ip = await getClientIP();

  const data = `${userAgent}:${acceptLang}:${accept}:${ip}`;
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 32);
}

export async function getClientIP(): Promise<string> {
  const headersList = await headers();
  const forwarded = headersList.get("x-forwarded-for");
  const realIp = headersList.get("x-real-ip");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

// ─── Input Sanitization ───────────────────────────────────────────────────

export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim().replace(/\s+/g, "");
}

export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, "") // Remove < and > to prevent XSS
    .trim()
    .slice(0, 1000); // Limit length
}

// ─── Password Validation ──────────────────────────────────────────────────

export interface PasswordValidation {
  isValid: boolean;
  errors: string[];
}

export function validatePasswordStrength(password: string, lang: "th" | "en" = "th"): PasswordValidation {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push(lang === "th" ? "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" : "Password must be at least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push(lang === "th" ? "ต้องมีตัวพิมพ์ใหญ่ (A-Z)" : "Must contain uppercase letter (A-Z)");
  }
  if (!/[a-z]/.test(password)) {
    errors.push(lang === "th" ? "ต้องมีตัวพิมพ์เล็ก (a-z)" : "Must contain lowercase letter (a-z)");
  }
  if (!/[0-9]/.test(password)) {
    errors.push(lang === "th" ? "ต้องมีตัวเลข (0-9)" : "Must contain number (0-9)");
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push(lang === "th" ? "ต้องมีอักขระพิเศษ (!@#$%)" : "Must contain special character (!@#$%)");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

// ─── Token Generation ───────────────────────────────────────────────────────

export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// ─── Rate Limit Key Generation ─────────────────────────────────────────────

export function generateRateLimitKey(identifier: string, type: string): string {
  return crypto.createHash("sha256").update(`${type}:${identifier}`).digest("hex").slice(0, 32);
}

// ─── Security Headers ──────────────────────────────────────────────────────

export const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// ─── Honeypot Field Validation ────────────────────────────────────────────

export function validateHoneypot(honeypotValue?: string | null): boolean {
  // Honeypot should be empty - if it has value, it's likely a bot
  return !honeypotValue || honeypotValue.trim() === "";
}

// ─── Time-based One-Time Password (TOTP) Helpers ───────────────────────────

export function generateTOTPSecret(): string {
  return crypto.randomBytes(20).toString("base64url");
}

export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString("hex").toUpperCase());
  }
  return codes;
}

// ─── Audit Log Entry ──────────────────────────────────────────────────────

export interface AuditLogEntry {
  action: string;
  email?: string;
  ip: string;
  deviceFingerprint: string;
  userAgent: string;
  success: boolean;
  metadata?: Record<string, unknown>;
}

export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  // In production, send to logging service (e.g., Logtail, Datadog)
  // For now, just log to console with sensitive data masked
  const timestamp = new Date().toISOString();
  const maskedEmail = entry.email ? entry.email.replace(/(.{2}).*(@.*)/, "$1***$2") : "N/A";

  console.log(`[AUDIT ${timestamp}] ${entry.action} | Email: ${maskedEmail} | Success: ${entry.success} | IP: ${entry.ip}`);
}

// ─── Timing Attack Prevention ──────────────────────────────────────────────

export async function constantTimeCompare(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

// ─── Suspicious Activity Detection ────────────────────────────────────────

export function isSuspiciousActivity(
  attempts: number,
  timeWindow: number,
  threshold: number = 5
): boolean {
  return attempts > threshold;
}

// ─── Data Encryption Helpers ───────────────────────────────────────────────

export function encryptData(data: string, key: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptData(encryptedData: string, key: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
