import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readingSource = readFileSync(
  join(__dirname, '../../app/(tabs)/(today)/reading.tsx'),
  'utf8',
);

describe('reading swipe navigation source contract', () => {
  it('does not cancel the day-change callback by starting the fade-in animation before setViewingDay runs', () => {
    expect(readingSource).not.toMatch(
      /contentOpacity\.value\s*=\s*withTiming\(0,[\s\S]{0,360}runOnJS\(setViewingDay\)\(day\);[\s\S]{0,120}\}\);\s*contentOpacity\.value\s*=\s*withDelay/,
    );
    expect(readingSource).toMatch(
      /runOnJS\(setViewingDay\)\(day\);[\s\S]{0,180}contentOpacity\.value\s*=\s*withTiming\(1,/,
    );
  });

  it('does not keep re-applying the original dayNumber route param after a manual swipe changes days', () => {
    const routeSyncBlock = readingSource.match(
      /Respect deep-linked day number[\s\S]{0,900}/,
    )?.[0] ?? '';

    expect(routeSyncBlock).toContain('lastResolvedRouteKeyRef');
    expect(routeSyncBlock).not.toMatch(/\[[^\]]*viewingDay[^\]]*\]/);
  });
});
