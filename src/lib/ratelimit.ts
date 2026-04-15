import crypto from "crypto";

// ─── Rate Limiting Implementation ────────────────────────────────────────────
// In production, replace this with Redis (Upstash, Redis Cloud, etc.)
// This implementation uses a simple in-memory Map with automatic cleanup

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  lastAttempt: number;
  blocked: boolean;
  blockExpiry: number;
}

// In-memory store (resets on server restart - use Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configurations
export const RATE_LIMITS = {
  // Login attempts: 5 per 15 minutes per IP
  LOGIN: {
    maxAttempts: process.env.NODE_ENV === "development" ? 500 : 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 60 * 60 * 1000, // 1 hour block after exceeding
  },
  // Registration: 3 per hour per IP
  REGISTER: {
    maxAttempts: process.env.NODE_ENV === "development" ? 500 : 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    blockDurationMs: 24 * 60 * 60 * 1000, // 24 hour block
  },
  // Password reset: 3 per hour per email
  PASSWORD_RESET: {
    maxAttempts: process.env.NODE_ENV === "development" ? 500 : 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    blockDurationMs: 24 * 60 * 60 * 1000, // 24 hour block
  },
  // Google OAuth: 10 per 15 minutes per IP
  OAUTH: {
    maxAttempts: process.env.NODE_ENV === "development" ? 500 : 10,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 30 * 60 * 1000, // 30 minute block
  },
} as const;

type RateLimitType = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
  blocked: boolean;
  blockTimeRemaining?: number;
}

// Generate rate limit key
function generateKey(identifier: string, type: RateLimitType): string {
  return crypto.createHash("sha256").update(`${type}:${identifier}`).digest("hex").slice(0, 32);
}

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.blockExpiry < now || entry.lastAttempt + 24 * 60 * 60 * 1000 < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export async function checkRateLimit(
  identifier: string,
  type: RateLimitType
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[type];
  const key = generateKey(identifier, type);
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  // Check if currently blocked
  if (entry?.blocked) {
    if (entry.blockExpiry > now) {
      return {
        success: false,
        remaining: 0,
        resetTime: entry.blockExpiry,
        blocked: true,
        blockTimeRemaining: entry.blockExpiry - now,
      };
    } else {
      // Block expired, reset
      rateLimitStore.delete(key);
    }
  }

  // Check if window expired
  if (entry && entry.firstAttempt + config.windowMs < now) {
    rateLimitStore.delete(key);
  }

  const currentEntry = rateLimitStore.get(key);

  if (!currentEntry) {
    // First attempt
    rateLimitStore.set(key, {
      attempts: 1,
      firstAttempt: now,
      lastAttempt: now,
      blocked: false,
      blockExpiry: 0,
    });

    return {
      success: true,
      remaining: config.maxAttempts - 1,
      resetTime: now + config.windowMs,
      blocked: false,
    };
  }

  // Increment attempts
  currentEntry.attempts += 1;
  currentEntry.lastAttempt = now;

  // Check if exceeded
  if (currentEntry.attempts >= config.maxAttempts) {
    currentEntry.blocked = true;
    currentEntry.blockExpiry = now + config.blockDurationMs;

    return {
      success: false,
      remaining: 0,
      resetTime: currentEntry.blockExpiry,
      blocked: true,
      blockTimeRemaining: config.blockDurationMs,
    };
  }

  rateLimitStore.set(key, currentEntry);

  return {
    success: true,
    remaining: config.maxAttempts - currentEntry.attempts,
    resetTime: currentEntry.firstAttempt + config.windowMs,
    blocked: false,
  };
}

export async function resetRateLimit(identifier: string, type: RateLimitType): Promise<void> {
  const key = generateKey(identifier, type);
  rateLimitStore.delete(key);
}

// For testing/monitoring
export async function getRateLimitStatus(
  identifier: string,
  type: RateLimitType
): Promise<RateLimitResult | null> {
  const key = generateKey(identifier, type);
  const entry = rateLimitStore.get(key);

  if (!entry) return null;

  const config = RATE_LIMITS[type];
  const now = Date.now();

  return {
    success: !entry.blocked,
    remaining: Math.max(0, config.maxAttempts - entry.attempts),
    resetTime: entry.blocked ? entry.blockExpiry : entry.firstAttempt + config.windowMs,
    blocked: entry.blocked,
    blockTimeRemaining: entry.blocked ? entry.blockExpiry - now : undefined,
  };
}
