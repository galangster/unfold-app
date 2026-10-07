import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.join(__dirname, '../../..');
const widgetDir = path.join(repoRoot, 'src/widgets/ios');
const read = (name: string) => fs.readFileSync(path.join(widgetDir, name), 'utf-8');

// Home Screen widgets paint their own palette for the system color scheme.
const HOME_WIDGET_FILES = ['UnfoldStreak.tsx', 'UnfoldToday.tsx', 'UnfoldDashboard.tsx'];
// Lock Screen widgets render in the system's vibrant mode: hierarchical styles only.
const LOCK_WIDGET_FILES = ['UnfoldVerse.tsx'];
const WIDGET_FILES = [...HOME_WIDGET_FILES, ...LOCK_WIDGET_FILES];
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

  it.each(HOME_WIDGET_FILES)('%s adapts to the system color scheme', (file) => {
    const src = read(file);
    const directive = src.indexOf("'widget';");
    const schemeCheck = src.indexOf("environment.colorScheme === 'light'");
    expect(directive).toBeGreaterThan(-1);
    // palette must be computed INSIDE the serialized function body (after the directive)
    expect(schemeCheck).toBeGreaterThan(directive);
  });

  it.each(HOME_WIDGET_FILES)('%s dark palette is unchanged from the shipped values', (file) => {
    const src = read(file);
    expect(src).toContain("'#0A0A0A'"); // still present — as the dark token value
    expect(src).toContain("'#F5F0EB'");
    expect(src).toContain("'#C8A55C'");
  });

  it.each(LOCK_WIDGET_FILES)('%s uses hierarchical system styles, never fixed colors', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(src).toContain("foregroundStyle({ type: 'hierarchical', style: 'primary' })");
    expect(src).toContain("foregroundStyle({ type: 'hierarchical', style: 'secondary' })");
  });
});

describe('widget-bridge timeline contract (RT-WIDGETS-5)', () => {
  const bridge = fs.readFileSync(
    path.join(repoRoot, 'src/lib/widget-bridge.ts'),
    'utf-8'
  );

  it('pushes multi-entry timelines, never single snapshots', () => {
    expect(bridge).toContain('buildWidgetTimelineEntries');
    expect(bridge.split('.updateTimeline(entries)').length - 1).toBe(4);
    expect(bridge).not.toContain('updateSnapshot(');
  });

  it('has no duplicate weekly-progress logic (single helper owns it)', () => {
    expect(bridge).not.toContain('function getWeeklyProgress');
    expect(bridge).not.toContain('mondayOffset');
  });
});

// ios/ is committed and prebuild never runs, so each widget is registered by
// hand in five places. The Swift checks mirror the expo-widgets plugin's own
// generator, so a future prebuild would produce the same files.
describe('widget registration (hand-maintained ios/, no prebuild)', () => {
  type WidgetEntry = {
    name: string;
    displayName: string;
    description: string;
    supportedFamilies?: string[];
    ios?: { supportedFamilies?: string[] };
  };
  const appJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'app.json'), 'utf-8'));
  const widgets: WidgetEntry[] = appJson.expo.plugins.find(
    (p: unknown) => Array.isArray(p) && p[0] === 'expo-widgets'
  )[1].widgets;
  const targetDir = path.join(repoRoot, 'ios/ExpoWidgetsTarget');
  const indexSwift = fs.readFileSync(path.join(targetDir, 'index.swift'), 'utf-8');
  const pbxproj = fs.readFileSync(
    path.join(repoRoot, 'ios/Unfold.xcodeproj/project.pbxproj'),
    'utf-8'
  );
  const bridge = fs.readFileSync(path.join(repoRoot, 'src/lib/widget-bridge.ts'), 'utf-8');
  const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

  it('declares UnfoldVerse as an iOS-only Lock Screen widget', () => {
    expect(widgets.find((w) => w.name === 'UnfoldVerse')).toEqual({
      name: 'UnfoldVerse',
      displayName: "Today's Verse",
      description: "See today's verse from your series on your Lock Screen.",
      ios: {
        supportedFamilies: ['accessoryInline', 'accessoryRectangular', 'accessoryCircular'],
      },
      android: null,
    });
  });

  describe.each(widgets.map((w) => [w.name, w] as const))('%s', (name, widget) => {
    it('has a Swift widget whose kind, name, description and families match app.json', () => {
      const swift = fs.readFileSync(path.join(targetDir, `${name}.swift`), 'utf-8');
      const families = widget.ios?.supportedFamilies ?? widget.supportedFamilies ?? [];
      expect(families.length).toBeGreaterThan(0);
      expect(swift).toContain(`struct ${name}: Widget {`);
      expect(swift).toContain(`let name: String = "${name}"`);
      expect(swift).toContain(`.configurationDisplayName(${JSON.stringify(widget.displayName)})`);
      expect(swift).toContain(`.description(${JSON.stringify(widget.description)})`);
      expect(swift).toContain(`.supportedFamilies([.${families.join(', .')}])`);
    });

    it('is in the widget bundle and in the extension target sources', () => {
      expect(indexSwift).toContain(`    ${name}()\n`);
      // PBXBuildFile entry + Sources build phase entry
      expect(count(pbxproj, `/* ${name}.swift in Sources */`)).toBe(2);
      // PBXFileReference entry + the build file's fileRef + ExpoWidgetsTarget group child
      expect(count(pbxproj, `/* ${name}.swift */`)).toBe(3);
    });

    it('has a JS layout that the bridge registers and feeds', () => {
      expect(read(`${name}.tsx`)).toContain(`createWidget('${name}',`);
      expect(bridge).toContain(`from '@/widgets/ios/${name}';`);
      expect(bridge).toContain(`${name}Widget.updateTimeline(entries);`);
    });
  });
});
