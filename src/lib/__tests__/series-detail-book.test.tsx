import React from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import { canonicalGeneratedDayId } from '../devotional-canonical-days';
import type { Devotional, DevotionalDay } from '../store';

jest.mock('react-native-gesture-handler', () => ({ GestureDetector: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/book/useBookPageOpening', () => ({
  useBookPageOpening: ({ onContinue }: { onContinue: () => void }) => ({ open: onContinue, gesture: {}, showHint: false, hidden: false, onLayout: jest.fn() }),
}));

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockPush = jest.fn();
const mockSetCurrentDevotional = jest.fn();
let mockParams: { id?: string } = {};
let mockDevotionals: Devotional[] = [];
let mockCurrentDevotionalId: string | null = 'devo-1';
let mockFontScale = 1;

const now = new Date();
const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3, 12).toISOString();
const todayIso = now.toISOString();

function day(n: number, over: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    id: over.id ?? canonicalGeneratedDayId('devo-1', n),
    devotionalId: 'devo-1',
    dayNumber: n,
    title: `Day ${n} title`,
    scriptureReference: 'Psalm 46:1–11',
    scriptureText: 'Scripture',
    bodyText: 'Body',
    quotableLine: 'Be still, and know.',
    isRead: false,
    ...over,
  };
}

function withActs(over: Partial<Devotional> = {}): Devotional {
  return {
    id: 'devo-1',
    title: 'Ordinary Hours',
    totalDays: 14,
    currentDay: 4,
    createdAt: start,
    updatedAt: start,
    generationMode: 'progressive',
    seriesStartDate: start,
    days: [
      day(1, { isRead: true, readAt: start }),
      day(2, { isRead: true, readAt: start }),
      day(3, { isRead: true, readAt: start }),
      day(4, { title: 'Be still' }),
    ],
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    seriesArc: {
      totalDaysPlanned: 14,
      overarchingTheme: 'God in ordinary hours',
      narrativeShape: 'shape',
      dayHints: [],
      isOpenEnded: false,
      createdAt: start,
      acts: [
        { name: 'Wilderness', fromDay: 1, toDay: 7, function: 'Begin in the quiet.' },
        { name: 'A Quiet Place', fromDay: 8, toDay: 14, function: 'Stay with one word.' },
      ],
    },
    ...over,
  } as Devotional;
}

jest.mock('@/hooks/useCalendarNow', () => ({ useCalendarNow: () => new Date() }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, push: mockPush, back: jest.fn(), navigate: jest.fn() }),
  useSegments: () => [],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }) }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: unknown) => unknown) =>
    selector({
      devotionals: mockDevotionals,
      currentDevotionalId: mockCurrentDevotionalId,
      setCurrentDevotional: mockSetCurrentDevotional,
    }),
}));

jest.mock('@/hooks/useCrossTabBack', () => ({
  useCrossTabBack: () => ({ handleBack: jest.fn() }),
}));

jest.mock('@/hooks/useAdaptiveLayout', () => ({
  useAdaptiveLayout: () => ({ clusterMaxWidth: 560, fontScale: mockFontScale }),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      accent: '#C8A55C',
      background: '#111111',
      inputBackground: '#231F18',
      text: '#F6EFE3',
      textMuted: '#B8AA96',
      textSubtle: '#8D806D',
      textHint: '#6B6152',
      border: '#3A3328',
    },
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'Animated.View' },
  FadeIn: { duration: () => ({ delay: () => ({ easing: () => undefined }), easing: () => undefined }) },
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useReducedMotion: () => true,
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: (value: unknown) => value,
  withDelay: (_d: number, value: unknown) => value,
  withRepeat: (value: unknown) => value,
  interpolate: () => 0,
  Easing: {
    out: () => undefined,
    in: () => undefined,
    inOut: () => undefined,
    cubic: undefined,
    ease: undefined,
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@/components/ui', () => ({
  alpha: (color: string) => color,
}));

jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Svg: 'Svg',
  Circle: 'Circle',
  Defs: 'Defs',
  Ellipse: 'Ellipse',
  LinearGradient: 'LinearGradient',
  Path: 'Path',
  RadialGradient: 'RadialGradient',
  Stop: 'Stop',
}));

jest.mock('phosphor-react-native', () => ({
  CaretLeftIcon: 'CaretLeftIcon',
  CaretRightIcon: 'CaretRightIcon',
  CheckCircleIcon: 'CheckCircleIcon',
  CheckIcon: 'CheckIcon',
  LockSimpleIcon: 'LockSimpleIcon',
  CircleIcon: 'CircleIcon',
  ArrowRightIcon: 'ArrowRightIcon',
}));

