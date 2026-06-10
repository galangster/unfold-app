# Plan 05 — Widgets build-219 native batch (NAT-1 P0 + RT-WIDGETS-3/4/5 P1 + RT-WIDGETS-6 cheap P2 + RT-WIDGETS-2 reclassification)

**Repo:** Unfold iOS app (Expo / React Native, **non-CNG**: `ios/` is committed and authoritative). Worktree: `/Users/galangster/clawd/work/unfold-audit`
**Base commit:** `193f7373` on branch `fix/01-streak-engine-and-journal` (round-1 audit fixes are already on this branch; round-2 plans may land more before you run). **All code excerpts below were read from `193f7373`.** Before starting, run `git rev-parse HEAD` and record it. If any "CURRENT code" excerpt below no longer matches the file on disk, STOP and report — do not guess.
**Commit convention (matches round 1):** one commit per fix, message `fix(<IDS>): <summary> [audit]`, committed on the currently checked-out audit fix branch. Never push to `origin/main`. `ios/Podfile.lock` is dirty with known checksum churn — do NOT include it in any commit.

**Findings covered:**

| ID | Sev | One-line |
|---|---|---|
| NAT-1 / RT-WIDGETS-1 | P0 | `plugins/withRemoveAppGroups.js` strips the App Groups entitlement → `UserDefaults(suiteName:)` silently falls back to the app's private container → all 3 widgets are permanently blank on physical devices (device-confirmed by Nick on build 218). |
| RT-WIDGETS-3 | P1 | No `widgetURL` on any widget — every tap is a plain app open to the launch gate. |
| RT-WIDGETS-4 | P1 | Hardcoded dark palette (`#0A0A0A` / `#F5F0EB`) regardless of system appearance. |
| RT-WIDGETS-5 | P1 | Single-entry timeline with `.atEnd` policy → stale "read today" state after midnight with the app closed. |
| RT-WIDGETS-6 | P2 (cheap, same helper) | Weekly progress row only scans the CURRENT devotional's days — readings from other series in the same week are missing. |
| RT-WIDGETS-2 | P0 → reclassify | Empty widget gallery on the iOS 26.5 **beta simulator** — counter-evidence: Nick's physical iPhone HAS the widgets installed. Documentation + device-verification step, **not a code fix**. |

**Decisions already made (Nick delegated — implement, do not re-litigate):** widget 219 batch = App-Groups fix + deep links + appearance palette + timeline policy. Widget fixes target **build 219**. Deep links use `widgetURL` only — **no AppIntents / interactive buttons** (minimal 219 risk).

**Nick-gated (you must NOT do these):** running `eas build` / `eas credentials` / any Apple Developer Portal mutation; cutting/uploading build 219; TestFlight anything. You stage everything code-side and verify locally on simulator. The post-gate protocol is written out in §Verification Part C for whoever runs it after Nick approves.

**Estimated risk:** Medium. The entitlements edit is tiny but its effect runs through signing (gated). The TSX widget rewrites are display-only and constrained by a hard "dark output byte-identical" rule. The timeline change is covered by new pure-function unit tests.

**Dependency order (execute exactly in this order):**

1. Fix 1 — NAT-1: restore App Groups (config + entitlements).
2. Fix 2 — RT-WIDGETS-3 + RT-WIDGETS-4 together: full replacement of the 3 widget TSX files (deep link + palette are in the same files; doing them as one rewrite avoids two rounds of full-file edits). One commit `fix(RT-WIDGETS-3,RT-WIDGETS-4): …`.
3. Fix 3 — RT-WIDGETS-5 + RT-WIDGETS-6: new pure module `src/lib/widget-timeline.ts` + `widget-bridge.ts` switch to `updateTimeline` with a midnight entry.
4. Fix 4 — RT-WIDGETS-2: reclassification note (docs commit).
5. Verification gates (Part A local JS, Part B local native/simulator, Part C Nick-gated).

**Test runner facts (verified in this worktree):** `npm test` = `jest --passWithNoTests`; `npm run typecheck` = `tsc --noEmit`; `npm run lint` = eslint. Jest config: roots = `<rootDir>/src`, so new test files MUST live under `src/` (they may `fs.readFileSync` files outside `src/` via relative paths). Round-1 full suite was green at 108 suites / 723 tests; your additions must keep everything green (absolute counts may drift if plan-04 lands first — the gate is **zero failures**, plus your new suites passing).

---

## ARCHITECTURE PRIMER (read this — it constrains every edit below)

This is **not** a normal SwiftUI widget codebase. How `expo-widgets@56.0.16` works here:

1. **Widget UI is authored in TSX** at `src/widgets/ios/{UnfoldStreak,UnfoldToday,UnfoldDashboard,UnfoldReadingSession}.tsx` using `@expo/ui/swift-ui` components. Each component function starts with the `'widget'` directive.
2. **The `'widget'` directive triggers a babel transform** (`babel-preset-expo/build/plugins/widgets-plugin.js`) that replaces the function with a **string of its own source code** (`generateWidgetFunctionString` → template literal). `createWidget(name, fn)` then passes that string to the native module, which stores it in App-Group UserDefaults under `__expo_widgets_<name>_layout` (see `node_modules/expo-widgets/ios/WidgetObject.swift`, `init` → `WidgetsStorage.set(layout, forKey:)`).
3. **The widget extension evaluates that string in its own JS runtime** (`node_modules/expo-widgets/ios/Widgets/EntryView.swift` → `evaluateLayout(layout:props:environment:)`). The runtime's globals are populated from `node_modules/expo-widgets/bundle/index.ts`: `Object.assign(globalThis, {...swiftUI, ...modifiers, ...jsxRuntime, ...})`. So `Text`, `VStack`, `background()`, `widgetURL()`, etc. resolve **as globals** at widget-runtime; the TSX `import` statements exist only for TypeScript/lint on the app side.
4. **⚠ HARD CONSTRAINT — no closures over module scope.** Because only the function body is serialized, any reference inside the `'widget'` function to a module-level constant, helper, or non-`@expo/ui` import is a **free variable at widget-runtime → evaluation failure → RedBox widget**. Every palette object, URL string, and helper used inside the component MUST be defined **inside the function body** (the existing code already obeys this — e.g. `weekDays` is defined inside `DashboardWidget`). Do not "clean up" by hoisting constants out of the functions.
5. **The committed Swift files** in `ios/ExpoWidgetsTarget/` (`UnfoldStreak.swift`, `UnfoldToday.swift`, `UnfoldDashboard.swift`, `index.swift`) are thin `Widget` configurations that delegate to `WidgetsTimelineProvider` / `WidgetsEntryView` from the pod. **You do not edit any Swift file in this plan.** The visible UI changes all happen in the TSX.
6. **Data path:** app JS → `Widget.updateTimeline(entries)` → native stores `__expo_widgets_<name>_timeline` (array of `{timestamp, props}`) in `UserDefaults(suiteName: appGroupIdentifier)` → `WidgetCenter.reloadTimelines` → extension's `WidgetsTimelineProvider.getTimeline` re-reads that array and returns `Timeline(entries:, policy: .atEnd)`. The suite name comes from Info.plist key `ExpoWidgetsAppGroupIdentifier` on **each side** (`Bundle.main` — app's Info.plist for writes, extension's Info.plist for reads).
7. **Suite-name match (verified at plan time, no change needed):** `ios/Unfold/Info.plist:45-46` and `ios/ExpoWidgetsTarget/Info.plist:5-6` both say `ExpoWidgetsAppGroupIdentifier = group.com.unfoldapp.ios`. `src/lib/widget-bridge.ts` never names a suite — it flows through the native module. NAT-1 is purely the **entitlement** being stripped, which makes `UserDefaults(suiteName:)` silently fall back to per-process storage on device.
8. `environment` (2nd parameter of the widget function) is provided by `getWidgetEnvironment` in `node_modules/expo-widgets/ios/Widgets/Utils.swift` and always includes `colorScheme` (`"light"` / `"dark"`), re-evaluated by SwiftUI whenever appearance changes. This is the RT-WIDGETS-4 mechanism.

---

## Fix 1 — NAT-1 (P0): restore the App Groups entitlement everywhere

### Context

Commit `1e155db` ("fix: remove App Groups entitlement that blocks IPA build") added `plugins/withRemoveAppGroups.js` as a **provisioning workaround** — the provisioning profiles lacked the App Groups capability, so instead of fixing the portal capability the entitlement was stripped. Result: the entire widget data path writes/reads a non-shared store on physical devices; all widgets blank (device-confirmed on 218). The simulator masked it for months because CoreSimulator was historically permissive; the iOS 26.5 sim is not.

