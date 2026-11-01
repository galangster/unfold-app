/**
 * Weekly chapters in series detail (spec r2 rows 22-27, R4, R5, R6).
 */
/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('react-native-gesture-handler', () => ({ GestureDetector: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/book/useBookPageOpening', () => ({
  useBookPageOpening: ({ onContinue }: { onContinue: () => void }) => ({ open: onContinue, gesture: {}, showHint: false, hidden: false, onLayout: jest.fn() }),
}));
jest.mock('@/components/bookshelf/SeriesBookCover', () => ({ SeriesBookCover: 'SeriesBookCover' }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'Animated.View' },
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useReducedMotion: () => true,
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: (value: unknown) => value,
  interpolate: () => 0,
  Easing: { out: () => undefined, in: () => undefined, inOut: () => undefined },
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-svg', () => ({
  __esModule: true, default: 'Svg', Svg: 'Svg', Circle: 'Circle', Defs: 'Defs', Ellipse: 'Ellipse',
  LinearGradient: 'LinearGradient', Path: 'Path', RadialGradient: 'RadialGradient', Stop: 'Stop', G: 'G', Line: 'Line',
}));
jest.mock('@/components/icons', () => ({ CaretRightIcon: 'CaretRightIcon', CheckIcon: 'CheckIcon' }));
jest.mock('@/components/ui', () => ({ alpha: (color: string) => color }));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      accent: '#C8A55C', background: '#111111', inputBackground: '#231F18', text: '#F6EFE3',
      textMuted: '#B8AA96', textSubtle: '#8D806D', textHint: '#6B6152', border: '#3A3328',
    },
  }),
}));

import { BookOfSeasonsView } from '../BookOfSeasonsView';
import { ChapterJourney } from '../ChapterJourney';
import { buildBookChapters, type BookChapter } from '@/lib/book-of-seasons';
import { canonicalGeneratedDayId } from '@/lib/devotional-canonical-days';
import type { ColorTheme } from '@/constants/colors';
import type { PremiumAccessPolicy } from '@/lib/premium-access-policy';
import type { Devotional, DevotionalDay, SeriesArcChapterPlan } from '@/lib/store';
import { makeChapteredArc } from '@/lib/__tests__/fixtures/chaptered-arc';

const colors = {
  accent: '#C8A55C', background: '#111111', inputBackground: '#231F18', text: '#F6EFE3',
  textMuted: '#B8AA96', textSubtle: '#8D806D', textHint: '#6B6152', border: '#3A3328',
} as unknown as ColorTheme;

const NOW = new Date();
const START = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 9, 12).toISOString();

function day(n: number, over: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    id: canonicalGeneratedDayId('devo-weeks', n),
    devotionalId: 'devo-weeks',
    dayNumber: n,
    title: `Synthetic day ${n}`,
    scriptureReference: 'Psalm 1:1',
    scriptureText: 'Synthetic scripture',
    bodyText: 'Synthetic body',
    quotableLine: 'A synthetic line.',
    isRead: false,
    ...over,
  };
}

/** Days 1-9 read, day 10 written and current: week 2, day 3. */
function chaptered(statuses: SeriesArcChapterPlan['status'][], over: Partial<Devotional> = {}): Devotional {
  return {
    id: 'devo-weeks',
    title: 'Synthetic Series',
    totalDays: 28,
    currentDay: 10,
    createdAt: START,
    updatedAt: START,
    generationMode: 'progressive',
    seriesStartDate: START,
    days: [...Array.from({ length: 9 }, (_, i) => day(i + 1, { isRead: true, readAt: START })), day(10)],
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    seriesArc: makeChapteredArc(statuses),
    ...over,
  } as Devotional;
}

function legacy(): Devotional {
  const arc = makeChapteredArc();
  delete arc.planning;
  return chaptered([], { seriesArc: { ...arc, acts: [
    { name: 'Synthetic Movement One', fromDay: 1, toDay: 14, function: 'f' },
    { name: 'Synthetic Movement Two', fromDay: 15, toDay: 28, function: 'f' },
  ] } });
}

