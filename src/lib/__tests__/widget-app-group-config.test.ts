import * as fs from 'fs';
import * as path from 'path';

// Repo root is two levels up from src/lib/__tests__
const repoRoot = path.join(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf-8');

const APP_GROUP = 'group.com.unfoldapp.ios';

describe('widget app group configuration (NAT-1)', () => {
  it('the entitlement-stripping plugin is gone', () => {
    expect(fs.existsSync(path.join(repoRoot, 'plugins/withRemoveAppGroups.js'))).toBe(false);
    expect(JSON.stringify(JSON.parse(read('app.json')))).not.toContain('withRemoveAppGroups');
  });

  it('app.json expo-widgets config pins the group identifier explicitly', () => {
    const appJson = JSON.parse(read('app.json'));
    const widgetsEntry = appJson.expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-widgets'
    );
    expect(widgetsEntry).toBeDefined();
    expect(widgetsEntry[1].groupIdentifier).toBe(APP_GROUP);
  });

  it('main app entitlements grant the app group', () => {
    const ent = read('ios/Unfold/Unfold.entitlements');
    expect(ent).toContain('<key>com.apple.security.application-groups</key>');
    expect(ent).toContain(`<string>${APP_GROUP}</string>`);
  });

  it('widget extension entitlements grant the app group', () => {
    const ent = read('ios/ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements');
    expect(ent).toContain('<key>com.apple.security.application-groups</key>');
    expect(ent).toContain(`<string>${APP_GROUP}</string>`);
  });

  it('every suite-name source agrees on one group id (single source of truth)', () => {
    // The native module reads Info.plist key ExpoWidgetsAppGroupIdentifier on BOTH sides.
    for (const plist of ['ios/Unfold/Info.plist', 'ios/ExpoWidgetsTarget/Info.plist']) {
      const content = read(plist);
      const m = content.match(
        /<key>ExpoWidgetsAppGroupIdentifier<\/key>\s*<string>([^<]+)<\/string>/
      );
      expect(m?.[1]).toBe(APP_GROUP);
    }
  });
});
