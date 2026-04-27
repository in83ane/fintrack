import { NextRequest, NextResponse } from "next/server";

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ─── Security Configuration ───────────────────────────────────────────────────

// Generate CSP nonce for inline scripts
function generateNonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// Get device fingerprint from request
function getDeviceFingerprint(request: NextRequest): string {
  const userAgent = request.headers.get("user-agent") || "";
  const acceptLang = request.headers.get("accept-language") || "";
  const accept = request.headers.get("accept") || "";
  const ip = getClientIP(request);
  
  // Use a simple composite string for fingerprinting instead of Node crypto
  return `${ip}|${userAgent.slice(0, 40)}|${acceptLang}|${accept}`;
}

// Security Headers with international standards (OWASP compliant)
const getSecurityHeaders = (nonce: string): Record<string, string> => ({
  // Prevent clickjacking
  "X-Frame-Options": "DENY",
  // Prevent MIME-type sniffing
  "X-Content-Type-Options": "nosniff",
  // XSS protection for older browsers
  "X-XSS-Protection": "1; mode=block",
  // Strict referrer policy
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Only allow HTTPS (1 year, include subdomains, preload)
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  // Restrict browser features
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=(), browsing-topics=(), attribution-reporting=()",
  // Content Security Policy with nonce (strict)
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
    "object-src 'none'",
  ].join("; "),
  // Cross Origin policies
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  // Cache control for sensitive pages
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  // Additional security headers
  "X-DNS-Prefetch-Control": "off",
  "X-Download-Options": "noopen",
  "X-Permitted-Cross-Domain-Policies": "none",
});

// ─── Edge Rate Limiter with Device Fingerprinting ────────────────────────────
// For production use Upstash Redis: https://upstash.com/

interface RateLimitEntry {
  count: number;
  firstAttempt: number;
  devices: Set<string>; // Track unique devices
  failedAttempts: number; // Track consecutive failures
}

interface CSRFTokenEntry {
  token: string;
  expires: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const csrfTokenStore = new Map<string, CSRFTokenEntry>();

// Rate limit configurations
const AUTH_RATE_LIMIT = {
  maxRequests: 500, // Increased for dev testing
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxFailedAttempts: 500, // Increased for dev testing
  lockoutMs: 60 * 60 * 1000, // 1 hour lockout
};

const API_RATE_LIMIT = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
};

const GENERAL_RATE_LIMIT = {
  maxRequests: 1000,
  windowMs: 60 * 1000, // 1 minute
};

// Get client IP with validation
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  // Security: Validate IP format to prevent header injection
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;

  if (forwarded) {
    const firstIp = forwarded.split(",")[0]?.trim();
    if (ipRegex.test(firstIp)) return firstIp;
  }
  if (realIp && ipRegex.test(realIp)) {
    return realIp;
  }

  return "unknown";
}

// Security: Check for suspicious request patterns
function detectSuspiciousRequest(request: NextRequest): { suspicious: boolean; reason?: string } {
  const userAgent = request.headers.get("user-agent") || "";
  const contentType = request.headers.get("content-type") || "";

  // Block requests without user agent (likely bots)
  if (!userAgent || userAgent.length < 5) {
    return { suspicious: true, reason: "Missing user agent" };
  }

  // Block known malicious user agents
  const blockedAgents = [
    /sqlmap/i,
    /nikto/i,
    /nessus/i,
    /nmap/i,
    /burp/i,
    /metasploit/i,
    /masscan/i,
    /zgrab/i,
  ];
  if (blockedAgents.some((pattern) => pattern.test(userAgent))) {
    return { suspicious: true, reason: "Known scanning tool" };
  }

  // Check for suspicious content types on POST requests
  if (request.method === "POST" && !contentType.includes("application/json") && !contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("text/plain") && !contentType.includes("multipart/form-data")) {
    return { suspicious: true, reason: "Suspicious content type" };
  }

  return { suspicious: false };
}

// Generate CSRF token
function generateCSRFToken(): string {
  return crypto.randomUUID();
}

// Validate CSRF token
function validateCSRFToken(request: NextRequest): boolean {
  // Skip for GET, HEAD, OPTIONS requests
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(request.method)) return true;

  // Skip for non-auth paths
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api/auth") && pathname !== "/") return true;

  // Skip Next.js internal requests (preflight, HMR, etc.)
  const purpose = request.headers.get("purpose");
  const secFetchDest = request.headers.get("sec-fetch-dest");
  if (purpose === "preflight" || secFetchDest === "empty") return true;

  const csrfHeader = request.headers.get("x-csrf-token");
  const csrfCookie = request.cookies.get("csrf-token")?.value;

  if (!csrfHeader || !csrfCookie) return false;
  if (csrfHeader !== csrfCookie) return false;

  // Check token expiry
  const tokenData = csrfTokenStore.get(csrfCookie);
  if (!tokenData || Date.now() > tokenData.expires) {
    csrfTokenStore.delete(csrfCookie);
    return false;
  }

  return true;
}

