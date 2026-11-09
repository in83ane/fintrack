import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:fintrack_app/main.dart';
import 'package:fintrack_app/native_oauth.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'real WKWebView reaches the Apple authentication method channel',
    (tester) async {
      InAppWebViewController? controller;
      await tester.pumpWidget(
        MaterialApp(
          home: FinTrackBrowser(onWebViewReady: (value) => controller = value),
        ),
      );
      for (var i = 0; i < 40 && controller == null; i++) {
        await tester.pump(const Duration(milliseconds: 250));
      }
      expect(controller, isNotNull);
      final result = await tester.runAsync(() async {
        for (var i = 0; i < 45; i++) {
          try {
            final ready = await controller!.evaluateJavascript(
              source: "Boolean(window.__fintrackNative && window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function')",
            );
            if (ready == true) {
              return await controller!.callAsyncJavaScript(
                functionBody: "const result = await window.flutter_inappwebview.callHandler('fintrackCapabilities'); return {available: result.nativeGoogle, version: result.version, marker: window.__fintrackNative.version};",
              );
            }
          } catch (_) {
            /* Page navigation can replace the first JavaScript context. */
          }
          await Future<void>.delayed(const Duration(seconds: 1));
        }
        throw StateError('WKWebView did not expose the FinTrack bridge');
      });
      expect(result?.error, isNull);
      expect(result?.value, {
        'available': true,
        'version': nativeAppVersion,
        'marker': nativeAppVersion,
      });
      expect(find.text('FinTrack · $nativeAppVersion'), findsOneWidget);
    },
  );
}
