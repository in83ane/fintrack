type AuthReply = { status: string };
export type NativeAuthBridge = {
  callHandler(name: string, ...args: string[]): Promise<unknown>;
};
type NativeWindow = {
  flutter_inappwebview?: NativeAuthBridge;
  __fintrackNative?: { version: string };
};

export async function getNativeAuthBridge(host: NativeWindow, timeoutMs = 2000): Promise<NativeAuthBridge | null> {
  const bridge = host.flutter_inappwebview;
  if (!bridge && !host.__fintrackNative) return null; // Ordinary website.
  if (!bridge || typeof bridge.callHandler !== 'function') throw new Error('NATIVE_APP_UPDATE_REQUIRED');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const capabilities = await Promise.race([
      bridge.callHandler('fintrackCapabilities'),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('NATIVE_APP_UPDATE_REQUIRED')), timeoutMs);
      }),
    ]) as { nativeGoogle?: boolean } | null;
    if (capabilities?.nativeGoogle !== true) throw new Error('NATIVE_APP_UPDATE_REQUIRED');
    return bridge;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function signInWithNativeBridge(bridge: NativeAuthBridge, url: string): Promise<AuthReply> {
  const reply = await bridge.callHandler('fintrackGoogleAuth', url) as AuthReply | null;
  if (!reply || !['success', 'cancelled'].includes(reply.status)) throw new Error('NATIVE_OAUTH_FAILED');
  return reply;
}