This repo is **non-CNG** (`ios/` committed): the committed `.entitlements` files are what the build signs with. The app.json plugin list only matters if someone ever runs prebuild — we fix **both layers** so they can never diverge (vault: `invariants-must-hold-on-every-construction-and-update-path`).

The Xcode project already points at both entitlements files — verified at `ios/Unfold.xcodeproj/project.pbxproj`: `CODE_SIGN_ENTITLEMENTS = Unfold/Unfold.entitlements;` (lines 594, 633) and `CODE_SIGN_ENTITLEMENTS = ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements;` (lines 665, 690). **Do not touch the pbxproj.**

### Complete enumeration of files that change in this fix

1. `app.json` — remove the `"./plugins/withRemoveAppGroups"` plugin entry; add explicit `"groupIdentifier"` to the `expo-widgets` plugin config.
2. `plugins/withRemoveAppGroups.js` — DELETE the file.
3. `ios/Unfold/Unfold.entitlements` — add the `com.apple.security.application-groups` key.
4. `ios/ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements` — add the same key (file is currently an empty `<dict/>`).
5. `src/lib/__tests__/widget-app-group-config.test.ts` — NEW contract test (write it FIRST; it must fail before the edits and pass after).

Files verified-correct already, **no edit**: `ios/Unfold/Info.plist` (key at lines 45-46), `ios/ExpoWidgetsTarget/Info.plist` (key present), `ios/Unfold.xcodeproj/project.pbxproj`.

### Failing test FIRST

Create `src/lib/__tests__/widget-app-group-config.test.ts`:

```ts
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
```

Run `npx jest src/lib/__tests__/widget-app-group-config.test.ts` — expect **3 of 5 tests failing** (the two Info.plist + app.json-structure assertions on `groupIdentifier` fail differently: "plugin is gone" fails, "pins the group identifier" fails, both entitlements tests fail; the Info.plist agreement test passes). Exact failing count: 4 fail / 1 pass. If the Info.plist test fails too, STOP — someone changed the suite id.

### Edit 1 — `app.json`

CURRENT (lines 92-128, abbreviated to the relevant hunks):

```json
      [
        "expo-widgets",
        {
          "bundleIdentifier": "com.unfoldapp.ios.widgets",
          "enablePushNotifications": false,
          "widgets": [
```
and, after the closing of the expo-widgets entry (line 127):
```json
      "./plugins/withRemoveAppGroups",
```

AFTER:

```json
      [
        "expo-widgets",
        {
          "bundleIdentifier": "com.unfoldapp.ios.widgets",
          "groupIdentifier": "group.com.unfoldapp.ios",
          "enablePushNotifications": false,
          "widgets": [
```
and the `"./plugins/withRemoveAppGroups",` line is **deleted entirely**.

(`groupIdentifier` is a documented `expo-widgets` plugin prop — see `node_modules/expo-widgets/plugin/src/withWidgets.ts` lines 11-13; the default is already `group.<bundle id>` = the same value, we pin it explicitly so prebuild can never drift.)

### Edit 2 — delete the plugin

```bash
git rm plugins/withRemoveAppGroups.js
```

(The file is the 47-line config plugin whose docstring literally says "removes App Groups entitlement … our provisioning profiles don't have the capability enabled". The capability gets enabled at the Nick gate; the workaround must die with it.)

### Edit 3 — `ios/Unfold/Unfold.entitlements`

CURRENT (entire file):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>aps-environment</key>
    <string>development</string>
    <key>com.apple.developer.applesignin</key>
    <array>
      <string>Default</string>
    </array>
  </dict>
</plist>
```

AFTER (entire file):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>aps-environment</key>
    <string>development</string>
    <key>com.apple.developer.applesignin</key>
    <array>
      <string>Default</string>
    </array>
    <key>com.apple.security.application-groups</key>
    <array>
      <string>group.com.unfoldapp.ios</string>
    </array>
  </dict>
</plist>
```

### Edit 4 — `ios/ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements`

CURRENT (entire file):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict/>
</plist>
```

AFTER (entire file):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.application-groups</key>
    <array>
      <string>group.com.unfoldapp.ios</string>
    </array>
  </dict>
</plist>
```

### Fix-1 verification

```bash
plutil -lint ios/Unfold/Unfold.entitlements ios/ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements
# expected:
# ios/Unfold/Unfold.entitlements: OK
# ios/ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements: OK
npx jest src/lib/__tests__/widget-app-group-config.test.ts
# expected: Tests: 5 passed
node -e "JSON.parse(require('fs').readFileSync('app.json','utf8')); console.log('app.json OK')"
# expected: app.json OK
```

Commit: `fix(NAT-1): restore App Groups entitlement for app+widget targets; delete strip plugin [audit]`

### Signing note (carries into Part C — do not act on it yourself)

The Apple Developer Portal does not yet have the App Groups capability on `com.unfoldapp.ios` / `com.unfoldapp.ios.widgets` — that is WHY the strip plugin existed. **Local simulator builds do not need provisioning and will succeed** (your Part B gate). The store build is the Nick gate: EAS auto-capability-sync at the next `eas build` should register the group + regenerate profiles; the manual portal fallback is spelled out in Part C.

---

## Fix 2 — RT-WIDGETS-3 + RT-WIDGETS-4: deep links + appearance-aware palette (3 TSX files, full replacements)

### Context

