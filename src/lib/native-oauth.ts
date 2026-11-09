// Only a short-lived authorization code crosses the native callback. The PKCE
// verifier and resulting session tokens remain in the app's HttpOnly cookies.
export const NATIVE_OAUTH_COOKIE = 'fintrack-native-return';
export const NATIVE_OAUTH_SCHEME = 'app.fintrack.oauth';
export const isOAuthNonce = (value: string | null): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

export function nativeCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: 'lax' as const, path: '/auth/callback', maxAge: 600 };
}

export function nativeBrowserStart(origin: string, authorizationUrl: string) {
  const authorization = new URL(authorizationUrl);
  const challenge = authorization.searchParams.get('code_challenge');
  if (!isOAuthNonce(challenge) || authorization.searchParams.get('code_challenge_method') !== 's256') {
    throw new Error('Native OAuth requires S256 PKCE');
  }
  const start = new URL('/auth/native/start', origin);
  start.searchParams.set('challenge', challenge);
  return start.toString();
}

export function nativeCallback(state: string, params: URLSearchParams) {
  if (!isOAuthNonce(state)) throw new Error('Invalid native OAuth state');
  const callback = new URL(`${NATIVE_OAUTH_SCHEME}://auth/callback`);
  callback.searchParams.set('state', state);
  const code = params.get('code');
  if (params.has('error') || params.getAll('code').length !== 1 || !code ||
      !/^[A-Za-z0-9._~-]{1,2048}$/.test(code)) {
    callback.searchParams.set('error', 'oauth_failed');
  } else {
    callback.searchParams.set('code', code);
  }
  return callback;
}
