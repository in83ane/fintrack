// ─── Environment Configuration ─────────────────────────────────────────────
// จัดการ environment variables และ URLs สำหรับหลาย environment

export function getAppUrl(): string {
  // Priority:
  // 1. NEXT_PUBLIC_APP_URL (production)
  // 2. VERCEL_URL (Vercel deployment)
  // 3. localhost (development fallback)

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Vercel auto-detected URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Development fallback
  return "http://localhost:3000";
}

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  return url;
}

export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  }
  return key;
}

export function getSupabaseServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return key;
}

export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
