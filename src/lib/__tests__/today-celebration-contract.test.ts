import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const src = fs.readFileSync(
  path.join(sourceRoot, 'app/(tabs)/(today)/index.tsx'),
  'utf-8',
);

describe('Today streak celebration contract (COR-7/COR-8)', () => {
  it('triggers the celebration through the shared day-flip gate, not hasReadToday flips', () => {
    expect(src).toContain('shouldCelebrateStreakDayFlip({');
    expect(src).toContain('getStreakDayKey(streakLastReadDate)');
    expect(src).not.toContain('prevHasReadToday');
  });

  it('keeps the hasReadToday memo fresh across midnight (clockNow in deps and as now)', () => {
    expect(src).toContain('hasReadDevotionalToday({ devotionals, currentDevotionalId, now: clockNow })');
    expect(src).toContain('), [currentDevotionalId, devotionals, clockNow]);');
  });
});
