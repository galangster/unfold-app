import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression: App Store 1.1.12 / 289 and in-review 1.1.13 / 294 were both
 * Xcode 27.0 / iPhoneOS 27.0 (DTXcode 2700, 27A266a) with no UIScene keys.
 * iOS 27 asserts at launch (`NoSceneLifecycleAdoption`) unless the binary
 * adopts UIKit scenes. Expo's opt-in path is expo ≥57.0.23 plus
 * `@config-plugins/expo-uiscene-lifecycle`.
 *
 * EAS uses the committed ios/ tree (no extra prebuild — --clean would wipe
 * the Sentry bundle phases). The plugin mutations are therefore applied
 * here, and the plugin stays in app.json so a later prebuild is a no-op.
 */
const root = join(__dirname, '../../..');
const appDelegate = readFileSync(join(root, 'ios/Unfold/AppDelegate.swift'), 'utf8');
const infoPlist = readFileSync(join(root, 'ios/Unfold/Info.plist'), 'utf8');
const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')) as {
  expo: { plugins: (string | [string, unknown])[] };
};
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};

function pluginName(entry: string | [string, unknown]): string {
  return Array.isArray(entry) ? entry[0] : entry;
}

describe('iOS UIScene lifecycle (regression: Xcode 27 / iOS 27 launch kill)', () => {
  it('resolves expo ≥57.0.23 so ExpoAppSceneDelegate exists', () => {
    const expo = pkg.dependencies.expo;
    expect(expo).toMatch(/\d+\.\d+\.\d+/);
    const match = expo.match(/(\d+)\.(\d+)\.(\d+)/);
    expect(match).not.toBeNull();
    const [, major, minor, patch] = match!.map(Number);
    expect(major).toBe(57);
    expect(minor).toBe(0);
    expect(patch).toBeGreaterThanOrEqual(23);
  });

  it('registers the official UIScene plugin and does not invent a second one', () => {
    const names = appJson.expo.plugins.map(pluginName);
    expect(names).toContain('@config-plugins/expo-uiscene-lifecycle');
    expect(
      names.some((name) => name.includes('uiscene') && name !== '@config-plugins/expo-uiscene-lifecycle'),
    ).toBe(false);
    expect(pkg.dependencies['@config-plugins/expo-uiscene-lifecycle']).toBe(
      'file:plugins/expo-uiscene-lifecycle',
    );
  });

  it('exposes the factory to EXExpoAppSceneDelegate and does not start RN in didFinishLaunching', () => {
    expect(appDelegate).toContain(
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
    );
    expect(appDelegate).toContain('reactNativeFactory = factory');
    expect(appDelegate).toContain('startCrashReporting()');
    const launch = appDelegate.slice(appDelegate.indexOf('didFinishLaunchingWithOptions'));
    const start = launch.indexOf('startCrashReporting()');
    const reactNative = launch.indexOf('ExpoReactNativeFactory(');
    expect(start).toBeGreaterThan(-1);
    expect(reactNative).toBeGreaterThan(-1);
    expect(start).toBeLessThan(reactNative);
    expect(launch).not.toContain('UIWindow(frame:');
    expect(launch).not.toContain('factory.startReactNative(');
    expect(appDelegate).not.toContain('window?.backgroundColor');
  });

  it('declares the plugin-owned scene manifest, not a custom SceneDelegate', () => {
    expect(infoPlist).toContain('<key>UIApplicationSceneManifest</key>');
    expect(infoPlist).toContain('<string>EXExpoAppSceneDelegate</string>');
    expect(infoPlist).toContain('<string>Default Configuration</string>');
    expect(infoPlist).toContain('<key>UIApplicationSupportsMultipleScenes</key>');
    expect(infoPlist).not.toContain('$(PRODUCT_MODULE_NAME).SceneDelegate');
  });

  it('keeps AppDelegate open-URL and universal-link overrides', () => {
    expect(appDelegate).toContain('RCTLinkingManager.application(app, open: url, options: options)');
    expect(appDelegate).toContain('continue userActivity');
  });

  it('leaves a blank line after the factory assignment so disable can restore startup', () => {
    expect(appDelegate).toContain('    reactNativeFactory = factory\n\n');
  });

  it('restores UIWindow + startReactNative when the plugin is disabled, even with a comment after the factory assignment', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const plugin = require(join(root, 'plugins/expo-uiscene-lifecycle')) as {
      updateAppDelegate: (contents: string, enabled: boolean) => string;
    };

    expect(plugin.updateAppDelegate(appDelegate, true)).toBe(appDelegate);

    const commented = appDelegate.replace(
      '    reactNativeFactory = factory\n\n',
      '    reactNativeFactory = factory\n    // comment sits on the next line\n',
    );
    const disabled = plugin.updateAppDelegate(commented, false);
    expect(disabled).toContain('class AppDelegate: ExpoAppDelegate {');
    expect(disabled).not.toContain('ExpoReactNativeFactoryProvider');
    expect(disabled).toContain('UIWindow(frame: UIScreen.main.bounds)');
    expect(disabled).toContain('factory.startReactNative(');
    expect(disabled).toContain('#if os(iOS) || os(tvOS)');
  });
});
