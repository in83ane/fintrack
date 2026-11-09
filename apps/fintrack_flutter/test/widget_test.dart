import 'package:flutter_test/flutter_test.dart';
import 'package:fintrack_app/navigation_policy.dart';

void main() {
  final start = appStartUri('https://fintrackinvest.vercel.app/dashboard');
  test('keeps same-origin routes inside the app', () {
    expect(
      navigationTarget(
        Uri.parse('https://fintrackinvest.vercel.app/ledger'),
        start,
      ),
      NavigationTarget.internal,
    );
    expect(
      navigationTarget(
        Uri.parse('https://fintrackinvest.vercel.app/login'),
        start,
      ),
      NavigationTarget.internal,
    );
  });
  test('external domains and ports use the system browser', () {
    for (final url in [
      'https://example.com',
      'https://fintrackinvest.vercel.app.example.com',
      'https://fintrackinvest.vercel.app:444',
      'mailto:hello@example.com',
    ]) {
      expect(
        navigationTarget(Uri.parse(url), start),
        NavigationTarget.external,
      );
    }
  });
  test('rejects insecure app URLs and non-web navigation', () {
    expect(() => appStartUri('http://example.com'), throwsFormatException);
    expect(() => appStartUri('/dashboard'), throwsFormatException);
    expect(
      navigationTarget(Uri.parse('http://fintrackinvest.vercel.app'), start),
      NavigationTarget.blocked,
    );
    expect(
      navigationTarget(Uri.parse('intent://anything'), start),
      NavigationTarget.blocked,
    );
  });
}
