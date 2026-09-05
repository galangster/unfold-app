import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression: build 259 (1.1.3) crashed on launch before JavaScript ran and
 * Sentry saw nothing, because the native SDK was only ever started from
 * JavaScript. A Release build now starts the Cocoa SDK in AppDelegate.swift
 * before React Native boots, with the same privacy posture as
 * `src/lib/sentry.ts`, and JavaScript attaches to it instead of restarting it.
 *
 * WHY THIS FILE PARSES INSTEAD OF GREPPING
 * The first version of this pin asserted `toContain('<literal>')` over the raw
 * file text, which cannot tell live Swift from commented-out Swift. Two
 * mutants passed it AND compiled: the whole `startCrashReporting()` body
 * wrapped in `/* … *\/` (a Release binary with no native crash reporting at
 * all), and a contradicting `options.sendDefaultPii = true` appended after the
 * pinned `= false` (last write wins in a Swift options closure — screenshots,
 * view hierarchies and PII shipped with the privacy test still green).
 *
 * So: comments are stripped first (respecting string literals, or the `//` in
 * the DSN would truncate the file), the `SentrySDK.start` option closure is
 * sliced out by brace matching, and every option is asserted to be assigned
 * EXACTLY ONCE inside that live region. A commented-out block leaves an empty
 * region; an appended override makes the count two. Both now fail.
 */

/** Strip `//` and (nesting) `/* … *\/` comments, leaving string literals intact. */
function stripSwiftComments(source: string): string {
  let out = '';
  let index = 0;
  let inString = false;
  let inLineComment = false;
  let blockDepth = 0;

  while (index < source.length) {
    const char = source[index];
    const pair = source.slice(index, index + 2);

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        out += '\n';
      }
      index += 1;
    } else if (blockDepth > 0) {
      if (pair === '/*') { blockDepth += 1; index += 2; }
      else if (pair === '*/') { blockDepth -= 1; index += 2; }
      else { if (char === '\n') out += '\n'; index += 1; }
    } else if (inString) {
      if (char === '\\') { out += source.slice(index, index + 2); index += 2; }
      else { if (char === '"') inString = false; out += char; index += 1; }
    } else if (pair === '//') {
      inLineComment = true;
      index += 2;
    } else if (pair === '/*') {
      blockDepth = 1;
      index += 2;
    } else {
      if (char === '"') inString = true;
      out += char;
      index += 1;
    }
  }
  return out;
}

/** The body between `{` at `open` and its matching `}` (string-literal aware). */
function bracedBody(source: string, open: number): string {
  let depth = 0;
  let inString = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error('unbalanced braces in AppDelegate.swift');
}

/** The live body of a `func <name>(...)` declaration, comments removed. */
function functionBody(source: string, name: string): string {
  const declaration = source.indexOf(`func ${name}(`);
  expect(declaration).toBeGreaterThan(-1);
  return bracedBody(source, source.indexOf('{', declaration));
}

const root = join(__dirname, '../../..');
const rawAppDelegate = readFileSync(join(root, 'ios/Unfold/AppDelegate.swift'), 'utf8');
const appDelegate = stripSwiftComments(rawAppDelegate);
const infoPlist = readFileSync(join(root, 'ios/Unfold/Info.plist'), 'utf8');
const sentryTs = readFileSync(join(root, 'src/lib/sentry.ts'), 'utf8');
const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8')) as {
  build: { production: { env: { EXPO_PUBLIC_SENTRY_DSN: string } } };
};

const crashReporting = functionBody(appDelegate, 'startCrashReporting');
const startCall = crashReporting.indexOf('SentrySDK.start');
const sentryOptions = startCall === -1
  ? ''
  : bracedBody(crashReporting, crashReporting.indexOf('{', startCall));