- **Deep link target:** the route `/(tabs)/(today)` exists (`src/app/(tabs)/(today)/index.tsx`) and is already the canonical in-app navigation target for notification taps — `src/lib/push-notification-helpers.ts:219` returns `{ pathname: '/(tabs)/(today)' }`. The URL form `unfold://(tabs)/(today)` follows the repo's own documented scheme-URL pattern (`src/app/__dev__/unfold-editor-test.tsx:33` documents `unfold://__dev__/unfold-editor-test`; `"scheme": "unfold"` is app.json line 10). All three widgets link to the Today tab — no per-widget granularity in 219, and **deliberately no params**: COR-10 (out of scope) showed that deep links carrying `devotionalId` permanently switch the active series; a bare Today-tab link cannot trigger that. Failure mode is safe: if iOS ever rejects the URL string, `WidgetURLModifier`'s `url` field is `nil` and the tap degrades to today's behavior (plain app open).
- **Palette:** `environment.colorScheme` is delivered to the widget function on every render (Architecture Primer #8). Dark values must stay **byte-identical to the shipped palette** (this is a hard drift gate). Light values mirror `src/constants/colors.ts` `LightColors`: background `#FAF7F2`, ink `#1C1710`, accent `#866B2F` (the contrast-tuned light accent), with ink alphas raised ~+0.13–0.15 per the contrast comment at `colors.ts:95`. When `colorScheme` is missing (very old runtime), default to dark = shipped look.
- The `accessoryCircular` branch of UnfoldStreak already adapts via hierarchical styles — leave its styling alone, only add `widgetURL`.
- Per the **HARD CONSTRAINT** (Primer #4): the palette object and URL string are defined INSIDE each component function. Do not hoist, do not share a module-level palette between files.
- `widgetURL` is a real exported modifier: `node_modules/@expo/ui/src/swift-ui/modifiers/widgets.ts` (`export const widgetURL = (url: string) => createModifier('widgetURL', { url })`), natively registered at `node_modules/@expo/ui/ios/Modifiers/ViewModifierRegistry.swift:1834`. WidgetKit allows **one widgetURL per view hierarchy** — we put it on the root container of each returned hierarchy (UnfoldStreak has two hierarchies → two call sites, one per branch).

### Failing test FIRST

Create `src/lib/__tests__/widget-source-contract.test.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.join(__dirname, '../../..');
const widgetDir = path.join(repoRoot, 'src/widgets/ios');
const read = (name: string) => fs.readFileSync(path.join(widgetDir, name), 'utf-8');

const WIDGET_FILES = ['UnfoldStreak.tsx', 'UnfoldToday.tsx', 'UnfoldDashboard.tsx'];
// The URL must be defined INSIDE the 'widget' function (runtime contract) and
// applied via widgetURL(deepLink) on the root of each returned hierarchy.
const DEEP_LINK_DECL = "const deepLink = 'unfold://(tabs)/(today)';";

describe('widget source contracts (RT-WIDGETS-3, RT-WIDGETS-4)', () => {
  it.each(WIDGET_FILES)('%s declares the Today-tab deep link inside the widget body', (file) => {
    const src = read(file);
    const directive = src.indexOf("'widget';");
    const decl = src.indexOf(DEEP_LINK_DECL);
    expect(directive).toBeGreaterThan(-1);
    expect(decl).toBeGreaterThan(directive); // declared AFTER the directive = inside the fn
  });

  it('UnfoldStreak carries the deep link on BOTH family branches', () => {
    const src = read('UnfoldStreak.tsx');
    expect(src.split('widgetURL(deepLink)').length - 1).toBe(2);
  });

  it.each(['UnfoldToday.tsx', 'UnfoldDashboard.tsx'])(
    '%s carries exactly one widgetURL',
    (file) => {
      expect(read(file).split('widgetURL(deepLink)').length - 1).toBe(1);
    }
  );

  it.each(WIDGET_FILES)('%s has no hardcoded dark background', (file) => {
    expect(read(file)).not.toContain("background('#0A0A0A')");
  });

  it.each(WIDGET_FILES)('%s adapts to the system color scheme', (file) => {
    const src = read(file);
    const directive = src.indexOf("'widget';");
    const schemeCheck = src.indexOf("environment.colorScheme === 'light'");
    expect(directive).toBeGreaterThan(-1);
    // palette must be computed INSIDE the serialized function body (after the directive)
    expect(schemeCheck).toBeGreaterThan(directive);
  });

  it.each(WIDGET_FILES)('%s dark palette is unchanged from the shipped values', (file) => {
    const src = read(file);
    expect(src).toContain("'#0A0A0A'"); // still present — as the dark token value
    expect(src).toContain("'#F5F0EB'");
    expect(src).toContain("'#C8A55C'");
  });
});
```

Run `npx jest src/lib/__tests__/widget-source-contract.test.ts` — expect failures on every deep-link and colorScheme assertion (the "no hardcoded background" ones fail too). After Fix 2 all pass.

### Edits — full replacement of the three component functions

Replace each file's component function (and only what's listed — keep headers/types where shown). The complete AFTER state of each file follows. Dark values are copied verbatim from the current files; verify by eye that every dark literal matches the CURRENT code you read on disk before replacing.

#### `src/widgets/ios/UnfoldStreak.tsx` — AFTER (entire file)

```tsx
/**
 * Unfold Streak Widget — systemSmall + accessoryCircular
 * Shows current reading streak with a flame icon.
 * Designed for quick glances that motivate daily reading.
 *
 * WIDGET RUNTIME CONTRACT: the component body is serialized by
 * babel-preset-expo's widgets-plugin and re-evaluated inside the widget
 * extension's JS runtime. Only `props`, `environment`, and locals defined
 * INSIDE the function exist there — module-scope constants are NOT captured.
 * Keep palettes and URLs inside the function body.
 */
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { Text, VStack, HStack, ZStack, Image, Spacer } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  padding,
  background,
  lineLimit,
  truncationMode,
  kerning,
  accessibilityLabel,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';

type StreakWidgetProps = {
  streakCount: number;
  streakLongest: number;
  hasReadToday: boolean;
  devotionalTitle: string;
  dayNumber: number;
  totalDays: number;
};

const StreakWidget = (
  props: StreakWidgetProps,
  environment: WidgetEnvironment
) => {
  'widget';

  const streak = props.streakCount ?? 0;
  const hasRead = props.hasReadToday ?? false;
  const title = props.devotionalTitle ?? 'Start your series';
  const day = props.dayNumber ?? 0;
  const total = props.totalDays ?? 0;

  // Tap target: Today tab (no params — bare tab link cannot re-anchor the
  // active series). Matches push-notification-helpers' canonical route.
  const deepLink = 'unfold://(tabs)/(today)';

  // System-appearance palette. Dark = original shipped values; light mirrors
  // src/constants/colors.ts LightColors (keep in sync by hand — module-scope
  // imports are unavailable inside 'widget' functions). Unknown scheme → dark.
  const isLight = environment.colorScheme === 'light';
  const c = isLight
    ? {
        bg: '#FAF7F2',
        text: '#1C1710',
        textMuted: 'rgba(28,23,16,0.68)',
        textSubtle: 'rgba(28,23,16,0.55)',
        accent: '#866B2F',
      }
    : {
        bg: '#0A0A0A',
        text: '#F5F0EB',
        textMuted: 'rgba(245,240,235,0.5)',
        textSubtle: 'rgba(245,240,235,0.35)',
        accent: '#C8A55C',
      };

  if (environment.widgetFamily === 'accessoryCircular') {
    // Lock screen circular — use hierarchical styles for system tinting
    return (
      <ZStack
        modifiers={[
          accessibilityLabel(`${streak} day streak`),
          widgetURL(deepLink),
        ]}
      >
        <Image
          systemName={hasRead ? 'flame.fill' : 'flame'}
          size={18}
          modifiers={[
            foregroundStyle({ type: 'hierarchical', style: 'primary' }),
          ]}
        />
        <Text
          modifiers={[
            font({ size: 9, weight: 'semibold' }),
            foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            padding({ top: 24 }),
          ]}
        >
          {streak}
        </Text>
      </ZStack>
    );
  }

  // systemSmall — full widget
  return (
    <VStack
      modifiers={[
        padding({ all: 14 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
        background(c.bg),
        accessibilityLabel(
          `${streak} day reading streak. ${hasRead ? 'Read today.' : 'Not yet read today.'}`
        ),
        widgetURL(deepLink),
      ]}
    >
      {/* Streak number — hero element */}
      <VStack modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
        <HStack>
          <Image
            systemName={hasRead ? 'flame.fill' : 'flame'}
            size={18}
            color={c.accent}
          />
          <Text
            modifiers={[
              font({ size: 11, weight: 'medium' }),
              foregroundStyle(hasRead ? c.accent : c.textMuted),
              padding({ leading: 2 }),
            ]}
          >
            {hasRead ? 'day streak' : 'read today'}
          </Text>
        </HStack>

        <Text
          modifiers={[
            font({ size: 40, weight: 'bold', design: 'rounded' }),
            foregroundStyle(c.text),
            kerning(-1),
          ]}
        >
          {streak}
        </Text>
      </VStack>

      <Spacer />

      {/* Series progress — bottom section */}
      <VStack modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
        {total > 0 && (
          <Text
            modifiers={[
              font({ size: 12, weight: 'medium' }),
              foregroundStyle(c.textMuted),
            ]}
          >
            Day {day} of {total}
          </Text>
        )}

        <Text
          modifiers={[
            font({ size: 11, weight: 'regular' }),
            foregroundStyle(c.textSubtle),
            lineLimit(1),
            truncationMode('tail'),
          ]}
        >
          {title}
        </Text>
      </VStack>
    </VStack>
  );
};

export default createWidget('UnfoldStreak', StreakWidget);
```

Dark-value audit for this file (must hold — compare with the CURRENT file): `#0A0A0A` ← `background('#0A0A0A')` (was line 75); `#C8A55C` ← flame `color` (was 87) and read-label (was 92); `rgba(245,240,235,0.5)` ← read-label fallback (was 92) and "Day x of y" (was 119); `#F5F0EB` ← streak number (was 103); `rgba(245,240,235,0.35)` ← series title (was 129).

#### `src/widgets/ios/UnfoldToday.tsx` — AFTER (entire file)

```tsx
/**
 * Unfold Today Widget — systemMedium
 * Shows today's devotional with scripture reference, title, and streak.
 * Two-column layout: streak/progress left, content right.
 *
 * WIDGET RUNTIME CONTRACT: see UnfoldStreak.tsx — palettes/URLs must live
 * inside the function body.
 */
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { Text, VStack, HStack, Image, Spacer, Divider } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  padding,
  background,
  opacity,
  lineLimit,
  truncationMode,
  lineSpacing,
  kerning,
  accessibilityLabel,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';

type TodayWidgetProps = {
  streakCount: number;
  hasReadToday: boolean;
  devotionalTitle: string;
  dayTitle: string;
  dayNumber: number;
  totalDays: number;
  scriptureReference: string;
  quotableLine: string;
  readingMinutes: number;
};

const TodayWidget = (
  props: TodayWidgetProps,
  environment: WidgetEnvironment
) => {
  'widget';

  const streak = props.streakCount ?? 0;
  const hasRead = props.hasReadToday ?? false;
  const seriesTitle = props.devotionalTitle ?? 'Unfold';
  const dayTitle = props.dayTitle ?? 'Your daily reading';
  const day = props.dayNumber ?? 0;
  const total = props.totalDays ?? 0;
  const scripture = props.scriptureReference ?? '';
  const quote = props.quotableLine ?? '';
  const minutes = props.readingMinutes ?? 5;

  const deepLink = 'unfold://(tabs)/(today)';

  // Dark = original shipped values; light mirrors src/constants/colors.ts
  // LightColors with ink alphas raised for contrast. Unknown scheme → dark.
  const isLight = environment.colorScheme === 'light';
  const c = isLight
    ? {
        bg: '#FAF7F2',
        text: '#1C1710',
        t55: 'rgba(28,23,16,0.68)',
        t45: 'rgba(28,23,16,0.60)',
        t40: 'rgba(28,23,16,0.55)',
        t35: 'rgba(28,23,16,0.50)',
        t30: 'rgba(28,23,16,0.45)',
        accent: '#866B2F',
        accentSoft: 'rgba(134,107,47,0.85)',
      }
    : {
        bg: '#0A0A0A',
        text: '#F5F0EB',
        t55: 'rgba(245,240,235,0.55)',
        t45: 'rgba(245,240,235,0.45)',
        t40: 'rgba(245,240,235,0.4)',
        t35: 'rgba(245,240,235,0.35)',
        t30: 'rgba(245,240,235,0.3)',
        accent: '#C8A55C',
        accentSoft: 'rgba(200,165,92,0.8)',
      };

  return (
    <HStack
      modifiers={[
        padding({ all: 14 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
        background(c.bg),
        accessibilityLabel(
          `Today's reading: ${dayTitle}. ${scripture !== '' ? scripture + '.' : ''} ${streak} day streak. ${minutes} minute read.`
        ),
        widgetURL(deepLink),
      ]}
    >
      {/* Left column — streak + progress */}
      <VStack
        modifiers={[
          frame({ width: 60, alignment: 'center' }),
          padding({ trailing: 4 }),
        ]}
      >
        <Image
          systemName={hasRead ? 'flame.fill' : 'flame'}
          size={16}
          color={c.accent}
        />
        <Text
          modifiers={[
            font({ size: 30, weight: 'bold', design: 'rounded' }),
            foregroundStyle(c.text),
            kerning(-0.5),
          ]}
        >
          {streak}
        </Text>
        <Text
          modifiers={[
            font({ size: 10, weight: 'medium' }),
            foregroundStyle(hasRead ? c.accentSoft : c.t45),
          ]}
        >
          {hasRead ? 'streak' : 'read today'}
        </Text>

        <Spacer />

        {total > 0 && (
          <Text
            modifiers={[
              font({ size: 10, weight: 'medium' }),
              foregroundStyle(c.t30),
            ]}
          >
            {day}/{total}
          </Text>
        )}
      </VStack>

      {/* Divider — subtle but visible */}
      <Divider modifiers={[opacity(0.12), padding({ top: 2, bottom: 2 })]} />

      {/* Right column — today's reading */}
      <VStack
        modifiers={[
          padding({ leading: 10 }),
          frame({ maxWidth: Infinity, alignment: 'leading' }),
        ]}
      >
        <Text
          modifiers={[
            font({ size: 11, weight: 'semibold' }),
            foregroundStyle(c.accent),
            kerning(1.5),
          ]}
        >
          {seriesTitle.toUpperCase()}
        </Text>

        <Text
          modifiers={[
            font({ size: 15, weight: 'semibold' }),
            foregroundStyle(c.text),
            lineLimit(2),
            truncationMode('tail'),
            padding({ top: 1 }),
          ]}
        >
          {dayTitle}
        </Text>

        {scripture !== '' && (
          <Text
            modifiers={[
              font({ size: 11, weight: 'regular', design: 'serif' }),
              foregroundStyle(c.t55),
              padding({ top: 2 }),
            ]}
          >
            {scripture}
          </Text>
        )}

        <Spacer />

        {quote !== '' && (
          <Text
            modifiers={[
              font({ size: 11, weight: 'regular' }),
              foregroundStyle(c.t40),
              lineLimit(2),
              truncationMode('tail'),
              lineSpacing(2),
            ]}
          >
            {'“'}{quote}{'”'}
          </Text>
        )}

        <HStack modifiers={[padding({ top: 4 })]}>
          <Image
            systemName="clock"
            size={10}
            color={c.t35}
          />
          <Text
            modifiers={[
              font({ size: 10, weight: 'medium' }),
              foregroundStyle(c.t35),
              padding({ leading: 2 }),
            ]}
          >
            {minutes} min
          </Text>
        </HStack>
      </VStack>
    </HStack>
  );
};

