import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';

const nativeOAuthScheme = 'app.fintrack.oauth';
final _noncePattern = RegExp(r'^[A-Za-z0-9_-]{43}$');

String createOAuthState() => base64Url
    .encode(List<int>.generate(32, (_) => Random.secure().nextInt(256)))
    .replaceAll('=', '');

bool matchesAppVerifier(Uri start, String cookieValue) {
  try {
    final verifier = jsonDecode(Uri.decodeComponent(cookieValue));
    if (verifier is! String ||
        !RegExp(r'^[A-Za-z0-9._~-]{43,128}$').hasMatch(verifier)) {
      return false;
    }
    final challenge = base64Url
        .encode(sha256.convert(utf8.encode(verifier)).bytes)
        .replaceAll('=', '');
    return start.queryParameters['challenge'] == challenge;
  } catch (_) {
    return false;
  }
}

Uri nativeAuthStart(String value, Uri app, String state) {
  final uri = Uri.parse(value);
  if (uri.scheme != 'https' ||
      uri.origin != app.origin ||
      uri.userInfo.isNotEmpty ||
      uri.path != '/auth/native/start' ||
      uri.fragment.isNotEmpty ||
      !_noncePattern.hasMatch(state) ||
      uri.queryParametersAll.length != 1 ||
      uri.queryParametersAll['challenge']?.length != 1 ||
      !_noncePattern.hasMatch(uri.queryParameters['challenge'] ?? '')) {
    throw const FormatException('Invalid native authentication URL');
  }
  return uri.replace(queryParameters: {...uri.queryParameters, 'state': state});
}

Uri nativeAuthCallback(String value, Uri app, String state) {
  final uri = Uri.parse(value);
  if (uri.scheme != nativeOAuthScheme ||
      uri.host != 'auth' ||
      uri.path != '/callback' ||
      uri.userInfo.isNotEmpty ||
      uri.hasPort ||
      uri.fragment.isNotEmpty ||
      uri.queryParametersAll['state']?.length != 1 ||
      uri.queryParameters['state'] != state ||
      !_noncePattern.hasMatch(state)) {
    throw const FormatException('Invalid native authentication callback');
  }
  if (uri.queryParameters.containsKey('error')) {
    throw const FormatException('Authentication was not completed');
  }
  final code = uri.queryParameters['code'];
  if (uri.queryParametersAll['code']?.length != 1 ||
      code == null ||
      !RegExp(r'^[A-Za-z0-9._~-]{1,2048}$').hasMatch(code)) {
    throw const FormatException('Missing authentication code');
  }
  // Only the app's own HTTPS callback receives this code. Session tokens
  // never cross the platform channel or enter JavaScript.
  return app.resolve('/auth/callback').replace(queryParameters: {'code': code});
}
