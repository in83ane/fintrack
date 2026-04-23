// ─── Environment Configuration ─────────────────────────────────────────────
// จัดการ environment variables และ URLs สำหรับหลาย environment

// Validate URL format
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Validate encryption key (must be 64 hex characters for AES-256)
function isValidEncryptionKey(key: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(key);
}

export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;

  if (url && url.startsWith('http')) {
    if (!isValidUrl(url)) {
      console.warn("Invalid NEXT_PUBLIC_APP_URL format");
    }
    return url;
  }

  // Development fallback
  return "http://localhost:3000";
}

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  if (!url.startsWith('https://')) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be HTTPS");
  }
  return url;
}

export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  }
  if (key.length < 20) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY appears too short");
  }
  return key;
}

export function getSupabaseServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  if (key.length < 20) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY appears too short");
  }
  return key;
}

export function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY is not set");
  }
  if (!isValidEncryptionKey(key)) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters");
  }
  return key;
}

export function getSessionMaxAge(): number {
  return parseInt(process.env.SESSION_MAX_AGE || "86400", 10);
}

export function getCsrfSecret(): string {
  return process.env.CSRF_SECRET || "default-csrf-secret-change-in-production";
}

export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

// Validate all required environment variables on startup
export function validateEnvironment(): void {
  const errors: string[] = [];

  // Required in all environments
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    errors.push("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    errors.push("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  // Required only in production
  if (isProduction()) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      errors.push("Missing SUPABASE_SERVICE_ROLE_KEY (required in production)");
    }
    if (!process.env.ENCRYPTION_KEY) {
      errors.push("Missing ENCRYPTION_KEY (required in production)");
    }
    if (!process.env.CSRF_SECRET) {
      errors.push("Missing CSRF_SECRET (required in production)");
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }
}