export default createWidget('UnfoldToday', TodayWidget);
```

Dark-value audit: `t55`←scripture (was line 138), `t45`←read-today label (was 82), `t40`←quote (was 152), `t35`←clock icon+min (was 166/171), `t30`←day/total (was 94), `accentSoft`←`rgba(200,165,92,0.8)` (was 82), `accent`←`#C8A55C` (was 68/115).

#### `src/widgets/ios/UnfoldDashboard.tsx` — AFTER (entire file)

```tsx
/**
 * Unfold Dashboard Widget — systemLarge
 * Full devotional dashboard: verse of the day, streak, weekly progress,
 * and upcoming readings. For power users who want Unfold front-and-center.
 *
 * WIDGET RUNTIME CONTRACT: see UnfoldStreak.tsx — palettes/URLs must live
 * inside the function body.
 */
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import {
  Text,
  VStack,
  HStack,
  Image,
  Spacer,
  Divider,
} from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  padding,
  background,
  opacity,
  lineLimit,
  truncationMode,
  lineSpacing,
  kerning,
  accessibilityLabel,
  shapes,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';

type DashboardWidgetProps = {
  streakCount: number;
  streakLongest: number;
  hasReadToday: boolean;
  devotionalTitle: string;
  dayTitle: string;
  dayNumber: number;
  totalDays: number;
  scriptureReference: string;
  scriptureText: string;
  quotableLine: string;
  readingMinutes: number;
  /** Comma-separated: 1 = read, 0 = not read, for the 7 days M-Su */
  weeklyProgress: string;
  nextDayTitle: string;
};

const DashboardWidget = (
  props: DashboardWidgetProps,
  environment: WidgetEnvironment
) => {
  'widget';

  const streak = props.streakCount ?? 0;
  const hasRead = props.hasReadToday ?? false;
  const seriesTitle = props.devotionalTitle ?? 'Unfold';
  const dayTitle = props.dayTitle ?? 'Start your series';
  const day = props.dayNumber ?? 0;
  const total = props.totalDays ?? 0;
  const scripture = props.scriptureReference ?? '';
  const verse = props.scriptureText ?? '';
  const quote = props.quotableLine ?? '';
  const minutes = props.readingMinutes ?? 5;
  const weekly = props.weeklyProgress ?? '0,0,0,0,0,0,0';
  const nextTitle = props.nextDayTitle ?? '';

  const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const weekBits = weekly.split(',').map((d: string) => d === '1');

  const deepLink = 'unfold://(tabs)/(today)';

  // Dark = original shipped values; light mirrors src/constants/colors.ts
  // LightColors with ink alphas raised for contrast. Unknown scheme → dark.
  const isLight = environment.colorScheme === 'light';
  const c = isLight
    ? {
        bg: '#FAF7F2',
        text: '#1C1710',
        t75: 'rgba(28,23,16,0.85)',
        t65: 'rgba(28,23,16,0.78)',
        t45: 'rgba(28,23,16,0.60)',
        t40: 'rgba(28,23,16,0.55)',
        t35: 'rgba(28,23,16,0.50)',
        t30: 'rgba(28,23,16,0.45)',
        t25: 'rgba(28,23,16,0.40)',
        t15: 'rgba(28,23,16,0.18)',
        accent: '#866B2F',
        accentSoft: 'rgba(134,107,47,0.75)',
        accentFill: 'rgba(134,107,47,0.10)',
      }
    : {
        bg: '#0A0A0A',
        text: '#F5F0EB',
        t75: 'rgba(245,240,235,0.75)',
        t65: 'rgba(245,240,235,0.65)',
        t45: 'rgba(245,240,235,0.45)',
        t40: 'rgba(245,240,235,0.4)',
        t35: 'rgba(245,240,235,0.35)',
        t30: 'rgba(245,240,235,0.3)',
        t25: 'rgba(245,240,235,0.25)',
        t15: 'rgba(245,240,235,0.15)',
        accent: '#C8A55C',
        accentSoft: 'rgba(200,165,92,0.7)',
        accentFill: 'rgba(200,165,92,0.1)',
      };

  return (
    <VStack
      modifiers={[
        padding({ all: 16 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
        background(c.bg),
        accessibilityLabel(
          `Unfold dashboard. ${dayTitle}. Day ${day} of ${total}. ${streak} day streak. ${scripture !== '' ? scripture : ''}`
        ),
        widgetURL(deepLink),
      ]}
    >
      {/* Header row: series + day title left, streak right */}
      <HStack modifiers={[frame({ maxWidth: Infinity })]}>
        <VStack modifiers={[frame({ alignment: 'leading' })]}>
          <Text
            modifiers={[
              font({ size: 11, weight: 'semibold' }),
              foregroundStyle(c.accent),
              kerning(1.5),
            ]}
          >
            {seriesTitle.toUpperCase()}
          </Text>
          <Text
            modifiers={[
              font({ size: 17, weight: 'semibold' }),
              foregroundStyle(c.text),
              lineLimit(1),
              truncationMode('tail'),
              padding({ top: 1 }),
            ]}
          >
            {dayTitle}
          </Text>
          {total > 0 && (
            <Text
              modifiers={[
                font({ size: 11, weight: 'regular' }),
                foregroundStyle(c.t40),
                padding({ top: 2 }),
              ]}
            >
              Day {day} of {total}
            </Text>
          )}
        </VStack>

        <Spacer />

        {/* Streak badge */}
        <VStack
          modifiers={[
            padding({ all: 8 }),
            background(c.accentFill, shapes.roundedRectangle({ cornerRadius: 10 })),
          ]}
        >
          <Image
            systemName={hasRead ? 'flame.fill' : 'flame'}
            size={16}
            color={c.accent}
          />
          <Text
            modifiers={[
              font({ size: 22, weight: 'bold', design: 'rounded' }),
              foregroundStyle(c.text),
              kerning(-0.5),
            ]}
          >
            {streak}
          </Text>
        </VStack>
      </HStack>

      <Divider modifiers={[opacity(0.08), padding({ top: 10, bottom: 10 })]} />

      {/* Scripture quote — the centerpiece */}
      {verse !== '' ? (
        <VStack
          modifiers={[
            frame({ maxWidth: Infinity, alignment: 'leading' }),
            padding({ top: 2, bottom: 4 }),
          ]}
        >
          <Text
            modifiers={[
              font({ size: 14, weight: 'regular', design: 'serif' }),
              foregroundStyle(c.t75),
              lineLimit(4),
              truncationMode('tail'),
              lineSpacing(3),
            ]}
          >
            {verse}
          </Text>
          {scripture !== '' && (
            <Text
              modifiers={[
                font({ size: 11, weight: 'semibold' }),
                foregroundStyle(c.accent),
                padding({ top: 6 }),
              ]}
            >
              {scripture}
            </Text>
          )}
        </VStack>
      ) : quote !== '' ? (
        <VStack
          modifiers={[
            frame({ maxWidth: Infinity, alignment: 'leading' }),
            padding({ top: 2, bottom: 4 }),
          ]}
        >
          <Text
            modifiers={[
              font({ size: 14, weight: 'regular', design: 'serif' }),
              foregroundStyle(c.t65),
              lineLimit(3),
              truncationMode('tail'),
              lineSpacing(3),
            ]}
          >
            {'“'}{quote}{'”'}
          </Text>
        </VStack>
      ) : null}

      <Spacer />

      {/* Weekly progress — evenly distributed */}
      <HStack
        modifiers={[
          frame({ maxWidth: Infinity }),
          padding({ top: 4, bottom: 4 }),
        ]}
      >
        {weekDays.map((dayLabel: string, i: number) => (
          <VStack
            key={dayLabel + i}
            modifiers={[
              frame({ maxWidth: Infinity }),
            ]}
          >
            <Image
              systemName={weekBits[i] ? 'checkmark.circle.fill' : 'circle'}
              size={14}
              color={weekBits[i] ? c.accent : c.t15}
            />
            <Text
              modifiers={[
                font({ size: 10, weight: weekBits[i] ? 'medium' : 'regular' }),
                foregroundStyle(weekBits[i] ? c.accentSoft : c.t25),
                padding({ top: 2 }),
              ]}
            >
              {dayLabel}
            </Text>
          </VStack>
        ))}
      </HStack>

      <Divider modifiers={[opacity(0.08), padding({ top: 6, bottom: 8 })]} />

      {/* Footer: reading time + next reading */}
      <HStack modifiers={[frame({ maxWidth: Infinity })]}>
        <HStack>
          <Image
            systemName="clock"
            size={11}
            color={c.t35}
          />
          <Text
            modifiers={[
              font({ size: 11, weight: 'medium' }),
              foregroundStyle(c.t35),
              padding({ leading: 2 }),
            ]}
          >
            {minutes} min
          </Text>
        </HStack>

        <Spacer />

        {nextTitle !== '' && (
          <HStack>
            <Text
              modifiers={[
                font({ size: 11, weight: 'regular' }),
                foregroundStyle(c.t30),
              ]}
            >
              Next:{' '}
            </Text>
            <Text
              modifiers={[
                font({ size: 11, weight: 'medium' }),
                foregroundStyle(c.t45),
                lineLimit(1),
                truncationMode('tail'),
              ]}
            >
              {nextTitle}
            </Text>
          </HStack>
        )}
      </HStack>
    </VStack>
  );
};

export default createWidget('UnfoldDashboard', DashboardWidget);
```

