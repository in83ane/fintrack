# FinTrack — Flutter mobile and desktop

This is the first native **WebView shell**, not a rewrite of the React screens into Flutter widgets. It loads the deployed FinTrack HTTPS app and uses its existing data/account system. Website releases update the embedded UI without rebuilding the native shell.

Targets: Android, iOS, Windows and macOS. No store publication is configured. Native UI migration can happen screen by screen later; the web API remains the shared backend.

## Current behavior

- Responsive website inside the platform WebView, with native back/reload/browser controls.
- Safe areas, Android back navigation, same-origin navigation and external browser links.
- Persistent WebView session; Windows stores WebView2 data in the user's application support folder.
- Network/load failures have a retry action. Financial data is not copied into a separate offline cache.
- App icons and names are configured for all four platforms.

## Verify and run

Install Flutter stable (validated here with Flutter 3.47.9 / Dart 3.13.7), then:

```sh
cd apps/fintrack_flutter
flutter pub get
flutter analyze
flutter test
flutter devices
flutter run -d <device-id>
```

By default this opens `https://fintrackinvest.vercel.app/dashboard`. To test a separate HTTPS deployment:

```sh
flutter run --dart-define=FINTRACK_URL=https://your-preview.example/dashboard
```

Do not put tokens, passwords or service keys in build flags. The native package contains no server credentials.

## Android through USB

Install Android Studio/SDK and a compatible JDK, run `flutter doctor`, then accept the Android SDK licenses with `flutter doctor --android-licenses`. Enable Developer options and USB debugging on the phone; authorize the connected computer.

```sh
flutter devices
flutter run -d <android-device-id>
# Or create a directly installable development APK:
flutter build apk --debug
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

The generated release configuration currently uses Flutter's debug signing key, for private testing only. Before distributing release APKs, configure a dedicated keystore outside source control. Do not uninstall to update if you want to keep the app session.

## iPhone through USB (requires a Mac)

Install Xcode and its iOS tools, Flutter, and CocoaPods. Connect the iPhone, trust the Mac, and enable Developer Mode on the iPhone. Run `flutter pub get`, open `ios/Runner.xcworkspace`, select Runner → Signing & Capabilities → your Apple development team and a unique bundle identifier. Select the connected phone and run from Xcode, or:

```sh
flutter devices
flutter run -d <iphone-device-id>
```

No App Store submission is necessary for development installation. Apple signing/provisioning is still required, and development installs may expire. The project intentionally contains no signing team or certificates. Windows cannot produce or sign an iOS/macOS build.

## Windows

Install Visual Studio with Desktop development with C++, a Windows SDK, NuGet CLI on PATH, and Microsoft Edge WebView2 Runtime. Enable Windows Developer Mode for Flutter plugin symlinks. Then:

```sh
flutter build windows --release
```

Run `build/windows/x64/runner/Release/fintrack_app.exe`. Distribute the **entire Release directory**, including DLLs and `data`, not just the executable. The package is not code-signed.

Use a short checkout path, e.g. `C:\ft-app`, if MSBuild reports a missing `.tlog` path: dependency target names can exceed Windows path limits in deep workspaces. A narrowly scoped CMake definition currently accommodates the WebView plugin's older coroutine adapter on MSVC 14.51; remove when the upstream plugin migrates.

## macOS

On a Mac with Xcode, Flutter and CocoaPods:

```sh
flutter pub get
flutter build macos --release
open build/macos/Build/Products/Release/FinTrack.app
```

Outgoing-network sandbox entitlements are included. Developer signing/notarization for distribution is not configured. Testing locally and shipping to other Macs have different signing requirements.

## Device checks still required before general use

- Email/password login, relaunch/session persistence, logout and account switching on each target.
- **Google OAuth on macOS/iOS (1.1.0):** uses Apple's ASWebAuthenticationSession and returns a single-use code to the app. The app validates state and its PKCE challenge, then exchanges the code using its own HttpOnly verifier cookie. No session tokens enter the platform channel or JavaScript. The deployed website must include the matching native start/callback support. Verify account selection, cancellation, relaunch, and logout on a physical device. Android/Windows Google handoff is not implemented yet.
- Excel/PDF file selection, native export/download saving, keyboard behavior, screen reader and physical touch testing. Downloads currently offer to open the page in the browser; the browser may require a separate login. Blob exports are not saved natively yet.
- Native push, biometrics, offline financial edits, deep links and automatic native binary updates are not implemented.
- iOS/macOS builds and physical-device behavior must be verified on Apple hardware; the Windows build does not prove them.

## Next native work

Extend system-browser OAuth to Android/Windows, then native file import/export with explicit user file selection. After those are verified, decide which screens need Flutter widgets instead of the shared web UI. Keep the website and native shell independently deployable.

References: [Flutter iOS setup](https://docs.flutter.dev/platform-integration/ios/setup), [Flutter Windows setup](https://docs.flutter.dev/platform-integration/windows/setup), [WebView plugin platform setup](https://inappwebview.dev/docs/intro/).
