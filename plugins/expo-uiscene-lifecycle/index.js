'use strict';

const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');
const semver = require('semver');

const PLUGIN_NAME = 'expo-uiscene-lifecycle';
const MINIMUM_EXPO_VERSION = '57.0.23';
const ORIGINAL_APP_DELEGATE = 'class AppDelegate: ExpoAppDelegate {';
const SCENE_APP_DELEGATE =
  'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {';
const FACTORY_ASSIGNMENT = '    reactNativeFactory = factory';
const LEGACY_STARTUP = `    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
`;
const LEGACY_STARTUP_BLOCK = `#if os(iOS) || os(tvOS)\n${LEGACY_STARTUP}#endif\n`;

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
      },
    ],
  },
};

function assertSdk57(installedExpoVersion) {
  if (
    !installedExpoVersion ||
    semver.gt(MINIMUM_EXPO_VERSION, installedExpoVersion) ||
    semver.gte(installedExpoVersion, '58.0.0')
  ) {
    throw new Error(
      `${PLUGIN_NAME} supports Expo ${MINIMUM_EXPO_VERSION} through SDK 57 only (installed: ${JSON.stringify(installedExpoVersion ?? 'unknown')}).`,
    );
  }
}

function getInstalledExpoVersion() {
  try {
    return require('expo/package.json').version;
  } catch {
    return undefined;
  }
}

function isOwnedManifest(manifest) {
  return JSON.stringify(manifest) === JSON.stringify(SCENE_MANIFEST);
}

function updateAppDelegate(contents, enabled) {
  const isEnabled = contents.includes(SCENE_APP_DELEGATE);

  if (enabled && isEnabled) {
    return contents;
  }
  if (!enabled && !isEnabled) {
    return contents;
  }

  if (enabled) {
    const startup = `\n${LEGACY_STARTUP_BLOCK}`;
    if (
      !contents.includes(ORIGINAL_APP_DELEGATE) ||
      !contents.includes(startup)
    ) {
      throw new Error(
        `${PLUGIN_NAME} requires the standard Expo SDK 57 Swift AppDelegate.`,
      );
    }
    return contents
      .replace(ORIGINAL_APP_DELEGATE, SCENE_APP_DELEGATE)
      .replace(startup, '');
  }

  return restoreLegacyStartup(contents);
}

function restoreLegacyStartup(contents) {
  const withoutProvider = contents.replace(SCENE_APP_DELEGATE, ORIGINAL_APP_DELEGATE);
  if (withoutProvider.includes(LEGACY_STARTUP)) {
    return withoutProvider;
  }

  const assignmentAt = withoutProvider.indexOf(FACTORY_ASSIGNMENT);
  if (assignmentAt === -1) {
    throw new Error(
      `${PLUGIN_NAME} cannot disable because the AppDelegate factory assignment was not found.`,
    );
  }

  const insertAt = assignmentAt + FACTORY_ASSIGNMENT.length;
  return (
    withoutProvider.slice(0, insertAt) +
    `\n\n${LEGACY_STARTUP_BLOCK}` +
    withoutProvider.slice(insertAt)
  );
}

const withExpoUIScene = (config, options) => {
  assertSdk57(getInstalledExpoVersion());
  const enabled = options?.enabled !== false;

  config = withAppDelegate(config, (modConfig) => {
    if (modConfig.modResults.language !== 'swift') {
      throw new Error(
        `${PLUGIN_NAME} requires the standard Expo SDK 57 Swift AppDelegate.`,
      );
    }
    modConfig.modResults.contents = updateAppDelegate(
      modConfig.modResults.contents,
      enabled,
    );
    return modConfig;
  });

  return withInfoPlist(config, (modConfig) => {
    const manifest = modConfig.modResults.UIApplicationSceneManifest;
    if (enabled) {
      if (manifest !== undefined && !isOwnedManifest(manifest)) {
        throw new Error(
          `${PLUGIN_NAME} cannot enable because UIApplicationSceneManifest is already declared by the app.`,
        );
      }
      modConfig.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    } else if (isOwnedManifest(manifest)) {
      delete modConfig.modResults.UIApplicationSceneManifest;
    }
    return modConfig;
  });
};

module.exports = withExpoUIScene;
module.exports.updateAppDelegate = updateAppDelegate;