function view(
  devotional: Devotional,
  { seriesPaused = false, premiumPolicy = 'granted' as PremiumAccessPolicy, showAllReadings = false, onOpenDay = jest.fn() } = {},
) {
  return render(
    <BookOfSeasonsView devotional={devotional} seriesPaused={seriesPaused} premiumPolicy={premiumPolicy} now={NOW} colors={colors} isDark onOpenDay={onOpenDay} showAllReadings={showAllReadings} />,
  );
}

/** Rendered text and VoiceOver strings only. Props such as testID and the devotional object are not reader-facing. */
function readerFacingStrings(screen: ReturnType<typeof render>): string[] {
  const out: string[] = [];
  for (const node of screen.UNSAFE_root.findAll(() => true)) {
    const props = node.props as Record<string, unknown>;
    for (const key of ['accessibilityLabel', 'accessibilityHint']) {
      if (typeof props[key] === 'string') out.push(props[key] as string);
    }
    if ((node.type as unknown) === 'Text') {
      const children = ([] as unknown[]).concat(props.children);
      out.push(children.filter((child) => typeof child === 'string' || typeof child === 'number').join(''));
    }
  }
  return out;
}

const rowLabels = (screen: ReturnType<typeof render>) =>
  [1, 8, 15, 22].map((fromDay) => screen.getByTestId(`book-chapter-${fromDay}`).props.accessibilityLabel);

describe('series detail heading and rows (rows 22-26)', () => {
  it('heads the list with weeks and days', () => {
    const screen = view(chaptered(['planned', 'planned', 'outline', 'outline']));
    expect(screen.getByText('4 weeks · 28 days')).toBeTruthy();
    expect(screen.queryByText('4 chapters')).toBeNull();
  });

  it('titles each row by its week and shows a name only once planned', () => {
    const screen = view(chaptered(['planned', 'planned', 'outline', 'outline_only']));
    expect(screen.getByText('Week 1 · Synthetic Week One')).toBeTruthy();
    expect(screen.getByText('Week 2 · Synthetic Week Two')).toBeTruthy();
    expect(screen.getByText('Week 3 · Planned when you reach it')).toBeTruthy();
    expect(screen.getByText('Week 4')).toBeTruthy();
    expect(screen.queryByText('Synthetic Week Three')).toBeNull();
    expect(screen.queryByText('Synthetic Week Four')).toBeNull();
  });

  it('gives each row its days and progress, and drops the number slot', () => {
    const screen = view(chaptered(['planned', 'planned', 'outline', 'outline']));
    expect(screen.getByText('Days 1-7 · Complete')).toBeTruthy();
    expect(screen.getByText('Days 8-14 · Your current week')).toBeTruthy();
    expect(screen.queryByText(/of 7 days complete/)).toBeNull();
    expect(screen.getByText('Days 15-21 · Still to come')).toBeTruthy();
    expect(screen.queryByText('02')).toBeNull();
    expect(screen.queryByText('03')).toBeNull();
  });

  it('reads each row to VoiceOver without the separator', () => {
    const screen = view(chaptered(['planned', 'planned', 'outline', 'outline']));
    expect(rowLabels(screen)).toEqual([
      'Week 1, Synthetic Week One, days 1 to 7, complete',
      'Week 2, Synthetic Week Two, days 8 to 14, current week',
      'Week 3, planned when you reach it, days 15 to 21, still to come',
      'Week 4, planned when you reach it, days 22 to 28, still to come',
    ]);
  });

  it('says "Your current week" before the first read of the week', () => {
    const devotional = chaptered(['planned', 'planned', 'outline', 'outline'], {
      currentDay: 8,
      days: [...Array.from({ length: 7 }, (_, i) => day(i + 1, { isRead: true, readAt: START })), day(8)],
    });
    const screen = view(devotional);
    expect(screen.getByText('Days 8-14 · Your current week')).toBeTruthy();
    expect(screen.getByTestId('book-chapter-8').props.accessibilityLabel).toBe('Week 2, Synthetic Week Two, days 8 to 14, current week');
  });

  it('keeps the current page free of an unplanned week name', () => {
    const screen = view(chaptered(['planned', 'outline', 'outline', 'outline']));
    expect(screen.queryByText('Synthetic Week Two')).toBeNull();
    const planned = view(chaptered(['planned', 'planned', 'outline', 'outline']));
    expect(planned.getAllByText('Synthetic Week Two').length).toBeGreaterThan(0);
  });

  it('updates a row when a pull turns its week to planned (APP-3.6)', () => {
    const screen = view(chaptered(['planned', 'outline', 'outline', 'outline']));
    expect(screen.getByText('Week 2 · Planned when you reach it')).toBeTruthy();
    screen.rerender(
      <BookOfSeasonsView devotional={chaptered(['planned', 'planned', 'outline', 'outline'])} seriesPaused={false} premiumPolicy="granted" now={NOW} colors={colors} isDark onOpenDay={jest.fn()} />,
    );
    expect(screen.getByText('Week 2 · Synthetic Week Two')).toBeTruthy();
  });
});

