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
