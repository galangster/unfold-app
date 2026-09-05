import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression: App Store build 259 (1.1.3) was rejected under Guideline 2.1
 * because it crashed on launch. The archive contained no main.jsbundle: the
 * "Bundle React Native code and images" phase invoked Sentry's wrapper as
 * `/bin/sh sentry-xcode.sh /bin/sh react-native-xcode.sh`, and the wrapper
 * takes the React Native script PATH as `$1`, so it ran an empty `/bin/sh`
 * and bundled nothing while the build still "succeeded". Every build from
 * 255 to 260 shipped without JavaScript.
 */
describe('iOS bundle phase (regression: build 259 shipped no JS bundle)', () => {
  const pbxproj = readFileSync(join(__dirname, '../../../ios/Unfold.xcodeproj/project.pbxproj'), 'utf8');
  const phase = pbxproj.slice(pbxproj.indexOf('name = "Bundle React Native code and images"'));
  const script = phase.slice(0, phase.indexOf('showEnvVarsInLog'));

  it('hands react-native-xcode.sh to sentry-xcode.sh as its first argument, not /bin/sh', () => {
    expect(script).toContain("sentry-xcode.sh");
    expect(script).toContain("react-native-xcode.sh");
    expect(script).not.toMatch(/sentry-xcode\.sh'\\"` \/bin\/sh `/);
    expect(script).toMatch(/sentry-xcode\.sh'\\"` `\\"\$NODE_BINARY\\" --print/);
  });

  it('fails a non-Debug build whose app has no main.jsbundle', () => {
    expect(script).toContain('main.jsbundle');
    expect(script).toMatch(/CONFIGURATION\\" != \*Debug\*/);
    expect(script).toContain('exit 1');
  });
});
