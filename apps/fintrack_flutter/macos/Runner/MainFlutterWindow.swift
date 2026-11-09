import Cocoa
import FlutterMacOS
import AuthenticationServices

class MainFlutterWindow: NSWindow, ASWebAuthenticationPresentationContextProviding {
  private var authSession: ASWebAuthenticationSession?
  private var authChannel: FlutterMethodChannel?

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    return self
  }

  private func authenticate(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard call.method == "authenticate" else {
      result(FlutterMethodNotImplemented)
      return
    }
    guard authSession == nil,
          let arguments = call.arguments as? [String: Any],
          let value = arguments["url"] as? String,
          let url = URL(string: value), url.scheme == "https",
          url.host != nil, url.user == nil, url.password == nil,
          url.path == "/auth/native/start" else {
      result(FlutterError(code: "INVALID_REQUEST", message: "Cannot start authentication", details: nil))
      return
    }
    let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "app.fintrack.oauth") { [weak self] callback, error in
      DispatchQueue.main.async {
        self?.authSession = nil
        NSApp.activate(ignoringOtherApps: true)
        self?.makeKeyAndOrderFront(nil)
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

  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)

    RegisterGeneratedPlugins(registry: flutterViewController)
    let channel = FlutterMethodChannel(name: "app.fintrack/auth", binaryMessenger: flutterViewController.engine.binaryMessenger)
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else { return }
      self.authenticate(call, result: result)
    }
    authChannel = channel

    super.awakeFromNib()
  }
}