describe('week states (row 27, R4)', () => {
  it('reads a fresh preparing week like an outline week', () => {
    const devotional = chaptered(['planned', 'planned', 'preparing', 'outline']);
    devotional.seriesArc!.planning!.chapters[2].preparingSince = new Date(NOW.getTime() - 60_000).toISOString();
    const screen = view(devotional);
    expect(screen.getByText('Week 3 · Planned when you reach it')).toBeTruthy();
    expect(screen.queryByText(/being written/i)).toBeNull();
  });

  it('shows "Week N" alone for a week that gave up, with no error', () => {
    const screen = view(chaptered(['planned', 'planned', 'outline_only', 'outline']));
    expect(screen.getByText('Week 3')).toBeTruthy();
    expect(screen.queryByText(/try again|error|failed/i)).toBeNull();
  });

  it('promises nothing for a paused series', () => {
    const screen = view(chaptered(['planned', 'planned', 'outline', 'preparing']), { seriesPaused: true });
    expect(screen.getByText('Week 3')).toBeTruthy();
    expect(screen.getByText('Week 4')).toBeTruthy();
    expect(screen.queryByText(/Planned when you reach it/)).toBeNull();
  });

  it.each(['denied', 'unknown'] as const)('promises nothing for a current series while premium is %s', (premiumPolicy) => {
    const devotional = chaptered(['planned', 'planned', 'outline', 'preparing']);
    expect(view(devotional).getByText('Week 3 · Planned when you reach it')).toBeTruthy();
    const screen = view(devotional, { premiumPolicy });
    expect(screen.getByText('Week 3')).toBeTruthy();
    expect(screen.queryByText(/Planned when you reach it/)).toBeNull();
  });
});

describe('R5: a written day opens in every week state', () => {
  it.each(['planned', 'outline', 'preparing', 'outline_only'] as const)('opens the current week when week 2 is %s', (status) => {
    const onOpenDay = jest.fn();
    const screen = view(chaptered(['planned', status, 'outline', 'outline']), { onOpenDay });
    const row = screen.getByTestId('book-chapter-8');
    expect(row.props.accessibilityState).toEqual({ disabled: false });
    fireEvent.press(row);
    expect(onOpenDay).toHaveBeenCalledWith(10);
  });

  it.each(['planned', 'outline', 'preparing', 'outline_only'] as const)('opens written day 8 in the day list when week 2 is %s', (status) => {
    const onOpenDay = jest.fn();
    const screen = view(chaptered(['planned', status, 'outline', 'outline']), { onOpenDay, showAllReadings: true });
    const row = screen.getByTestId('book-day-8');
    expect(row.props.accessibilityState).toEqual({ disabled: false });
    fireEvent.press(row);
    expect(onOpenDay).toHaveBeenCalledWith(8);
  });
});

