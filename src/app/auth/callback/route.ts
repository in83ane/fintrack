import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { createAuditLog, getClientIP } from "@/src/lib/security";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/src/lib/env";

// ─── OAuth Callback Handler ──────────────────────────────────────────────────
// This route handles the callback from OAuth providers (Google)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const clientIP = await getClientIP();
  const userAgent = (await headers()).get("user-agent") || "unknown";

  // Security: Check for OAuth errors
  if (error) {
    console.error("OAuth error:", error, errorDescription);
    await createAuditLog({
      action: "OAUTH_CALLBACK_ERROR",
      ip: clientIP,
      deviceFingerprint: "unknown",
      userAgent,
      success: false,
      metadata: { error, errorDescription },
    });

    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("error", "oauth_failed");
    return NextResponse.redirect(redirectUrl);
  }

  // Security: Validate state parameter (CSRF protection)
  if (!state) {
    await createAuditLog({
      action: "OAUTH_MISSING_STATE",
      ip: clientIP,
      deviceFingerprint: "unknown",
      userAgent,
      success: false,
      metadata: { reason: "Missing state parameter" },
    });

    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(redirectUrl);
  }

  // Security: Exchange code for session
  if (!code) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const supabase = createClient(
      getSupabaseUrl(),
      getSupabaseAnonKey()
    );

    // Exchange the code for a session
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError || !data.session) {
      console.error("Session exchange error:", exchangeError);
      await createAuditLog({
        action: "OAUTH_EXCHANGE_FAILED",
        ip: clientIP,
        deviceFingerprint: "unknown",
        userAgent,
        success: false,
        metadata: { error: exchangeError?.message },
      });

      const redirectUrl = new URL("/login", request.url);
      redirectUrl.searchParams.set("error", "session_exchange_failed");
      return NextResponse.redirect(redirectUrl);
    }

    // Security: Set secure session cookies
    const cookieStore = await cookies();

    cookieStore.set("session", data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60, // 24 hours
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

    // Security: Log successful OAuth login
    await createAuditLog({
      action: "OAUTH_LOGIN_SUCCESS",
      email: data.user?.email || undefined,
      ip: clientIP,
      deviceFingerprint: "unknown",
      userAgent,
      success: true,
      metadata: {
        userId: data.user?.id,
        provider: data.user?.app_metadata?.provider,
      },
    });

    // Determine redirect URL
    const returnUrl = searchParams.get("returnUrl");
    const redirectPath = returnUrl && returnUrl.startsWith("/") ? returnUrl : "/dashboard";

    // Store user email in a short-lived cookie for the client to pick up
    if (data.user?.email) {
      cookieStore.set("user_email", data.user.email, {
        httpOnly: false, // Client needs to read this
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60, // 1 minute - just enough for the client to pick it up
        path: "/",
      });
    }

    return NextResponse.redirect(new URL(redirectPath, request.url));
  } catch (err) {
    console.error("OAuth callback error:", err);

    await createAuditLog({
      action: "OAUTH_CALLBACK_EXCEPTION",
      ip: clientIP,
      deviceFingerprint: "unknown",
      userAgent,
      success: false,
      metadata: { error: String(err) },
    });

    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("error", "callback_error");
    return NextResponse.redirect(redirectUrl);
  }
}