Dark-value audit: `t75`←verse (was 152), `t65`←quote (was 182), `t45`←next title (was 265), `t40`←"Day x of y" (was 104), `t35`←clock/min (was 237/242), `t30`←"Next:" (was 257), `t25`←weekday-off (was 218), `t15`←unfilled circle (was 212), `accentSoft`←weekday-on `rgba(200,165,92,0.7)` (was 218), `accentFill`←badge `rgba(200,165,92,0.1)` (was 119).

**Do NOT touch `src/widgets/ios/UnfoldReadingSession.tsx`** (Live Activity — NAT-5 is out of scope).

### Fix-2 verification

```bash
npx jest src/lib/__tests__/widget-source-contract.test.ts   # expected: all tests pass
npm run typecheck                                           # expected: exit 0
npm run lint                                                # expected: exit 0
```

Commit: `fix(RT-WIDGETS-3,RT-WIDGETS-4): widget deep links to Today tab; system-appearance palettes [audit]`

---

## Fix 3 — RT-WIDGETS-5 (P1) + RT-WIDGETS-6 (cheap P2): midnight timeline entry + cross-series weekly progress

### Context — the data-refresh contract, reasoned out

`syncWidgets()` is called from exactly two places (verified by grep at plan time):
- `src/app/(tabs)/(today)/index.tsx:303` — `useFocusEffect` on the Home screen ("Sync widget data whenever home screen mounts or re-focuses").
- `src/app/(tabs)/(today)/reading.tsx:876` — immediately after `recordStreakRead()` in the day-completion cascade.

So the app pushes fresh snapshots on Today-focus and on completion — but **never while closed**. Today's `updateSnapshot()` writes a SINGLE entry stamped `Date.now()` (see `node_modules/expo-widgets/src/Widgets.ts:56-58` — `updateSnapshot` is literally `updateTimeline([{timestamp: Date.now(), props}])`), and the provider returns `Timeline(entries:, policy: .atEnd)` (`node_modules/expo-widgets/ios/Widgets/TimelineProvider.swift:34`). `.atEnd` re-requests after the last entry, but re-reading UserDefaults yields the same single entry → the widget shows yesterday's `hasReadToday: true` flame forever until the app is opened (RT-WIDGETS-5).

**Fix (JS-only, no pod patch):** push TWO entries per sync — one for now, one dated at the **next local midnight** whose props are recomputed *as of that midnight* (`hasReadToday` flips to false; `weeklyProgress` recomputed for the new date, which also handles the Sunday→Monday window shift). WidgetKit switches to the midnight entry on its own at 00:00 with the app closed. After that, `.atEnd` re-requests return the same two (now past) entries and the midnight entry stays current — correct, since nothing can be read while the app is closed. Streak count intentionally stays as-last-synced at midnight (streak reconciliation is app-side; flipping the flame + label to "read today" is the staleness fix). We do NOT add background refresh/push (out of scope for 219).

**RT-WIDGETS-6 rides along:** `getWeeklyProgress` (currently `widget-bridge.ts:83-105`) only scans `state.getCurrentDevotional()`. While extracting it into the pure module (required for the midnight recompute anyway), make it scan **all** devotionals. Same helper, formula tests below cover it.

Vault rules in force: `deterministic-twin-paths-must-share-one-helper` (now-entry and midnight-entry MUST be built by the same `buildWidgetSharedProps(slice, forDate)` — never two prop-building code paths) and `deterministic-paths-must-receive-now-as-parameter` (no `new Date()` inside the pure module; `now` always a parameter).

**Out of scope here (do not "improve"):** the `hasReadToday` derivation stays `streakLastReadDate`-based (COR-9 is a separate finding); the sync race (RT-WIDGETS-7) stays; Live Activity functions in widget-bridge stay untouched.

