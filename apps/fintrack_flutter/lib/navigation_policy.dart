/// Keep the authenticated website inside the app. External pages use the OS browser.
enum NavigationTarget { internal, external, blocked }

Uri appStartUri(String value) {
  final uri = Uri.tryParse(value);
  if (uri == null ||
      uri.scheme != 'https' ||
      uri.host.isEmpty ||
      uri.userInfo.isNotEmpty) {
    throw const FormatException(
      'FINTRACK_URL must be an HTTPS URL without credentials.',
    );
  }
  return uri;
}

NavigationTarget navigationTarget(Uri uri, Uri start) {
  if (uri.scheme == 'https' &&
      uri.origin == start.origin &&
      uri.userInfo.isEmpty) {
    return NavigationTarget.internal;
  }
  if (uri.scheme == 'https' || uri.scheme == 'mailto' || uri.scheme == 'tel') {
    return NavigationTarget.external;
  }
  return NavigationTarget.blocked;
}
