import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression: build 259 (1.1.3) crashed on launch before JavaScript ran and
 * Sentry saw nothing, because the native SDK was only ever started from
 * JavaScript. A Release build now starts the Cocoa SDK in AppDelegate.swift
 * before React Native boots, with the same privacy posture as
 * `src/lib/sentry.ts`, and JavaScript attaches to it instead of restarting it.
 */
describe('iOS native-first Sentry init (regression: launch crash with no JS bundle)', () => {
  const root = join(__dirname, '../../..');
  const appDelegate = readFileSync(join(root, 'ios/Unfold/AppDelegate.swift'), 'utf8');
  const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8')) as {
    build: { production: { env: { EXPO_PUBLIC_SENTRY_DSN: string } } };
  };
  const launch = appDelegate.slice(appDelegate.indexOf('didFinishLaunchingWithOptions'));

  it('starts the Cocoa SDK before React Native is created', () => {
    expect(appDelegate).toContain('import Sentry');
    const start = launch.indexOf('startCrashReporting()');
    const reactNative = launch.indexOf('ExpoReactNativeFactory(');
    expect(start).toBeGreaterThan(-1);
    expect(reactNative).toBeGreaterThan(-1);
    expect(start).toBeLessThan(reactNative);
    expect(appDelegate).toContain('SentrySDK.start');
  });

  it('is compiled out of Debug builds, where JavaScript starts native itself', () => {
    expect(launch).toMatch(/#if !DEBUG\s*\n\s*startCrashReporting\(\)\s*\n\s*#endif/);
  });

  it('uses the production DSN from eas.json and labels the environment production', () => {
    const dsn = eas.build.production.env.EXPO_PUBLIC_SENTRY_DSN;
    expect(dsn).toMatch(/^https:\/\/.+@.+\.ingest\..*sentry\.io\/\d+$/);
    expect(appDelegate).toContain(`options.dsn = "${dsn}"`);
    expect(appDelegate).toContain('options.environment = "production"');
  });

  it('keeps the privacy posture of src/lib/sentry.ts on the native side', () => {
    expect(appDelegate).toContain('options.sendDefaultPii = false');
    expect(appDelegate).toContain('options.attachScreenshot = false');
    expect(appDelegate).toContain('options.attachViewHierarchy = false');
    expect(appDelegate).toContain('options.sessionReplay.sessionSampleRate = 0');
    expect(appDelegate).toContain('options.sessionReplay.onErrorSampleRate = 0');
    // Cocoa's own breadcrumbs label screens with their navigation title.
    expect(appDelegate).toContain('options.enableAutoBreadcrumbTracking = false');
    // Failed requests are filed from JavaScript; both sides would duplicate them.
    expect(appDelegate).toContain('options.enableCaptureFailedRequests = false');
  });

  it('tracks sessions and hands app-start measurements to JavaScript', () => {
    expect(appDelegate).toContain('options.enableAutoSessionTracking = true');
    expect(appDelegate).toContain('PrivateSentrySDKOnly.appStartMeasurementHybridSDKMode = true');
    expect(appDelegate).toContain('PrivateSentrySDKOnly.framesTrackingMeasurementHybridSDKMode = true');
  });
});
