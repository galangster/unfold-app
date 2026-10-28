/**
 * R1: week framing has four homes (Today, series detail, the week-complete
 * moment, the completion announcement). Every other surface keeps
 * "Day N of 28" for a chaptered series. Each row below names its file, the
 * template it keeps, and that it never frames a day by its week.
 */
import * as fs from 'fs';
import * as path from 'path';
import { bookDayCaption } from '../book-opening';
import { buildBookOfSeasonsModel } from '../book-of-seasons';
import type { Devotional, DevotionalDay } from '../store';
import { makeChapteredArc } from './fixtures/chaptered-arc';
import { NEXT_DAY_TITLES, OVERDUE_BODIES } from '../../constants/reading-reminder-messages';
import { formatSelectionShareText } from '../selection-share';
import { WIDGET_DAY_READY_LINES } from '../widget-timeline';

const src = (relative: string) => fs.readFileSync(path.join(__dirname, '../..', relative), 'utf8');

const SERIES = 'Synthetic Series';

describe('R1 pure day templates keep the day number only', () => {
  it('row 37: local reminders read "Day N of series"', () => {
    expect(NEXT_DAY_TITLES[0](10, SERIES)).toBe('Day 10 of Synthetic Series');
    expect(OVERDUE_BODIES[0](10, SERIES)).toBe('Day 10 of Synthetic Series is waiting for you.');
  });

  it('row 33: the widget ready line reads "Time for Day N"', () => {
    expect(WIDGET_DAY_READY_LINES[0](10)).toBe('Time for Day 10');
  });

  it('row 34: selection share names the day, not the week', () => {
    const text = formatSelectionShareText({ text: 'A synthetic line', seriesTitle: SERIES, dayNumber: 10, dayTitle: 'Synthetic day' });
    expect(text).toContain('Excerpt from Synthetic Series, Day 10: Synthetic day');
    expect(text).not.toMatch(/week/i);
  });
});

/** Render-heavy surfaces: the guard is that they never read the week helper. */
const R1_COMPONENT_SURFACES: [row: string, file: string][] = [
  ['17 reveal', 'app/reveal.tsx'],
  ['28 day picker', 'components/book/BookDayList.tsx'],
  ['29 day menu', 'app/(tabs)/(today)/day-menu.tsx'],
  ['30 library paused label', 'app/(tabs)/(you)/past-devotionals.tsx'],
  ['31 carousel', 'components/home/SeriesCarousel.tsx'],
  ['31 your series', 'components/home/YourSeriesSection.tsx'],
  ['32 journal header', 'app/(tabs)/(journal)/index.tsx'],
  ['33 dashboard widget', 'widgets/ios/UnfoldDashboard.tsx'],
  ['33 streak widget', 'widgets/ios/UnfoldStreak.tsx'],
  ['33 verse widget', 'widgets/ios/UnfoldVerse.tsx'],
  ['33 reading session widget', 'widgets/ios/UnfoldReadingSession.tsx'],
  ['33 widget timeline', 'lib/widget-timeline.ts'],
  ['34 selection share', 'lib/selection-share.ts'],
  ['37 local reminders', 'constants/reading-reminder-messages.ts'],
];

describe.each(R1_COMPONENT_SURFACES)('R1 row %s (%s)', (_row, file) => {
  it('never frames a day by its week', () => {
    expect(src(file)).not.toMatch(/series-weeks|dayFraming|weekLabel/);
  });
});

describe('R1 series detail current page', () => {
  it('keeps "Day 10 of 28" on the book page of a chaptered series', () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 9, 12).toISOString();
    const day = (n: number, isRead: boolean): DevotionalDay => ({
      dayNumber: n, title: `Synthetic day ${n}`, scriptureReference: 'Psalm 1:1', scriptureText: 's',
      bodyText: 'b', quotableLine: 'q', isRead, ...(isRead ? { readAt: start } : {}),
    });
    const devotional = {
      id: 'devo-r1', title: 'Synthetic Series', totalDays: 28, currentDay: 10, createdAt: start,
      seriesStartDate: start, generationMode: 'progressive',
      days: [...Array.from({ length: 9 }, (_, i) => day(i + 1, true)), day(10, false)],
      userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
      seriesArc: makeChapteredArc(['planned', 'planned', 'outline', 'outline']),
    } as Devotional;
    const page = buildBookOfSeasonsModel(devotional, now, false)!.page;
    expect(bookDayCaption(page)).toBe('Day 10 of 28');
  });
});
