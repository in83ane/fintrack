import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseUrl } from '@/src/lib/env';
import { isOAuthNonce, NATIVE_OAUTH_COOKIE, nativeCookieOptions } from '@/src/lib/native-oauth';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const challenge = params.get('challenge');
  const state = params.get('state');
  if (!isOAuthNonce(challenge) || !isOAuthNonce(state) ||
      params.getAll('challenge').length !== 1 || params.getAll('state').length !== 1) {
    return new NextResponse('Invalid authentication request', { status: 400,
      headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }
  // This cookie belongs to the system auth browser, not the application's
  // WebView. Keep the already allowlisted HTTPS Supabase redirect unchanged.
  (await cookies()).set(NATIVE_OAUTH_COOKIE, state,
    nativeCookieOptions(process.env.NODE_ENV === 'production'));
  const authorization = new URL('/auth/v1/authorize', getSupabaseUrl());
  authorization.searchParams.set('provider', 'google');
  authorization.searchParams.set('redirect_to', new URL('/auth/callback', request.url).toString());
  authorization.searchParams.set('code_challenge', challenge);
  authorization.searchParams.set('code_challenge_method', 's256');
  const response = NextResponse.redirect(authorization, 302);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