### Failing tests FIRST

New file `src/lib/__tests__/widget-timeline.test.ts`. All expected values below are computed by formula: 2026-06-08 is a Monday, 2026-06-10 is a Wednesday, 2026-06-14 is a Sunday (`new Date(2026,5,10).getDay() === 3` — verified). Dates are constructed with local-time constructors so the tests are TZ-independent.

```ts
import {
  getNextMidnight,
  getWeeklyProgress,
  buildWidgetSharedProps,
  buildWidgetTimelineEntries,
  type WidgetStateSlice,
} from '@/lib/widget-timeline';

const day = (over: Record<string, unknown> = {}) => ({
  dayNumber: 1,
  title: 'Day title',
  scriptureReference: 'John 1:1',
  scriptureText: 'In the beginning…',
  bodyText: '',
  quotableLine: 'A line',
  isRead: false,
  ...over,
});

const devo = (days: unknown[], over: Record<string, unknown> = {}) =>
  ({
    id: 'd1',
    title: 'Quiet Path Series',
    totalDays: 3,
    currentDay: 1,
    days,
    createdAt: '2026-06-01',
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    ...over,
  }) as never;

const slice = (over: Partial<WidgetStateSlice> = {}): WidgetStateSlice => ({
  streakCurrent: 3,
  streakLongest: 5,
  streakLastReadDate: null,
  readingDuration: 5,
  currentDevotional: null,
  allDevotionals: [],
  ...over,
});

describe('getNextMidnight', () => {
  it('returns 00:00:00.000 of the next calendar day', () => {
    const now = new Date(2026, 5, 10, 20, 15, 30, 123); // Wed Jun 10, 20:15
    expect(getNextMidnight(now).getTime()).toBe(new Date(2026, 5, 11, 0, 0, 0, 0).getTime());
  });

  it('rolls over month boundaries', () => {
    const now = new Date(2026, 5, 30, 23, 59, 59);
    expect(getNextMidnight(now).getTime()).toBe(new Date(2026, 6, 1, 0, 0, 0, 0).getTime());
  });
});

describe('getWeeklyProgress (M-Su bits)', () => {
  it('is all zeros with no devotionals', () => {
    expect(getWeeklyProgress([], new Date(2026, 5, 10, 14, 0))).toBe('0,0,0,0,0,0,0');
  });

  it('marks read days of the current week', () => {
    const d = devo([
      day({ dayNumber: 1, readAt: new Date(2026, 5, 8, 9, 0).toISOString() }), // Mon
      day({ dayNumber: 2, readAt: new Date(2026, 5, 10, 9, 0).toISOString() }), // Wed
    ]);
    expect(getWeeklyProgress([d], new Date(2026, 5, 10, 14, 0))).toBe('1,0,1,0,0,0,0');
  });

  it('aggregates ACROSS devotionals (RT-WIDGETS-6)', () => {
    const a = devo([day({ dayNumber: 1, readAt: new Date(2026, 5, 8, 9, 0).toISOString() })]);
    const b = devo(
      [day({ dayNumber: 1, readAt: new Date(2026, 5, 9, 9, 0).toISOString() })],
      { id: 'd2', title: 'Other Series' }
    );
    expect(getWeeklyProgress([a, b], new Date(2026, 5, 10, 14, 0))).toBe('1,1,0,0,0,0,0');
  });

  it('Sunday read shows in slot 7; next-midnight (Monday) starts a fresh week', () => {
    const sundayNight = new Date(2026, 5, 14, 23, 0); // Sun Jun 14
    const d = devo([day({ dayNumber: 1, readAt: new Date(2026, 5, 14, 8, 0).toISOString() })]);
    expect(getWeeklyProgress([d], sundayNight)).toBe('0,0,0,0,0,0,1');
    expect(getWeeklyProgress([d], getNextMidnight(sundayNight))).toBe('0,0,0,0,0,0,0');
  });
});

describe('buildWidgetSharedProps', () => {
  it('hasReadToday compares streakLastReadDate against forDate (not wall clock)', () => {
    const s = slice({ streakLastReadDate: new Date(2026, 5, 10, 9, 0).toISOString() });
    expect(buildWidgetSharedProps(s, new Date(2026, 5, 10, 14, 0)).hasReadToday).toBe(true);
    expect(buildWidgetSharedProps(s, new Date(2026, 5, 11, 0, 0)).hasReadToday).toBe(false);
  });

  it('fills safe defaults with no devotional', () => {
    const p = buildWidgetSharedProps(slice(), new Date(2026, 5, 10, 14, 0));
    expect(p.devotionalTitle).toBe('Unfold');
    expect(p.dayTitle).toBe('Start your series');
    expect(p.dayNumber).toBe(0);
    expect(p.totalDays).toBe(0);
    expect(p.weeklyProgress).toBe('0,0,0,0,0,0,0');
  });
});

describe('buildWidgetTimelineEntries', () => {
  it('returns [now, nextMidnight] entries built by the SAME helper', () => {
    const now = new Date(2026, 5, 10, 14, 0);
    const s = slice({ streakLastReadDate: new Date(2026, 5, 10, 9, 0).toISOString() });
    const entries = buildWidgetTimelineEntries(s, now);
    expect(entries).toHaveLength(2);
    expect(entries[0].date.getTime()).toBe(now.getTime());
    expect(entries[1].date.getTime()).toBe(new Date(2026, 5, 11, 0, 0, 0, 0).getTime());
    expect(entries[0].props.hasReadToday).toBe(true);
    expect(entries[1].props.hasReadToday).toBe(false); // the staleness fix
    expect(entries[0].props.streakCount).toBe(3);
    expect(entries[1].props.streakCount).toBe(3); // streak not zeroed at midnight
  });
});
```

Also extend the contract suite — append to `src/lib/__tests__/widget-source-contract.test.ts`:

```ts
describe('widget-bridge timeline contract (RT-WIDGETS-5)', () => {
  const bridge = fs.readFileSync(
    path.join(repoRoot, 'src/lib/widget-bridge.ts'),
    'utf-8'
  );

  it('pushes multi-entry timelines, never single snapshots', () => {
    expect(bridge).toContain('buildWidgetTimelineEntries');
    expect(bridge.split('.updateTimeline(entries)').length - 1).toBe(3);
    expect(bridge).not.toContain('updateSnapshot(');
  });

  it('has no duplicate weekly-progress logic (single helper owns it)', () => {
    expect(bridge).not.toContain('function getWeeklyProgress');
    expect(bridge).not.toContain('mondayOffset');
  });
});
```

`npx jest src/lib/__tests__/widget-timeline.test.ts` must fail to even resolve the module before the fix; the bridge contract tests must fail. After the fix, all pass.

### Edit 1 — NEW file `src/lib/widget-timeline.ts`

