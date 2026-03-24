/**
 * Expo config plugin that removes App Groups entitlement.
 *
 * expo-widgets auto-adds App Groups during prebuild, but our
 * provisioning profiles don't have the capability enabled.
 * This plugin runs AFTER expo-widgets and strips the entitlement.
 */
const { withEntitlementsPlist, withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withRemoveAppGroups(config) {
  // Remove from main app entitlements
  config = withEntitlementsPlist(config, (config) => {
    delete config.modResults['com.apple.security.application-groups'];
    return config;
  });

  // Remove from widget target entitlements (written as a file, not via mod)
  config = withXcodeProject(config, (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const widgetEntPath = path.join(
      projectRoot,
      'ios',
      'ExpoWidgetsTarget',
      'ExpoWidgetsTarget.entitlements'
    );

    if (fs.existsSync(widgetEntPath)) {
      const content = fs.readFileSync(widgetEntPath, 'utf8');
      // Remove the App Groups key+value from the plist
      const cleaned = content
        .replace(
          /\s*<key>com\.apple\.security\.application-groups<\/key>\s*<array>[\s\S]*?<\/array>/,
          ''
        );
      fs.writeFileSync(widgetEntPath, cleaned, 'utf8');
    }

    return config;
  });

  return config;
}

module.exports = withRemoveAppGroups;
