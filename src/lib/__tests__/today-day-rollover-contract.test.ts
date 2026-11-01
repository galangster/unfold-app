import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const todaySrc = fs.readFileSync(
  path.join(sourceRoot, 'app/(tabs)/(today)/index.tsx'),
  'utf-8',
);
const readingSrc = fs.readFileSync(
  path.join(sourceRoot, 'app/(tabs)/(today)/reading.tsx'),
  'utf-8',
);

// A screen that stays mounted overnight must re-ask every day-dependent memo
// once the local day turns. Keyed on the day, not the Date, so a foreground on
// the same day does not recompute them (same idea as COR-8 for hasReadToday).
describe('Day-dependent memos follow the local calendar day', () => {
  it('derives a local day key from the calendar clock on Today', () => {
    expect(todaySrc).toContain('const calendarNow = useCalendarNow();');
    expect(todaySrc).toContain('const calendarDayKey = localDayKey(calendarNow);');
  });

  it('re-asks whether the current day is due when the local day turns', () => {
    expect(todaySrc).toContain(
      'shouldAutoPrepareCurrentDevotionalDay(currentDevotional, premiumPolicy, calendarNow)',
    );
    expect(todaySrc).toContain('), [currentDevotional, premiumPolicy, calendarDayKey]);');
  });

  it("keys Today's day copy and carry line on the local day", () => {
    expect(todaySrc).toContain('() => getTodayDayContext(currentDevotional, calendarNow),');
    expect(todaySrc).toContain('[currentDevotional, calendarDayKey],');
    expect(todaySrc).toContain('() => getTodayCarryLine(devotionals, currentDevotionalId, calendarNow),');
    expect(todaySrc).toContain('[devotionals, currentDevotionalId, calendarDayKey],');
  });

  it("keys the reader's missing-day watch on the local day", () => {
    expect(readingSrc).toContain('const calendarDayKey = localDayKey(calendarNow);');
    expect(readingSrc).toContain(
      '() => shouldWatchForGeneratedDay(currentDevotional, viewingDay, calendarNow),',
    );
    expect(readingSrc).toContain('[currentDevotional, viewingDay, calendarDayKey],');
  });

  it('runs the Today focus refresh on foreground as well as on focus', () => {
    expect(todaySrc).toContain('useFocusEffect(refreshCurrentDevotional);');
    expect(todaySrc).toContain('cancelForegroundRefresh = refreshCurrentDevotional();');
  });
});