describe('R3: no reader-facing "chapter"', () => {
  it.each([
    ['planned', 'planned', 'outline', 'outline'],
    ['planned', 'preparing', 'outline_only', 'outline'],
  ] as SeriesArcChapterPlan['status'][][])('renders no "chapter" for %j', (...statuses) => {
    // testIDs such as "book-chapter-8" are not reader-facing; every word "chapter" is.
    for (const screen of [view(chaptered(statuses)), view(chaptered(statuses), { seriesPaused: true })]) {
      const strings = readerFacingStrings(screen);
      expect(strings).toContain('4 weeks · 28 days');
      expect(strings.filter((text) => /chapter/i.test(text))).toEqual([]);
    }
  });
});

describe('R6: a legacy arc renders as today', () => {
  it('keeps the legacy chapter list', () => {
    const devotional = legacy();
    const chapters = buildBookChapters(devotional, NOW);
    const screen = render(
      <ChapterJourney chapters={chapters} colors={colors} premiumPolicy="granted" canOpenChapter={() => true} onOpenChapter={jest.fn()} />,
    );
    expect(screen.toJSON()).toMatchSnapshot();
    expect(screen.getByText('2 parts')).toBeTruthy();
    expect(screen.getByText('Synthetic Movement One')).toBeTruthy();
    expect(screen.getByText('01')).toBeTruthy();
  });

  it('keeps an arc whose planning is invalid on the legacy list', () => {
    const devotional = chaptered(['planned', 'planned', 'outline', 'outline']);
    devotional.seriesArc!.planning!.chapters[1].fromDay = 9;
    const screen = view(devotional);
    expect(screen.getByText('4 parts')).toBeTruthy();
    expect(screen.queryByText('4 weeks · 28 days')).toBeNull();
  });
});

describe('design call 3 (2026-10-29): a legacy series says "part"', () => {
  const journey = (chapters: readonly BookChapter[]) => render(
    <ChapterJourney chapters={chapters} colors={colors} premiumPolicy="granted" canOpenChapter={() => true} onOpenChapter={jest.fn()} />,
  );

  it('counts parts and names the current part', () => {
    const chapters = buildBookChapters(legacy(), NOW);
    const screen = journey(chapters);
    expect(screen.getByText('2 parts')).toBeTruthy();
    expect(screen.getByLabelText('Current part')).toBeTruthy();
    expect(journey(chapters.slice(0, 1)).getByText('1 part')).toBeTruthy();
  });

  it('says "Your current part" before the first read of the part', () => {
    const [first] = buildBookChapters(legacy(), NOW);
    const screen = journey([{ ...first, status: 'current', readCount: 0 }]);
    expect(screen.getByText('Your current part')).toBeTruthy();
    expect(readerFacingStrings(screen).filter((text) => /chapter/i.test(text))).toEqual([]);
  });
});

describe('design call 4 (2026-10-29): no current marker on a paused series', () => {
  const MARKER = /^Current (week|part|chapter)$/;

  it.each([
    ['legacy', legacy, 'Current part'],
    ['chaptered', () => chaptered(['planned', 'planned', 'outline', 'outline']), 'Current week'],
  ] as const)('hides the %s marker and its label while paused', (_kind, make, label) => {
    expect(view(make()).getByLabelText(label)).toBeTruthy();
    expect(view(make(), { seriesPaused: true }).queryByLabelText(MARKER)).toBeNull();
  });

  it('keeps the marker on a current series while premium is not granted', () => {
    const screen = view(chaptered(['planned', 'planned', 'outline', 'outline']), { premiumPolicy: 'denied' });
    expect(screen.getByLabelText('Current week')).toBeTruthy();
  });
});