```ts
/**
 * Pure widget-timeline computation. NO native/zustand imports — keep this
 * module unit-testable and side-effect free. widget-bridge.ts owns the
 * native push; this module owns ALL date math.
 *
 * Vault rules in force here:
 * - deterministic-paths-must-receive-now-as-parameter: never call new Date()
 *   in this module; `now`/`forDate` are always parameters.
 * - deterministic-twin-paths-must-share-one-helper: the "now" entry and the
 *   "midnight" entry are both built by buildWidgetSharedProps.
 */
import type { Devotional } from '@/lib/store';

export type WidgetSharedProps = {
  streakCount: number;
  streakLongest: number;
  hasReadToday: boolean;
  devotionalTitle: string;
  dayTitle: string;
  dayNumber: number;
  totalDays: number;
  scriptureReference: string;
  scriptureText: string;
  quotableLine: string;
  readingMinutes: number;
  weeklyProgress: string;
  nextDayTitle: string;
};

export type WidgetStateSlice = {
  streakCurrent: number;
  streakLongest: number;
  streakLastReadDate: string | null;
  readingDuration: number;
  currentDevotional: Devotional | null | undefined;
  allDevotionals: Devotional[];
};

/** 00:00:00.000 of the next local calendar day. */
export function getNextMidnight(now: Date): Date {
  const next = new Date(now);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + 1);
  return next;
}

/**
 * Build a comma-separated "1"/"0" string for M-Su of forDate's week.
 * Scans ALL devotionals (RT-WIDGETS-6): a day counts as read if any series
 * has a readAt on that calendar date.
 */
export function getWeeklyProgress(devotionals: Devotional[], forDate: Date): string {
  const dayOfWeek = forDate.getDay(); // 0=Sun, 1=Mon...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const bits: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(forDate);
    d.setDate(d.getDate() + mondayOffset + i);
    const dateStr = d.toDateString();

    const wasRead = devotionals.some((devotional) =>
      (devotional.days ?? []).some(
        (dayItem) => dayItem.readAt && new Date(dayItem.readAt).toDateString() === dateStr
      )
    );
    bits.push(wasRead ? '1' : '0');
  }

  return bits.join(',');
}

/** Snapshot of widget props as they should appear AT forDate. */
export function buildWidgetSharedProps(slice: WidgetStateSlice, forDate: Date): WidgetSharedProps {
  const devotional = slice.currentDevotional;

  const hasReadToday = slice.streakLastReadDate
    ? new Date(slice.streakLastReadDate).toDateString() === forDate.toDateString()
    : false;

  const currentDay = devotional?.days?.find((d) => d.dayNumber === devotional.currentDay);
  const nextDay = devotional?.days?.find(
    (d) => d.dayNumber === (devotional?.currentDay ?? 0) + 1
  );

  return {
    streakCount: slice.streakCurrent,
    streakLongest: slice.streakLongest,
    hasReadToday,
    devotionalTitle: devotional?.title ?? 'Unfold',
    dayTitle: currentDay?.title ?? 'Start your series',
    dayNumber: devotional?.currentDay ?? 0,
    totalDays: devotional?.totalDays ?? 0,
    scriptureReference: currentDay?.scriptureReference ?? '',
    scriptureText: currentDay?.scriptureText ?? '',
    quotableLine: currentDay?.quotableLine ?? '',
    readingMinutes: slice.readingDuration,
    weeklyProgress: getWeeklyProgress(slice.allDevotionals, forDate),
    nextDayTitle: nextDay?.title ?? '',
  };
}

/**
 * Two-entry timeline: current state now + recomputed state at next midnight,
 * so WidgetKit flips "read today" off at 00:00 without the app running
 * (RT-WIDGETS-5). Streak count intentionally stays as-last-synced; streak
 * reconciliation is app-side.
 */
export function buildWidgetTimelineEntries(
  slice: WidgetStateSlice,
  now: Date
): { date: Date; props: WidgetSharedProps }[] {
  const midnight = getNextMidnight(now);
  return [
    { date: now, props: buildWidgetSharedProps(slice, now) },
    { date: midnight, props: buildWidgetSharedProps(slice, midnight) },
  ];
}
```

(`import type { Devotional } from '@/lib/store'` is type-only — erased at compile, so this module pulls in zero runtime deps. `Devotional`/`DevotionalDay` are exported interfaces at `src/lib/store.ts:221`/`:184`; `readAt?: string` is at `:192`.)

### Edit 2 — `src/lib/widget-bridge.ts`

Replace the `syncWidgets` function AND delete the local `getWeeklyProgress` entirely.

CURRENT (lines 29-105 — the whole `syncWidgets` + `getWeeklyProgress` block; re-read it on disk first):

```ts
export function syncWidgets(): void {
  try {
    const state = useUnfoldStore.getState();
    const devotional = state.getCurrentDevotional();

    const today = new Date().toDateString();
    const hasReadToday = state.streakLastReadDate
      ? new Date(state.streakLastReadDate).toDateString() === today
      : false;
    // … sharedProps assembly …
    UnfoldStreakWidget.updateSnapshot(sharedProps);
    UnfoldTodayWidget.updateSnapshot(sharedProps);
    UnfoldDashboardWidget.updateSnapshot(sharedProps);
  } catch (error) {
    logger.log('[Widgets] sync error (non-fatal):', error);
  }
}

function getWeeklyProgress(state: ReturnType<typeof useUnfoldStore.getState>): string {
  // … Monday-anchored loop over ONLY state.getCurrentDevotional() …
}
```

AFTER — `syncWidgets` becomes (and `getWeeklyProgress` is **deleted from this file**):

```ts
/**
 * Push current app state to all widgets as a two-entry timeline
 * (now + next midnight) so the "read today" state self-expires at 00:00.
 * Call this whenever streak, devotional, or reading state changes.
 */
export function syncWidgets(): void {
  try {
    const state = useUnfoldStore.getState();

    const entries = buildWidgetTimelineEntries(
      {
        streakCurrent: state.streakCurrent,
        streakLongest: state.streakLongest,
        streakLastReadDate: state.streakLastReadDate,
        readingDuration: state.user?.readingDuration ?? 5,
        currentDevotional: state.getCurrentDevotional(),
        allDevotionals: state.devotionals ?? [],
      },
      new Date()
    );

    UnfoldStreakWidget.updateTimeline(entries);
    UnfoldTodayWidget.updateTimeline(entries);
    UnfoldDashboardWidget.updateTimeline(entries);
  } catch (error) {
    // Widgets may not be configured yet — fail silently
    logger.log('[Widgets] sync error (non-fatal):', error);
  }
}
```

Add the import near the top with the other `@/lib` imports:

```ts
import { buildWidgetTimelineEntries } from '@/lib/widget-timeline';
```

