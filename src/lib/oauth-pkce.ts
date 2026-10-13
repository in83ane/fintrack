// Server-only use: this adapter persists the verifier, never session tokens.
export const OAUTH_STORAGE_KEY = 'fintrack-oauth';
export const OAUTH_VERIFIER_COOKIE = `${OAUTH_STORAGE_KEY}-code-verifier`;
type CookieOptions = { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; maxAge: number };
type CookieStore = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: CookieOptions): unknown;
};
export function oauthAuthOptions(store: CookieStore, secure: boolean) {
  const options: CookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 600 };
  return {
    flowType: 'pkce' as const, storageKey: OAUTH_STORAGE_KEY,
    autoRefreshToken: false, persistSession: true, detectSessionInUrl: false,
    storage: {
      getItem: (key: string) => key === OAUTH_VERIFIER_COOKIE ? store.get(key)?.value ?? null : null,
      setItem: (key: string, value: string) => {
        if (key === OAUTH_VERIFIER_COOKIE) store.set(key, value, options);
      },
      removeItem: (key: string) => {
        if (key === OAUTH_VERIFIER_COOKIE) store.set(key, '', { ...options, maxAge: 0 });
      },
    },
  };
}
// In addition to the Server Action's Origin/Host and CSRF checks.
export function oauthRequestOrigin(origin: string | null, host: string | null) {
  if (!origin || !host) throw new Error('Missing OAuth request origin');
  const url = new URL(origin);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.host !== host || url.username || url.password ||
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('Invalid OAuth request origin');
  }
  return url.origin;
}
