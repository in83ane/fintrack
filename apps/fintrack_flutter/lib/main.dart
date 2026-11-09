import 'dart:io';
import 'dart:async';
import 'dart:collection';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import 'navigation_policy.dart';
import 'native_oauth.dart';

const _background = Color(0xff0f1013);
const _url = String.fromEnvironment(
  'FINTRACK_URL',
  defaultValue: 'https://fintrackinvest.vercel.app/dashboard',
);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: _background,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );
  runApp(const FinTrackApp());
}

class FinTrackApp extends StatelessWidget {
  const FinTrackApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'FinTrack',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xff4edea3),
        brightness: Brightness.dark,
      ),
      scaffoldBackgroundColor: _background,
    ),
    home: const FinTrackBrowser(),
  );
}

class FinTrackBrowser extends StatefulWidget {
  const FinTrackBrowser({super.key, this.onWebViewReady});
  final ValueChanged<InAppWebViewController>? onWebViewReady;
  @override
  State<FinTrackBrowser> createState() => _FinTrackBrowserState();
}

class _FinTrackBrowserState extends State<FinTrackBrowser> {
  static const _authChannel = MethodChannel('app.fintrack/auth');
  bool _authPending = false;
  InAppWebViewController? _controller;
  WebViewEnvironment? _environment;
  Uri? _start;
  Uri? _current;
  bool _ready = false, _canGoBack = false;
  double _progress = 0;
  String? _problem;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    try {
      _start = appStartUri(_url);
      _current = _start;
      if (Platform.isWindows) {
        if (await WebViewEnvironment.getAvailableVersion() == null) {
          throw StateError('WebView2 Runtime is unavailable.');
        }
        final support = await getApplicationSupportDirectory();
        final data = Directory('${support.path}/WebView2');
        await data.create(recursive: true);
        _environment = await WebViewEnvironment.create(
          settings: WebViewEnvironmentSettings(userDataFolder: data.path),
        );
      }
      if (Platform.isAndroid) {
        await InAppWebViewController.setWebContentsDebuggingEnabled(kDebugMode);
      }
      if (mounted) {
        setState(() {
          _ready = true;
          _problem = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _problem = Platform.isWindows
              ? 'Could not start the app. Check that Microsoft Edge WebView2 Runtime is installed.'
              : 'Could not start the app. Check the app configuration and try again.',
        );
      }
    }
  }

  Future<void> _syncHistory(InAppWebViewController controller) async {
    final back = await controller.canGoBack();
    if (mounted) setState(() => _canGoBack = back);
  }

