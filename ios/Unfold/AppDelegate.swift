internal import Expo
import React
import ReactAppDependencyProvider
import Sentry

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Crash reporting comes up BEFORE React Native, so a launch that dies
    // before JavaScript exists — no main.jsbundle (builds 255–260), a native
    // module crash, a hang at start — is recorded on disk and sent on the
    // next launch. Debug builds (simulator, dev client) skip this; there the
    // JavaScript SDK starts native itself, see src/lib/sentry.ts.
#if !DEBUG
    startCrashReporting()
#endif
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    window?.backgroundColor = UIColor(red: 10.0/255.0, green: 10.0/255.0, blue: 10.0/255.0, alpha: 1.0) // #0A0A0A — prevent white flash on startup
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

#if !DEBUG
extension AppDelegate {
  /// Mirrors the privacy posture of `src/lib/sentry.ts`, which ATTACHES to this
  /// instance (`autoInitializeNativeSdk: false`) instead of restarting it — so
  /// every option that only exists natively has to be set here, and the two
  /// files must agree. `src/lib/__tests__/ios-native-sentry-init.test.ts`
  /// pins the values below.
  fileprivate func startCrashReporting() {
    // Hybrid mode: the Cocoa SDK records the app-start and frame measurements
    // for the JavaScript SDK to attach to its own spans, instead of filing
    // transactions of its own.
    PrivateSentrySDKOnly.appStartMeasurementHybridSDKMode = true
    PrivateSentrySDKOnly.framesTrackingMeasurementHybridSDKMode = true
    // What RNSentry's own init would have stamped: this is the React Native
    // flavour of the Cocoa SDK.
    PrivateSentrySDKOnly.setSdkName("sentry.cocoa.react-native", andVersionString: PrivateSentrySDKOnly.getSdkVersionString())

    let info = Bundle.main.infoDictionary
    SentrySDK.start { options in
      // EXPO_PUBLIC_SENTRY_DSN of the production profile in eas.json. A DSN
      // is a public write-only key, not a secret. JavaScript reads the same
      // value from the environment; both sides must point at one project.
      options.dsn = "https://d7dd319bd4190a884d48917fcad1e663@o4511044263673856.ingest.us.sentry.io/4512024787419136"
      options.environment = "production"
      // The release and dist JavaScript reports (expo version and iOS build
      // number), so native and JavaScript events share one release.
      options.releaseName = info?["CFBundleShortVersionString"] as? String
      options.dist = info?["CFBundleVersion"] as? String

      // Release health: sessions, crash-free rate, watchdog (OOM) terminations
      // and app hangs. All are Cocoa's own work and never reach JavaScript.
      options.enableAutoSessionTracking = true
      options.enableWatchdogTerminationTracking = true
      options.enableAppHangTracking = true
      options.maxBreadcrumbs = 50

      // Privacy. Journal entries, family members' names and reflections must
      // never leave the device: no PII, no pixels, no view tree, no replay.
      options.sendDefaultPii = false
      options.attachScreenshot = false
      options.attachViewHierarchy = false
      options.sessionReplay.sessionSampleRate = 0
      options.sessionReplay.onErrorSampleRate = 0
      // Cocoa's automatic breadcrumbs label taps with the view's accessibility
      // identifier and screens with their navigation title, which in this app
      // is the title of something a person wrote. The scrubbed JavaScript
      // trail is synced onto this scope instead, so a native crash report
      // still carries breadcrumbs — just never unscrubbed ones.
      options.enableAutoBreadcrumbTracking = false
      // Failed backend requests are filed from JavaScript (with the URL's
      // query cut off); filing them here too would duplicate every one.
      options.enableCaptureFailedRequests = false
    }
  }
}
#endif

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
