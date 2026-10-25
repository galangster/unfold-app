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

const src = (relative: string) => fs.readFileSync(path.join(__dirname, '../..', relative), 'utf8');

const R1_SURFACES: [row: string, file: string, keeps: string][] = [
  ['17 reveal', 'app/reveal.tsx', '`Day ${dayNum} of ${total}`'],
  ['18 reading header', 'app/(tabs)/(today)/reading.tsx', 'Day {viewingDay} of {totalDays}'],
  ['18 reading header label', 'app/(tabs)/(today)/reading.tsx', 'accessibilityLabel={`Day ${viewingDay} of ${totalDays}`}'],
  ['28 day picker', 'components/book/BookDayList.tsx', '`Day ${dayNumber}`'],
  ['29 day menu', 'app/(tabs)/(today)/day-menu.tsx', 'Day {dayNumber}'],
  ['30 library paused label', 'app/(tabs)/(you)/past-devotionals.tsx', '`${progress.read} of ${progress.total} readings`'],
  ['31 carousel', 'components/home/SeriesCarousel.tsx', 'Day {devotional.currentDay} of {devotional.totalDays}'],
  ['31 your series', 'components/home/YourSeriesSection.tsx', 'Day {devotional.currentDay} of {devotional.totalDays}'],
  ['32 journal header', 'app/(tabs)/(journal)/index.tsx', '`Day ${currentDayData?.dayNumber ?? currentDevotional.currentDay} of ${Math.max(currentDevotional.totalDays, currentDevotional.days.length)}`'],
  ['33 dashboard widget', 'widgets/ios/UnfoldDashboard.tsx', 'Day {day} of {total}'],
  ['33 streak widget', 'widgets/ios/UnfoldStreak.tsx', 'Day {day} of {total}'],
  ['33 verse widget', 'widgets/ios/UnfoldVerse.tsx', 'of {total}'],
  ['33 reading session widget', 'widgets/ios/UnfoldReadingSession.tsx', 'Day {day} of {total}'],
  ['33 widget timeline', 'lib/widget-timeline.ts', '`Time for Day ${day}`'],
  ['34 selection share', 'lib/selection-share.ts', '`Day ${dayNumber}`'],
  ['37 local reminders', 'constants/reading-reminder-messages.ts', '`Day ${day} of ${series}`'],
];

describe.each(R1_SURFACES)('R1 row %s (%s)', (_row, file, keeps) => {
  it('keeps its day template and never frames a day by its week', () => {
    const text = src(file);
    expect(text).toContain(keeps);
    // The reader imports the week helper only for the week moment and its announcement.
    expect(text).not.toMatch(/weekDayLabel|weekDaySpokenLabel|weekCaption|weekOfSeriesSpokenLabel/);
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