  Future<Map<String, String>> _googleAuth(List<dynamic> arguments) async {
    if (_authPending ||
        !(Platform.isMacOS || Platform.isIOS) ||
        arguments.length != 1 ||
        arguments.first is! String ||
        _start == null) {
      return {'status': 'error'};
    }
    final current = await _controller?.getUrl();
    final uri = Uri.tryParse(current?.toString() ?? '');
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.origin != _start!.origin ||
        uri.path != '/login') {
      return {'status': 'error'};
    }
    _authPending = true;
    try {
      final state = createOAuthState();
      final start = nativeAuthStart(arguments.first as String, _start!, state);
      final verifier = await CookieManager.instance().getCookie(
        url: WebUri(_start!.origin),
        name: 'fintrack-oauth-code-verifier',
      );
      if (verifier == null || !matchesAppVerifier(start, verifier.value)) {
        return {'status': 'error'};
      }
      final callback = await _authChannel.invokeMethod<String>('authenticate', {
        'url': start.toString(),
      });
      if (callback == null) return {'status': 'cancelled'};
      final target = nativeAuthCallback(callback, _start!, state);
      await _controller?.loadUrl(
        urlRequest: URLRequest(url: WebUri(target.toString())),
      );
      return {'status': 'success'};
    } on PlatformException catch (error) {
      return {'status': error.code == 'CANCELLED' ? 'cancelled' : 'error'};
    } catch (_) {
      return {'status': 'error'};
    } finally {
      _authPending = false;
    }
  }

  Future<void> _interceptGoogle(Uri provider) async {
    try {
      final start = nativeStartFromProvider(provider, _start!);
      final result = await _googleAuth([start.toString()]);
      if (result['status'] == 'error') {
        throw const FormatException('Native sign-in failed');
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Could not start Google sign-in. Reload FinTrack and try again.',
            ),
          ),
        );
      }
    }
  }

  Future<void> _openExternal(Uri uri) async {
    try {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
    } catch (_) {
      /* Report a recoverable failure below. */
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not open the browser. Please try again.'),
        ),
      );
    }
  }

  Future<void> _retry() async {
    setState(() {
      _problem = null;
      _progress = 0;
    });
    if (!_ready) {
      await _initialize();
      return;
    }
    await _controller?.loadUrl(
      urlRequest: URLRequest(url: WebUri((_current ?? _start!).toString())),
    );
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_canGoBack,
    onPopInvokedWithResult: (didPop, result) {
      if (!didPop) _controller?.goBack();
    },
    child: Scaffold(
      appBar: AppBar(
        backgroundColor: _background,
        surfaceTintColor: Colors.transparent,
        toolbarHeight: 44,
        title: const Text(
          'FinTrack · $nativeAppVersion',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        leading: _canGoBack
            ? IconButton(
                tooltip: 'Back',
                onPressed: () => _controller?.goBack(),
                icon: const Icon(Icons.arrow_back, size: 20),
              )
            : null,
        actions: [
          IconButton(
            tooltip: 'Reload',
            onPressed: _retry,
            icon: const Icon(Icons.refresh, size: 20),
          ),
          IconButton(
            tooltip: 'Open in browser',
            onPressed: _current == null ? null : () => _openExternal(_current!),
            icon: const Icon(Icons.open_in_browser, size: 20),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Stack(
          children: [
            if (_ready)
              InAppWebView(
                initialUserScripts: UnmodifiableListView([
                  if (Platform.isMacOS || Platform.isIOS)
                    UserScript(
                      source:
                          "Object.defineProperty(window, '__fintrackNative', {value: Object.freeze({version: '$nativeAppVersion'}), writable: false});",
                      injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
                      forMainFrameOnly: true,
                    ),
                ]),
                webViewEnvironment: _environment,
                initialUrlRequest: URLRequest(url: WebUri(_start.toString())),
                initialSettings: InAppWebViewSettings(
                  applicationNameForUserAgent:
                      Platform.isMacOS || Platform.isIOS
                      ? 'FinTrackNative/1.1'
                      : '',
                  javaScriptEnabled: true,
                  domStorageEnabled: true,
                  useShouldOverrideUrlLoading: true,
                  useOnDownloadStart: true,
                  supportMultipleWindows: true,
                  javaScriptCanOpenWindowsAutomatically: false,
                  isInspectable: kDebugMode,
                  allowsBackForwardNavigationGestures: true,
                  transparentBackground: false,
                ),
                onWebViewCreated: (controller) {
                  _controller = controller;
                  controller.addJavaScriptHandler(
                    handlerName: 'fintrackGoogleAuth',
                    callback: _googleAuth,
                  );
                  controller.addJavaScriptHandler(
                    handlerName: 'fintrackCapabilities',
                    callback: (_) async {
                      if (!(Platform.isMacOS || Platform.isIOS)) {
                        return {'nativeGoogle': false};
                      }
                      try {
                        final available = await _authChannel.invokeMethod<bool>(
                          'isAvailable',
                        );
                        return {
                          'nativeGoogle': available == true,
                          'version': nativeAppVersion,
                        };
                      } catch (_) {
                        return {
                          'nativeGoogle': false,
                          'version': nativeAppVersion,
                        };
                      }
                    },
                  );
                  widget.onWebViewReady?.call(controller);
                },
                onProgressChanged: (_, progress) {
                  if (mounted) setState(() => _progress = progress / 100);
                },
                onLoadStart: (_, url) {
                  if (mounted) {
                    setState(() {
                      _problem = null;
                      _progress = 0;
                    });
                  }
                },
                onLoadStop: (controller, url) async {
                  await _syncHistory(controller);
                },
                onUpdateVisitedHistory: (controller, url, isReload) async {
                  final uri = Uri.tryParse(url.toString());
                  if (uri != null &&
                      navigationTarget(uri, _start!) ==
                          NavigationTarget.internal) {
                    _current = uri;
                  }
                  await _syncHistory(controller);
                },
                shouldOverrideUrlLoading: (controller, action) async {
                  if (!action.isForMainFrame) {
                    return NavigationActionPolicy.ALLOW;
                  }
                  final uri = Uri.tryParse(action.request.url.toString());
                  if (uri == null) return NavigationActionPolicy.CANCEL;
                  if ((Platform.isMacOS || Platform.isIOS) &&
                      isGoogleProviderNavigation(uri)) {
                    unawaited(_interceptGoogle(uri));
                    return NavigationActionPolicy.CANCEL;
                  }
                  final target = navigationTarget(uri, _start!);
                  if (target == NavigationTarget.internal) {
                    return NavigationActionPolicy.ALLOW;
                  }
                  if (target == NavigationTarget.external) {
                    await _openExternal(uri);
                  }
                  return NavigationActionPolicy.CANCEL;
                },
                onCreateWindow: (controller, action) async {
                  final uri = Uri.tryParse(action.request.url.toString());
                  if (uri != null) {
                    if ((Platform.isMacOS || Platform.isIOS) &&
                        isGoogleProviderNavigation(uri)) {
                      unawaited(_interceptGoogle(uri));
                      return false;
                    }
                    final target = navigationTarget(uri, _start!);
                    if (target == NavigationTarget.internal) {
                      await controller.loadUrl(urlRequest: action.request);
                    }
                    if (target == NavigationTarget.external) {
                      await _openExternal(uri);
                    }
                  }
                  return false;
                },
                onReceivedError: (_, request, error) {
                  if (request.isForMainFrame == true && mounted) {
                    setState(
                      () => _problem = 'Could not load FinTrack. Check your connection and retry.',
                    );
                  }
                },
                onReceivedHttpError: (_, request, response) {
                  if (request.isForMainFrame == true &&
                      (response.statusCode ?? 0) >= 500 &&
                      mounted) {
                    setState(
                      () => _problem =
                          'FinTrack is temporarily unavailable. Please retry.',
                    );
                  }
                },
                onDownloadStartRequest: (_, download) {
                  // Native file-saving needs device verification; the browser remains available.
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: const Text(
                          'Export this file from your browser.',
                        ),
                        action: SnackBarAction(
                          label: 'Open',
                          onPressed: () => _openExternal(_current ?? _start!),
                        ),
                      ),
                    );
                  }
                },
              ),
            if (_progress < 1 && _problem == null)
              Align(
                alignment: Alignment.topCenter,
                child: LinearProgressIndicator(
                  value: _progress == 0 ? null : _progress,
                  minHeight: 2,
                ),
              ),
            if (_problem != null)
              ColoredBox(
                color: _background,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.cloud_off_outlined, size: 32),
                        const SizedBox(height: 16),
                        Text(_problem!, textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: _retry,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}
