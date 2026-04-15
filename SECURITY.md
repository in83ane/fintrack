# FinTrack Security Implementation

This document describes the security measures implemented in the FinTrack authentication system.

## Overview

The authentication system implements defense-in-depth security with multiple layers of protection against common web vulnerabilities and attacks.

## Security Features

### 1. CSRF Protection

All authentication actions require a valid CSRF token:
- Tokens are generated server-side using cryptographically secure random bytes
- Tokens are stored in `httpOnly`, `sameSite=strict` cookies
- Tokens are validated on every mutation action (sign in, sign up, password reset)
- Timing-safe comparison prevents timing attacks

### 2. Rate Limiting

Multiple rate limiting strategies protect against brute force attacks:

| Action | Max Attempts | Window | Block Duration |
|--------|-------------|--------|----------------|
| Login | 5 | 15 minutes | 1 hour |
| Registration | 3 | 1 hour | 24 hours |
| Password Reset | 3 | 1 hour | 24 hours |
| OAuth | 10 | 15 minutes | 30 minutes |

**Implementation Notes:**
- Current implementation uses in-memory storage (resets on server restart)
- For production, migrate to Redis (Upstash, Redis Cloud, etc.)
- Rate limits are applied by IP + device fingerprint for auth endpoints

### 3. Password Security

- **Minimum Requirements:** 8 characters, uppercase, lowercase, number, special character
- **Real-time Strength Indicator:** Visual feedback during registration
- **Immediate Clearing:** Password cleared from memory after failed attempts
- **Secure Auto-complete:** Uses `new-password` / `current-password` autocomplete hints
- **No Plain Text:** Passwords never logged or stored in plain text

### 4. Honeypot Protection

Invisible honeypot field (`name="website"`) detects bot submissions:
- Field is hidden via CSS and `tabIndex={-1}`
- Legitimate users never fill this field
- Any submission with value triggers silent rejection and audit logging

### 5. User Enumeration Prevention

Generic error messages prevent attackers from determining valid emails:
- Login: "Invalid email or password" (same for invalid email vs wrong password)
- Password Reset: "If this email exists, we'll send a reset link" (even if not found)
- Registration: Indicates if email exists but suggests sign in instead

### 6. Account Lockout

Client-side and server-side lockout after failed attempts:
- 5 failed attempts = 15-minute lockout
- Prevents brute force password guessing
- Timer displayed to user with countdown

### 7. Device Fingerprinting

Tracks device characteristics for security monitoring:
- Screen resolution, timezone, language, platform
- Combined with IP for rate limiting
- Used for audit logging

### 8. Security Headers

Comprehensive security headers via middleware:
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-XSS-Protection: 1; mode=block` - XSS filter
- `Strict-Transport-Security` - HSTS (1 year)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` - Restricts browser features
- `Cross-Origin-*` - Various CORS protections
- `Content-Security-Policy` - CSP with nonce

### 9. Session Security

- **httpOnly Cookies:** JavaScript cannot access session tokens
- **sameSite=strict:** CSRF protection for cookies
- **Secure Flag:** HTTPS-only in production
- **Short-lived:** 24-hour session expiration
- **Refresh Tokens:** Automatic rotation via Supabase

### 10. Audit Logging

All authentication events are logged:
- Success/failure status
- IP address and user agent
- Device fingerprint
- Metadata (user ID, error types, etc.)
- Timestamps

Log entries are masked (email partially hidden) and sent to console. For production, integrate with:
- Logtail
- Datadog
- Splunk
- Custom logging service

### 11. Input Sanitization

All user inputs are sanitized:
- Email: Lowercase, trimmed, whitespace removed
- Strings: XSS prevention (removes `<`, `>`)
- Length limits enforced

### 12. OAuth Security

Google OAuth implementation includes:
- State parameter validation (CSRF)
- PKCE (handled by Supabase)
- Secure redirect handling
- Code exchange server-side

## Environment Variables

Required environment variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Application
NEXT_PUBLIC_APP_URL=https://your-domain.com
NODE_ENV=production
```

**Important:** Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client!

## Security Checklist for Production

### Before Deploying

- [ ] Set `NODE_ENV=production`
- [ ] Configure proper `NEXT_PUBLIC_APP_URL`
- [ ] Enable HTTPS (required for secure cookies)
- [ ] Set up Redis for rate limiting (replace in-memory store)
- [ ] Configure external audit logging service
- [ ] Review CSP policy in middleware.ts
- [ ] Test all security headers
- [ ] Verify cookie settings (httpOnly, sameSite, secure)

### Regular Maintenance

- [ ] Monitor audit logs for suspicious activity
- [ ] Review failed login attempt patterns
- [ ] Update dependencies regularly
- [ ] Rotate Supabase service role key periodically
- [ ] Review and update rate limit thresholds

## Attack Prevention

| Attack Vector | Mitigation |
|--------------|------------|
| Brute Force | Rate limiting + account lockout |
| CSRF | CSRF tokens + SameSite cookies |
| XSS | CSP + input sanitization |
| Clickjacking | X-Frame-Options: DENY |
| Session Hijacking | httpOnly + secure + sameSite cookies |
| User Enumeration | Generic error messages |
| Bot Registration | Honeypot field + rate limiting |
| Credential Stuffing | Rate limiting + device fingerprinting |
| Timing Attacks | Constant-time token comparison |
| MIME Sniffing | X-Content-Type-Options |

## Production Migration Checklist

1. **Rate Limiting:** Replace `src/lib/ratelimit.ts` in-memory store with Redis
2. **Audit Logging:** Connect `createAuditLog` to external service
3. **Session Store:** Configure Redis for session persistence
4. **Monitoring:** Set up alerts for suspicious activity
5. **Database:** Enable row-level security (RLS) in Supabase
6. **Backups:** Configure automated database backups

## Security Contacts

For security concerns or vulnerability reports, please contact the development team.

---

**Last Updated:** 2026-04-11
**Version:** 1.0.0
