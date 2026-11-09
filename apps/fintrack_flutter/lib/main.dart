import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import 'navigation_policy.dart';

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
  const FinTrackBrowser({super.key});
  @override
  State<FinTrackBrowser> createState() => _FinTrackBrowserState();
}

class _FinTrackBrowserState extends State<FinTrackBrowser> {
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
          'FinTrack',
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
                webViewEnvironment: _environment,
                initialUrlRequest: URLRequest(url: WebUri(_start.toString())),
                initialSettings: InAppWebViewSettings(
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
                onWebViewCreated: (controller) => _controller = controller,
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