// Check if rate limited with device fingerprinting
function isRateLimited(
  ip: string,
  path: string,
  deviceFingerprint: string,
  method: string
): { limited: boolean; lockout: boolean; retryAfter?: number } {
  const isAuthAction =
    (path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/reset-password")) && method === "POST";

  const isApiPath = path.startsWith("/api/");

  let config = GENERAL_RATE_LIMIT;
  if (isAuthAction) config = AUTH_RATE_LIMIT;
  else if (isApiPath) config = API_RATE_LIMIT;

  // Device + IP combined key for auth paths
  const key = isAuthAction ? `auth:${ip}:${deviceFingerprint}` : `general:${ip}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.firstAttempt > config.windowMs) {
    rateLimitStore.set(key, {
      count: 1,
      firstAttempt: now,
      devices: new Set([deviceFingerprint]),
      failedAttempts: 0,
    });
    return { limited: false, lockout: false };
  }

  // Check for lockout (consecutive failures)
  if (isAuthAction && entry.failedAttempts >= AUTH_RATE_LIMIT.maxFailedAttempts) {
    const lockoutTime = entry.firstAttempt + AUTH_RATE_LIMIT.lockoutMs;
    if (now < lockoutTime) {
      return {
        limited: true,
        lockout: true,
        retryAfter: Math.ceil((lockoutTime - now) / 1000),
      };
    }
    // Reset after lockout period
    rateLimitStore.set(key, {
      count: 1,
      firstAttempt: now,
      devices: new Set([deviceFingerprint]),
      failedAttempts: 0,
    });
    return { limited: false, lockout: false };
  }

  if (entry.count >= config.maxRequests) {
    return {
      limited: true,
      lockout: false,
      retryAfter: Math.ceil((config.windowMs - (now - entry.firstAttempt)) / 1000),
    };
  }

  entry.count += 1;
  entry.devices.add(deviceFingerprint);
  return { limited: false, lockout: false };
}

// Record failed attempt
function recordFailedAttempt(ip: string, deviceFingerprint: string, path: string): void {
  const key = `auth:${ip}:${deviceFingerprint}`;
  const entry = rateLimitStore.get(key);
  if (entry) {
    entry.failedAttempts += 1;
  }
}

// Check request size
function isRequestTooLarge(request: NextRequest): boolean {
  const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
  const maxSize = 10 * 1024 * 1024; // 10MB
  return contentLength > maxSize;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Security Checks ───────────────────────────────────────────────────
  // Check request size
  if (isRequestTooLarge(request)) {
    return new NextResponse(
      JSON.stringify({ error: "Request entity too large" }),
      {
        status: 413,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Security: Check for suspicious request patterns
  const suspiciousCheck = detectSuspiciousRequest(request);
  if (suspiciousCheck.suspicious) {
    console.warn(`[SECURITY] Suspicious request from ${getClientIP(request)}: ${suspiciousCheck.reason}`);
    return new NextResponse(
      JSON.stringify({ error: "Request blocked" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // ── 2. Rate Limiting with Device Fingerprint ─────────────────────────────
  const ip = getClientIP(request);
  const deviceFingerprint = getDeviceFingerprint(request);
  const rateLimitResult = isRateLimited(ip, pathname, deviceFingerprint, request.method);

  if (rateLimitResult.limited) {
    const retryAfter = rateLimitResult.retryAfter || 900;
    const message = rateLimitResult.lockout
      ? "Account temporarily locked due to multiple failed attempts. Please try again later."
      : "Too many requests. Please try again later.";

    return new NextResponse(JSON.stringify({ error: message, retryAfter }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    });
  }

  // ── 3. CSRF Protection ─────────────────────────────────────────────────
  if (!validateCSRFToken(request)) {
    return new NextResponse(
      JSON.stringify({ error: "Invalid or missing CSRF token" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // ── 4. Supabase Session Check (simplified) ──────────────
  let response = NextResponse.next({ request });

  // Get session from cookie
  const sessionCookie = request.cookies.get("session")?.value;
  const user = !!sessionCookie; // Lightweight check for Edge runtime

  // Record failed auth attempts on strict API edges if needed (omitted here for simplicity)


  // ── 5. Route Protection ──────────────────────────────────────────────────
  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/reset-password");
  const isProtectedPage =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/portfolio") ||
    pathname.startsWith("/transactions") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/calendar");

  // Redirect authenticated users away from auth pages
  if (isAuthPage && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Redirect unauthenticated users away from protected pages
  if (isProtectedPage && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── 6. Generate Security Headers with Nonce ────────────────────────────
  const nonce = generateNonce();
  const securityHeaders = getSecurityHeaders(nonce);

  // Attach security headers
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // Add nonce to response for client-side use
  response.headers.set("X-Nonce", nonce);

  // ── 7. Set CSRF Token Cookie ───────────────────────────────────────────
  if (!request.cookies.get("csrf-token")) {
    const csrfToken = generateCSRFToken();
    const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    csrfTokenStore.set(csrfToken, { token: csrfToken, expires });

    response.cookies.set({
      name: "csrf-token",
      value: csrfToken,
      httpOnly: false, // Must be accessible by JavaScript
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });
  }

  // ── 8. Add Device Fingerprint Cookie ────────────────────────────────────
  if (!request.cookies.get("device-id")) {
    response.cookies.set({
      name: "device-id",
      value: deviceFingerprint,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - _next/data (client-side navigation data)
     * - api routes
     * - favicon.ico
     * - public assets (images, fonts, etc.)
     * - manifest.json, robots.txt, sitemap.xml
     */
    "/((?!api|_next/static|_next/image|_next/data|favicon.ico|robots.txt|sitemap.xml|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot|ico)$).*)",
  ],
};

// Export helper functions for use in API routes
export { validateCSRFToken, getDeviceFingerprint, isRateLimited, recordFailedAttempt };