jest.mock('@/components/ProfileEntryButton', () => ({
  ProfileEntryButton: 'ProfileEntryButton',
}));

jest.mock('@/components/icons', () => ({
  CaretLeftIcon: 'CaretLeftIcon',
  CaretRightIcon: 'CaretRightIcon',
  CheckCircleIcon: 'CheckCircleIcon',
  CheckIcon: 'CheckIcon',
  LockSimpleIcon: 'LockSimpleIcon',
  CircleIcon: 'CircleIcon',
  ArrowRightIcon: 'ArrowRightIcon',
}));

const { SeriesArcScreen } = require('@/app/(tabs)/(you)/series-detail');

function renderTab() {
  let tree: { root: { findAll: (p: (n: unknown) => boolean) => unknown[]; findAllByProps: (p: object) => unknown[] } };
  act(() => {
    tree = renderer.create(
      React.createElement(SeriesArcScreen, { hostTab: '(study)', chrome: 'tabRoot' }),
    );
  });
  // @ts-expect-error assigned inside act
  return tree;
}

function textContent(node: { props: Record<string, unknown> }): string {
  const children = node.props.children;
  const flat = Array.isArray(children) ? children : [children];
  return flat
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
    .join('');
}

function allRenderedText(tree: ReturnType<typeof renderTab>): string {
  return (
    tree.root.findAll((node) => {
      const n = node as { props?: Record<string, unknown> };
      return Boolean(n.props && 'children' in (n.props ?? {}));
    }) as { props: Record<string, unknown> }[]
  )
    .map(textContent)
    .join('|');
}

beforeEach(() => {
  mockPush.mockClear();
  mockSetCurrentDevotional.mockClear();
  mockParams = {};
  mockCurrentDevotionalId = 'devo-1';
  mockFontScale = 1;
  mockDevotionals = [withActs()];
});