Leave everything else in widget-bridge.ts (Live Activity section, simulator detection, `endReadingSession`'s `syncWidgets()` call) **exactly as-is**.

Type sanity: each widget instance is `Widget<OwnPropsType>`; `updateTimeline(entries: WidgetTimelineEntry<OwnPropsType>[])` accepts our entries because `WidgetSharedProps` is a structural superset of all three widgets' prop types and `entries` is a variable, not a fresh literal (no excess-property check) — same pattern the old `updateSnapshot(sharedProps)` relied on. `state.devotionals` exists on the store (used e.g. at `reading.tsx:887`).

### Fix-3 verification

```bash
npx jest src/lib/__tests__/widget-timeline.test.ts src/lib/__tests__/widget-source-contract.test.ts
# expected: 2 suites passed, 0 failures
npm run typecheck   # exit 0
npm run lint        # exit 0
```

Commit: `fix(RT-WIDGETS-5,RT-WIDGETS-6): two-entry widget timeline with midnight expiry; weekly progress across all series [audit]`

---

## Fix 4 — RT-WIDGETS-2: reclassify, document, define device verification (NO code)

The empty widget gallery is on the **iOS 26.5 beta simulator** only: three repro attempts showed `add-sheet-collection-view` with zero children for ALL third-party apps while Apple's pre-placed widgets work, `chronod` had no third-party descriptors, and — decisive counter-evidence — **Nick's physical iPhone on build 218 HAS the Unfold widgets installed** (they're blank, which is NAT-1, not absence). Conclusion: simulator/iOS-beta gallery enumeration artifact, possibly compounded by the missing entitlement pre-fix. Not a shippable-code defect; no code change unless device evidence emerges after 219.

Append this block to `AUDIT-STATE.md` (under the "## P0 triage (NAT-1, 2026-06-10)" section, after its last paragraph):

```md
## RT-WIDGETS-2 reclassification (plan 05)

P0 → P2-verify. Evidence: empty add-widget gallery reproduces ONLY on the iOS 26.5
beta simulator (zero third-party descriptors in chronod; Apple widgets fine), while
Nick's physical iPhone on 218 HAS the Unfold widgets installed (blank = NAT-1, fixed
this plan). Verdict: simulator/iOS-beta gallery artifact, not app code. Action: no
code fix; verify on physical device after build 219 per plans/05 §Part C step C4.
If the gallery is ALSO empty on a physical device running release iOS, reopen as P1
against expo-widgets extension registration.
```

Commit: `docs(RT-WIDGETS-2): reclassify widget-gallery emptiness as iOS-26.5-beta sim artifact; device verification deferred to 219 [audit]`

---

## VERIFICATION GATES

### Part A — JS gates (run after each fix; full pass at the end)

```bash
npx jest src/lib/__tests__/widget-app-group-config.test.ts \
        src/lib/__tests__/widget-source-contract.test.ts \
        src/lib/__tests__/widget-timeline.test.ts
# expected: Test Suites: 3 passed; 0 failures

npm run typecheck    # exit 0, no output
npm run lint         # exit 0
npx jest --runInBand # expected: 0 failures (round-1 baseline was 108 suites/723 tests;
                     # your 3 new suites add to that; absolute counts may differ if
                     # plan-04 landed first — the gate is ZERO failures)
```

### Part B — local native build + simulator runtime (no signing gate needed; simulator builds don't use provisioning profiles)

Use FlowDeck (this machine's required wrapper for Apple tooling — never call `xcodebuild`/`xcrun`/`simctl` directly). Simulator from the audit loop: **iPhone 17 Pro `E292C8E3-EF98-4FF4-A19F-AD4B91877AB6`**.

**B1 — build:**

```bash
flowdeck build \
  --workspace ios/Unfold.xcworkspace --scheme Unfold --configuration Debug \
  --simulator E292C8E3-EF98-4FF4-A19F-AD4B91877AB6 \
  --derived-data-path /tmp/unfold-219-derived-data --json
# expected: terminal JSON event reports build success / exit 0
```

**B2 — entitlement dump (the codesign proof NAT-1 is fixed):**

```bash
APP=/tmp/unfold-219-derived-data/Build/Products/Debug-iphonesimulator/Unfold.app
codesign -d --entitlements :- "$APP" 2>/dev/null | grep -A 3 application-groups
codesign -d --entitlements :- "$APP/PlugIns/ExpoWidgetsTarget.appex" 2>/dev/null | grep -A 3 application-groups
```

Expected for BOTH commands (output formatting varies by macOS — XML vs pretty-print — the success criterion is the key AND the group string both appearing):

```
<key>com.apple.security.application-groups</key>
<array>
  <string>group.com.unfoldapp.ios</string>
</array>
```

If either binary lacks the key → STOP (the pbxproj entitlements wiring assumption broke; report, do not edit the pbxproj yourself).

**B3 — runtime: shared container actually used.** Uninstall first so the stale fallback container can't fool you, then run with Metro:

```bash
flowdeck uninstall --simulator E292C8E3-EF98-4FF4-A19F-AD4B91877AB6 com.unfoldapp.ios   # ok if "not installed"
# Metro may already be running from the audit loop — check: lsof -i :8081
# if not: start `npx expo start` in the background from the worktree root
flowdeck run \
  --workspace ios/Unfold.xcworkspace --scheme Unfold --configuration Debug \
  --simulator E292C8E3-EF98-4FF4-A19F-AD4B91877AB6 \
  --derived-data-path /tmp/unfold-219-derived-data --json
```

Drive the app to the Today screen (its focus effect fires `syncWidgets()` — for a fresh install, complete/skip whatever the launch gate requires or use the QA seed routes the audit used). Then:

```bash
SIM=E292C8E3-EF98-4FF4-A19F-AD4B91877AB6
PLIST=$(find ~/Library/Developer/CoreSimulator/Devices/$SIM/data/Containers/Shared/AppGroup \
  -name 'group.com.unfoldapp.ios.plist' 2>/dev/null | head -1)
echo "$PLIST"        # expected: ONE path under Containers/Shared/AppGroup/<UUID>/Library/Preferences/
plutil -p "$PLIST" | grep -c '__expo_widgets'   # expected: >= 7 (3 widget layouts + 3 timelines + live-activity layout)
plutil -p "$PLIST" | grep -A 30 'UnfoldStreak_timeline'
# expected: an array with TWO entries, each a dict with "props" and "timestamp";
# the second timestamp = upcoming local midnight in epoch-millis (RT-WIDGETS-5 proof)
```

Pre-fix, the audit found this plist in the app's OWN container and `Containers/Shared/AppGroup` empty — the path moving to Shared/AppGroup is the NAT-1 runtime proof.

**B4 — deep link resolution (independent of widget placement):**

```bash
npx uri-scheme open "unfold://(tabs)/(today)" --ios
flowdeck ui simulator --help   # find the screenshot/capture subcommand, then capture
```

Expected: the app foregrounds on the **Today tab** (not the launch gate `/`). Capture a screenshot as evidence. If it lands on `/` or errors, STOP and report (do not invent an alternate URL format — flag it; `unfold:///(tabs)/(today)` with triple slash is the one sanctioned fallback to TRY and report on).

**B5 — widget gallery on simulator: attempt, but it is EXPECTED to still be empty** (RT-WIDGETS-2 — iOS 26.5 beta artifact). Long-press home screen → "+" → search Unfold. Document the result either way; an empty gallery here is NOT a failure gate for this plan. If widgets DO appear post-fix, place all three, screenshot dark + light appearance (Settings → Developer → Dark Appearance toggle), and verify a tap routes to Today — bonus evidence, attach it.

### Part C — Nick-gated protocol (STAGE ONLY — write this into your final report; do NOT execute)

> **Gate:** `eas build`, `eas credentials`, any Apple Developer Portal change, and the 219 TestFlight cut are Nick's calls. Everything below happens only after his explicit go.

- **C1 — signing path (primary):** `eas build --profile qa-testflight --platform ios` (auto-increments to build 219; `appVersionSource: remote` — no code edit needed for the number). EAS's automatic capability sync should detect `com.apple.security.application-groups` in both entitlements files, register app group `group.com.unfoldapp.ios` on the portal, enable the App Groups capability on `com.unfoldapp.ios` AND `com.unfoldapp.ios.widgets`, and regenerate both provisioning profiles. Watch the build log for the capability-sync step.
- **C2 — signing path (fallback if C1 errors on capabilities):** developer.apple.com → Certificates, Identifiers & Profiles → Identifiers: (a) register App Group `group.com.unfoldapp.ios`; (b) edit App ID `com.unfoldapp.ios` → enable App Groups → assign the group; (c) same for `com.unfoldapp.ios.widgets`; (d) re-run `eas build` (or `eas credentials` → regenerate profiles first).
- **C3 — IPA verification before TestFlight submit:** download the .ipa, then:
  ```bash
  unzip -q Unfold.ipa -d /tmp/unfold-219-ipa
  codesign -d --entitlements :- /tmp/unfold-219-ipa/Payload/Unfold.app | grep -A 3 application-groups
  codesign -d --entitlements :- /tmp/unfold-219-ipa/Payload/Unfold.app/PlugIns/ExpoWidgetsTarget.appex | grep -A 3 application-groups
  security cms -D -i /tmp/unfold-219-ipa/Payload/Unfold.app/embedded.mobileprovision | grep -A 3 application-groups
  ```
  All three must show `group.com.unfoldapp.ios`. If the profile lacks it, the capability sync didn't take — back to C2.
- **C4 — physical-device acceptance (Nick's iPhone, build 219 via TestFlight):**
  1. Widgets show real data (streak/series) — NAT-1 closed. **This also closes RT-WIDGETS-1.**
  2. Widget gallery lists all three Unfold widgets — RT-WIDGETS-2 resolved as sim artifact (if STILL empty on device: reopen RT-WIDGETS-2 as P1, per the AUDIT-STATE note).
  3. Tap each widget → app opens on the Today tab — RT-WIDGETS-3 closed.
  4. Toggle device light mode → widgets re-render with the cream/ink palette — RT-WIDGETS-4 closed.
  5. Read today, confirm flame filled; after midnight (no app open), widget shows "read today" un-filled state with streak intact — RT-WIDGETS-5 closed.

---

## OUT OF SCOPE — do not touch, even if you see the problem

- `src/widgets/ios/UnfoldReadingSession.tsx` and the Live Activity functions in widget-bridge (NAT-5: never-ended Live Activity — separate finding).
- COR-9 (divergent `hasReadToday` definitions app-vs-widget) and COR-10 (deep links with `devotionalId` re-anchor the series) — the widget links deliberately carry no params; nothing else.
- RT-WIDGETS-7 (sync race with in-flight pull) — P2, separate.
- NAT-8 (RedBox if widget added before first app launch) — inherent to expo-widgets' layout-in-UserDefaults design; not fixable from JS.
- `ios/Unfold.xcodeproj/project.pbxproj`, all Swift files, `Podfile*`, anything under `node_modules/` or `patches/`.
- Paywall/celebration/Dynamic Type findings — plan 04's batch.
- Android: no Android widgets are configured (`"widgets"` only under the iOS-shaped config); do not add any.
- AppIntents / interactive widget buttons / `containerBackground` migration — explicitly deferred (minimal-risk 219; `containerBackground('…','widget')` exists in `@expo/ui` if a later build wants proper iOS-17 container behavior, noted for the roadmap).

## STOP-ON-DRIFT CONDITIONS

1. Any CURRENT-code excerpt above doesn't match the file on disk → STOP, report the diff.
2. `npm run typecheck`/`lint`/jest failures you cannot trace to your own edit → STOP.
3. **Never** run `npx expo prebuild`, `expo install --fix`, or `pod install` with config changes — non-CNG repo; prebuild would regenerate `ios/` (gotcha: `expo-install-fix-destabilizes-monorepo`).
4. **Never** run `eas build`/`eas credentials`/portal mutations (Part C is Nick's).
5. The dark palette literals in the three TSX files must remain exactly the shipped values enumerated in each "Dark-value audit" — if you cannot preserve one, STOP.
6. If `widgetURL` or `WidgetEnvironment` fails to import/typecheck from the installed packages → STOP (version drift; do not hand-roll a modifier).
7. Do not commit `ios/Podfile.lock`.
8. If module-scope helpers feel "cleaner" inside the widget TSX files — re-read Architecture Primer #4 and don't.
