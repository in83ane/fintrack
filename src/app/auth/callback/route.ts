import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/src/lib/env';
import { oauthAuthOptions, OAUTH_VERIFIER_COOKIE } from '@/src/lib/oauth-pkce';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const store = await cookies();
  const auth = oauthAuthOptions(store, process.env.NODE_ENV === 'production');
  const fail = (reason: string) => {
    auth.storage.removeItem(OAUTH_VERIFIER_COOKIE);
    // Empty fragment prevents inheriting an old implicit-flow token hash.
    const response = NextResponse.redirect(new URL(`/login?error=${reason}#`, request.url));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
  if (params.has('error')) return fail('oauth_failed');
  const code = params.get('code');
  if (!code) return fail('missing_code');
  if (!store.get(OAUTH_VERIFIER_COOKIE)?.value) return fail('oauth_expired');

  try {
    // Supabase validates provider state; the code must match this browser's
    // one-time PKCE verifier. No separate provider state is expected here.
    const client = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth,
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) },
    });
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error || !data.session || !data.user) return fail('session_exchange_failed');
    const cookieOptions = {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const, path: '/', maxAge: 24 * 60 * 60,
    };
    // Existing session contract consumed by middleware and AppContext.
    store.set('session', data.session.access_token, cookieOptions);
    store.set('refresh_token', data.session.refresh_token, cookieOptions);
    auth.storage.removeItem(OAUTH_VERIFIER_COOKIE);
    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return fail('session_exchange_failed');
  }
}