describe('Book of Seasons tab root', () => {
  it('remounts text content for live font changes without remounting the scroll view', () => {
    let tree!: ReactTestRenderer;
    const screen = () => React.createElement(SeriesArcScreen, { hostTab: '(study)', chrome: 'tabRoot' });
    act(() => { tree = renderer.create(screen()); });

    const scroll = tree.root.findByProps({ testID: 'series-detail-scroll' });
    const archive = tree.root.findByProps({ testID: 'book-past-series' });
    const book = tree.root.findByProps({ testID: 'book-of-seasons' });

    mockFontScale = 2;
    act(() => { tree.update(screen()); });

    expect(tree.root.findByProps({ testID: 'series-detail-scroll' })).toBe(scroll);
    expect(tree.root.findByProps({ testID: 'book-past-series' })).not.toBe(archive);
    expect(tree.root.findByProps({ testID: 'book-of-seasons' })).not.toBe(book);
  });

  it('keeps real days accessible when a legacy series has no chapters', () => {
    mockDevotionals = [withActs({ seriesArc: undefined })];
    const tree = renderTab();
    const firstDay = tree.root.findAllByProps({ testID: 'book-day-1' })[0] as {
      props: { onPress: () => void; disabled: boolean };
    };
    expect(firstDay.props.disabled).toBe(false);
    act(() => { firstDay.props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/(study)/reading',
      params: { devotionalId: 'devo-1', dayNumber: '1' },
    });
    expect(mockSetCurrentDevotional).not.toHaveBeenCalled();
    expect(allRenderedText(tree)).not.toContain('In this series');
  });

  it('keeps upcoming real days disabled in the legacy list', () => {
    const devotional = withActs({ seriesArc: undefined });
    mockDevotionals = [{ ...devotional, days: [...devotional.days, day(5)] }];
    const tree = renderTab();
    const futureDay = tree.root.findAllByProps({ testID: 'book-day-5' })[0] as {
      props: { onPress: () => void; disabled: boolean };
    };
    expect(futureDay.props.disabled).toBe(true);
    act(() => { futureDay.props.onPress(); });
    expect(mockPush).not.toHaveBeenCalled();
  });
  it('shows the real series, today page, and act journey', () => {
    const text = allRenderedText(renderTab());
    expect(text).toContain('Ordinary Hours');
    expect(text).toContain('God in ordinary hours');
    expect(text).toContain('Be still');
    expect(text).toContain('Continue reading');
    expect(text).toContain('Wilderness');
    expect(text).toContain('A Quiet Place');
    expect(text).toContain('Still to come');
    expect(text).not.toContain('Season 02');
    expect(text).not.toContain('8 min');
  });

  it('continues the current day without activating a new series', () => {
    const tree = renderTab();
    const button = tree.root.findAllByProps({ testID: 'book-continue-reading' })[0] as {
      props: { onPress: () => void };
    };

    act(() => {
      button.props.onPress();
    });

    expect(mockSetCurrentDevotional).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0]).toMatchObject({
      pathname: '/(tabs)/(study)/reading',
      params: { devotionalId: 'devo-1', dayNumber: '4' },
    });
    expect(mockPush.mock.calls[0][0].params.readOnly).toBeUndefined();
  });

  it('does not open an upcoming chapter', () => {
    const tree = renderTab();
    const upcoming = tree.root.findAllByProps({ testID: 'book-chapter-8' })[0] as {
      props: { disabled: boolean; onPress: () => void };
    };
    expect(upcoming.props.disabled).toBe(true);
    act(() => {
      upcoming.props.onPress();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps past series, profile, and empty-state access on the tab', () => {
    const tree = renderTab();
    expect(tree.root.findAllByProps({ testID: 'study-profile-button' })).toHaveLength(1);
    const text = allRenderedText(tree);
    expect(text).toContain('Past series');
    expect(text.split('|')).not.toContain('Devotional');
    const archive = tree.root.findAllByProps({ testID: 'book-past-series' })[0] as { props: { onPress: () => void } };
    act(() => archive.props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/(study)/past-devotionals', params: { from: 'study' } });

    mockDevotionals = [];
    mockCurrentDevotionalId = null;
    const emptyTree = renderTab();
    const empty = allRenderedText(emptyTree);
    expect(empty).toContain('No series in progress.');
    expect(empty).toContain('Go to Today');
    expect(empty).toContain('Past series');
    const emptyArchive = emptyTree.root.findAllByProps({ testID: 'book-past-series' })[0] as { props: { onPress: () => void } };
    act(() => emptyArchive.props.onPress());
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('offers recovery when today has no canonical content', () => {
    mockDevotionals = [
      withActs({
        currentDay: 4,
        days: [
          day(1, { isRead: true, readAt: start }),
          day(2, { isRead: true, readAt: start }),
          day(3, { isRead: true, readAt: start }),
        ],
      }),
    ];
    const tree = renderTab();
    const text = allRenderedText(tree);
    expect(text).not.toContain('Being prepared');
    expect(text).not.toContain('Be still');
    expect(text).not.toContain('Tomorrow');

    const button = tree.root.findAllByProps({ testID: 'book-continue-reading' })[0] as {
      props: { onPress: () => void };
    };
    act(() => {
      button.props.onPress();
    });
    expect(mockPush.mock.calls[0][0].params.dayNumber).toBe('4');
    expect(mockPush.mock.calls[0][0].params.readOnly).toBeUndefined();
  });

  it('shows a completed series without inventing a next season', () => {
    mockDevotionals = [
      withActs({
        totalDays: 2,
        currentDay: 3,
        seriesArc: {
          totalDaysPlanned: 2,
          overarchingTheme: 'God in ordinary hours',
          narrativeShape: 'shape',
          dayHints: [],
          isOpenEnded: false,
          createdAt: start,
          acts: [{ name: 'Wilderness', fromDay: 1, toDay: 2, function: 'Begin.' }],
        },
        days: [
          day(1, { isRead: true, readAt: start }),
          day(2, { isRead: true, readAt: todayIso, title: 'Last page' }),
        ],
      }),
    ];
    const text = allRenderedText(renderTab());
    expect(text).not.toContain('Series complete');
    expect(text).toContain('Last page');
    expect(text).toContain('Read again');
    expect(text).not.toContain('Season 03');
  });
});


it('uses the planned series total for history progress', () => {
  mockParams = { id: 'devo-1' };
  mockDevotionals = [withActs({ totalDays: 7, seriesArc: { ...withActs().seriesArc!, totalDaysPlanned: 3 }, days: [day(1, { isRead: true }), day(2, { isRead: true })] })];
  let tree!: ReactTestRenderer;
  act(() => { tree = renderer.create(React.createElement(SeriesArcScreen)); });
  expect(allRenderedText(tree)).toContain('2 of 3 completed');
});