/** Assert `options.<path>` is assigned once, to `value`, in the live closure. */
function expectOptionSetOnce(path: string, value: string): void {
  const assignments = sentryOptions.split(`options.${path}`).length - 1;
  expect([path, assignments]).toEqual([path, 1]);
  expect(sentryOptions).toContain(`options.${path} = ${value}`);
}

describe('iOS native-first Sentry init (regression: launch crash with no JS bundle)', () => {
  it('starts the Cocoa SDK before React Native is created, in live code', () => {
    expect(appDelegate).toContain('import Sentry');
    const launch = appDelegate.slice(appDelegate.indexOf('didFinishLaunchingWithOptions'));
    const start = launch.indexOf('startCrashReporting()');
    const reactNative = launch.indexOf('ExpoReactNativeFactory(');
    expect(start).toBeGreaterThan(-1);
    expect(reactNative).toBeGreaterThan(-1);
    expect(start).toBeLessThan(reactNative);
  });

  it('has a startCrashReporting() that actually starts the SDK', () => {
    // The mutant this kills: the whole body wrapped in a block comment.
    expect(crashReporting.trim().length).toBeGreaterThan(0);
    expect(crashReporting).toContain('SentrySDK.start');
    expect(sentryOptions.trim().length).toBeGreaterThan(0);
  });

  it('is compiled out of Debug builds, where JavaScript starts native itself', () => {
    const launch = appDelegate.slice(appDelegate.indexOf('didFinishLaunchingWithOptions'));
    expect(launch).toMatch(/#if !DEBUG\s*\n\s*startCrashReporting\(\)\s*\n\s*#endif/);
  });

  it('uses the production DSN from eas.json', () => {
    const dsn = eas.build.production.env.EXPO_PUBLIC_SENTRY_DSN;
    expect(dsn).toMatch(/^https:\/\/.+@.+\.ingest\..*sentry\.io\/\d+$/);
    expectOptionSetOnce('dsn', `"${dsn}"`);
  });

  it('labels the environment with the EAS profile, not a hardcoded "production"', () => {
    // A QA TestFlight build is a Release build, so a literal would file its
    // crashes and its release-health sessions as production traffic.
    expectOptionSetOnce('environment', 'environment');
    expect(crashReporting).toContain('info?["UNFOLDBuildProfile"] as? String');
    expect(infoPlist).toContain('<key>UNFOLDBuildProfile</key>');
    // Fail-safe: an unexpanded or absent stamp must fall back, never ship
    // "$(EAS_BUILD_PROFILE)" as an environment name.
    expect(crashReporting).toContain('"production"');
    expect(crashReporting).toContain('stampedProfile.contains("$")');
  });

  it('stamps the profile with a build hook, because Info.plist cannot expand it', () => {
    // The checked-in value is the literal $(EAS_BUILD_PROFILE). Xcode's
    // INFOPLIST_EXPAND_BUILD_SETTINGS substitutes BUILD SETTINGS, and
    // EAS_BUILD_PROFILE is a process environment variable, so it never expands
    // on its own. An earlier version of this test asserted that literal and
    // passed while the mechanism was inert. Pin the hook that does the work.
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts['eas-build-post-install']).toContain('stamp-build-profile');

    const stamper = readFileSync(join(root, 'scripts/stamp-build-profile.mjs'), 'utf8');
    expect(stamper).toContain('EAS_BUILD_PROFILE');
    expect(stamper).toContain('UNFOLDBuildProfile');
    // No profile means a local build: leave the literal alone so the Swift
    // guard falls back, rather than writing an empty environment name.
    expect(stamper).toContain('process.exit(0)');
  });

  it('keeps the privacy posture of src/lib/sentry.ts on the native side', () => {
    expectOptionSetOnce('sendDefaultPii', 'false');
    expectOptionSetOnce('attachScreenshot', 'false');
    expectOptionSetOnce('attachViewHierarchy', 'false');
    expectOptionSetOnce('sessionReplay.sessionSampleRate', '0');
    expectOptionSetOnce('sessionReplay.onErrorSampleRate', '0');
    // Cocoa's own breadcrumbs label screens with their navigation title.
    expectOptionSetOnce('enableAutoBreadcrumbTracking', 'false');
    // ...and that flag does NOT govern network breadcrumbs, which are a
    // separate default-YES switch that records `http.query` raw, onto the
    // native scope, where no JavaScript scrubber can reach it.
    expectOptionSetOnce('enableNetworkBreadcrumbs', 'false');
    expectOptionSetOnce('enableNetworkTracking', 'false');
    // Failed requests are filed from JavaScript; both sides would duplicate them.
    expectOptionSetOnce('enableCaptureFailedRequests', 'false');
  });

  it('installs the two RNSentry beforeSend filters JavaScript no longer installs', () => {
    // Without them every fatal JS error files a second, unscrubbed native
    // issue whose exception type is the raw error message.
    // Pinned with expectOptionSetOnce, not toContain: a later
    // `options.beforeSend = nil` appended below would win by last-write and
    // silently re-open this defect with every test still green.
    expectOptionSetOnce('beforeSend', '{ event in');
    expect(sentryOptions).toContain('Unhandled JS Exception');
    expect(sentryOptions).toContain('ExceptionsManager.reportException');
    const rnSentry = readFileSync(
      join(root, 'node_modules/@sentry/react-native/ios/RNSentry.mm'), 'utf8');
    expect(rnSentry).toContain('@"Unhandled JS Exception"');
    expect(rnSentry).toContain('@"ExceptionsManager.reportException"');
  });

  it('tracks sessions and hands app-start measurements to JavaScript', () => {
    expectOptionSetOnce('enableAutoSessionTracking', 'true');
    expectOptionSetOnce('enableWatchdogTerminationTracking', 'true');
    expectOptionSetOnce('enableAppHangTracking', 'true');
    expect(crashReporting).toContain('PrivateSentrySDKOnly.appStartMeasurementHybridSDKMode = true');
    expect(crashReporting).toContain('PrivateSentrySDKOnly.framesTrackingMeasurementHybridSDKMode = true');
  });

  it('reports the same release and dist scheme as JavaScript and as the sourcemap upload', () => {
    // Native: built by hand from three Info.plist keys.
    expect(sentryOptions).toContain(
      'options.releaseName = "\\(bundleId)@\\(shortVersion)+\\(bundleVersion)"');
    expect(crashReporting).toContain('info?["CFBundleIdentifier"] as? String');
    expect(crashReporting).toContain('info?["CFBundleShortVersionString"] as? String');
    expect(crashReporting).toContain('info?["CFBundleVersion"] as? String');
    expectOptionSetOnce('dist', 'bundleVersion');

    // JavaScript: passes neither, so `nativeReleaseIntegration` derives both.
    expect(sentryTs).not.toMatch(/^\s+release,$/m);
    expect(sentryTs).not.toMatch(/^\s+dist,$/m);

    // ...and it derives them from the SAME three keys, in the same order.
    const release = readFileSync(
      join(root, 'node_modules/@sentry/react-native/dist/js/integrations/release.js'), 'utf8');
    expect(release).toContain('`${nativeRelease.id}@${nativeRelease.version}+${nativeRelease.build}`');
    expect(release).toContain('event.dist = `${nativeRelease.build}`');
    const rnSentry = readFileSync(
      join(root, 'node_modules/@sentry/react-native/ios/RNSentry.mm'), 'utf8');
    const fetchRelease = rnSentry.slice(rnSentry.indexOf('fetchNativeRelease :'));
    expect(fetchRelease.slice(0, 400)).toContain('@"id" : infoDict[@"CFBundleIdentifier"]');
    expect(fetchRelease.slice(0, 400)).toContain('@"version" : infoDict[@"CFBundleShortVersionString"]');
    expect(fetchRelease.slice(0, 400)).toContain('@"build" : infoDict[@"CFBundleVersion"]');
  });
});
