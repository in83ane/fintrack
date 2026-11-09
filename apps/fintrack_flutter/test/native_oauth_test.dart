import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fintrack_app/native_oauth.dart';

void main() {
  final app = Uri.parse('https://fintrackinvest.vercel.app/dashboard');
  final state = 's' * 43;
  final verifier = 'v' * 64;
  final challenge = base64Url
      .encode(sha256.convert(utf8.encode(verifier)).bytes)
      .replaceAll('=', '');
  final start = '${app.origin}/auth/native/start?challenge=$challenge';
  test(
    'legacy web navigation is captured and cannot open a normal browser tab',
    () {
      final provider = Uri.https(nativeProviderHost, '/auth/v1/authorize', {
        'provider': 'google',
        'code_challenge': challenge,
        'code_challenge_method': 's256',
        'redirect_to': app.resolve('/auth/callback').toString(),
      });
      expect(isGoogleProviderNavigation(provider), isTrue);
      expect(nativeStartFromProvider(provider, app).toString(), start);
      for (final invalid in [
        provider.replace(scheme: 'http'),
        provider.replace(host: 'evil.example'),
        provider.replace(
          queryParameters: {
            ...provider.queryParameters,
            'redirect_to': 'https://evil.example/auth/callback',
          },
        ),
        provider.replace(
          queryParameters: {
            ...provider.queryParameters,
            'code_challenge_method': 'plain',
          },
        ),
      ]) {
        expect(
          () => nativeStartFromProvider(invalid, app),
          throwsFormatException,
        );
      }
    },
  );
  test('native flow binds challenge to the HttpOnly app verifier', () {
    final uri = nativeAuthStart(start, app, state);
    expect(uri.queryParameters['state'], state);
    expect(
      matchesAppVerifier(uri, Uri.encodeComponent(jsonEncode(verifier))),
      isTrue,
    );
    expect(matchesAppVerifier(uri, jsonEncode('x' * 64)), isFalse);
    expect(matchesAppVerifier(uri, 'broken'), isFalse);
    expect(createOAuthState(), matches(RegExp(r'^[A-Za-z0-9_-]{43}$')));
    expect(createOAuthState(), isNot(createOAuthState()));
  });
  test('only valid same-origin starts are accepted', () {
    for (final value in [
      start.replaceFirst('https:', 'http:'),
      start.replaceFirst(app.host, 'evil.example'),
      start.replaceFirst('/auth/native/start', '/login'),
      '$start&challenge=$challenge',
      '$start#fragment',
      '$start&state=$state',
    ]) {
      expect(() => nativeAuthStart(value, app, state), throwsFormatException);
    }
  });
  test('callback binds state and returns only the code to app origin', () {
    final callback =
        '$nativeOAuthScheme://auth/callback?state=$state&code=once-only';
    expect(
      nativeAuthCallback(callback, app, state).toString(),
      '${app.origin}/auth/callback?code=once-only',
    );
    for (final value in [
      callback.replaceFirst(state, 'x' * 43),
      callback.replaceFirst('://auth/', '://evil/'),
      '$callback&code=duplicate',
      '$callback&error=access_denied',
      '$callback#access_token=secret',
      callback.replaceFirst('once-only', '%0A'),
      callback.replaceFirst('://auth/', '://user@auth/'),
    ]) {
      expect(
        () => nativeAuthCallback(value, app, state),
        throwsFormatException,
      );
    }
  });
}
