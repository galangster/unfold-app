/**
 * The screens that ask for the app-written prompts hand them the reader's
 * local day. These sources live under src/app, where Expo Router treats every
 * file as a route, so their wiring is pinned here by its text (as in
 * today-day-rollover-contract.test.ts). The request tests prove what the
 * services do with the date. These prove the screens pass the right one.
 */

import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const todaySrc = fs.readFileSync(path.join(sourceRoot, 'app/(tabs)/(today)/index.tsx'), 'utf-8');
const eveningSrc = fs.readFileSync(path.join(sourceRoot, 'app/(tabs)/(today)/evening-wind-down.tsx'), 'utf-8');

describe('the bridge on Today', () => {
  it("keys its query on the local day and asks for that day's bridge", () => {
    expect(todaySrc).toContain("queryKey: ['bridge', bridgeInput?.devotionalId, bridgeInput?.dayNumber, calendarDayKey],");
    expect(todaySrc).toContain(
      'queryFn: () => generateBridge(bridgeInput!.input, bridgeInput!.devotionalId, bridgeInput!.dayNumber, calendarNow),',
    );
    expect(todaySrc).toContain('const calendarDayKey = localDayKey(calendarNow);');
  });
});

describe('the evening wind-down', () => {
  it('holds the date it opened on and keys and asks for the examen with it', () => {
    expect(eveningSrc).toContain('const [openedAt] = useState(() => new Date());');
    expect(eveningSrc).toContain('      localDayKey(openedAt),\n');
    expect(eveningSrc).toMatch(/generateExamen\([\s\S]*?dayNumber: currentDay!\.dayNumber,\s*\},\s*openedAt\s*\)/);
  });

  it('reads the day, its readiness, and the midday check-in at the date it opened on', () => {
    expect(eveningSrc).toContain('resolveEveningWindDownDayNumber(currentDevotional, requestedDayNumber, openedAt)');
    expect(eveningSrc).toContain('resolveEveningWindDownReadiness(currentDevotional, eveningDayNumber, openedAt)');
    expect(eveningSrc).toContain('findTodayMiddayCheckIn(checkIns, currentDevotional.id, currentDay.dayNumber, openedAt)');
  });
});
