import Flutter
import UIKit
import AuthenticationServices

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate, ASWebAuthenticationPresentationContextProviding {
  private var authSession: ASWebAuthenticationSession?
  private var authChannel: FlutterMethodChannel?
  private var authWindow: UIWindow?

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    return authWindow!
  }

  private func authenticate(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    if call.method == "isAvailable" { result(true); return }
    guard call.method == "authenticate" else {
      result(FlutterMethodNotImplemented)
      return
    }
    guard authSession == nil,
          let arguments = call.arguments as? [String: Any],
          let value = arguments["url"] as? String,
          let url = URL(string: value), url.scheme == "https",
          url.host != nil, url.user == nil, url.password == nil,
          url.path == "/auth/native/start",
          let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .filter({ $0.activationState == .foregroundActive })
            .flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) else {
      result(FlutterError(code: "INVALID_REQUEST", message: "Cannot start authentication", details: nil))
      return
    }
    authWindow = window
    let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "app.fintrack.oauth") { [weak self] callback, error in
      DispatchQueue.main.async {
        self?.authSession = nil
        if let callback = callback {
          result(callback.absoluteString)
        } else {
          let cancelled = (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
          result(FlutterError(code: cancelled ? "CANCELLED" : "AUTH_FAILED",
                              message: cancelled ? "Sign-in cancelled" : "Sign-in failed", details: nil))
        }
      }
    }
    session.presentationContextProvider = self
    session.prefersEphemeralWebBrowserSession = false
    authSession = session
    if !session.start() {
      authSession = nil
      result(FlutterError(code: "AUTH_FAILED", message: "Could not open sign-in", details: nil))
    }
  }

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let channel = FlutterMethodChannel(name: "app.fintrack/auth", binaryMessenger: engineBridge.applicationRegistrar.messenger())
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else { return }
      self.authenticate(call, result: result)
    }
    authChannel = channel
  }
}
