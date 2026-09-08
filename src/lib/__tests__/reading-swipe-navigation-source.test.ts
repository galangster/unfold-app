import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readingSource = readFileSync(
  join(__dirname, '../../app/(tabs)/(today)/reading.tsx'),
  'utf8',
);
const seriesDetailSource = readFileSync(
  join(__dirname, '../../app/(tabs)/(you)/series-detail.tsx'),
  'utf8',
);

describe('reading swipe navigation source contract', () => {
  it('opens the devotional scripture tap sheet instead of immediately routing parseable references to Bible', () => {
    const scriptureTapBlock = readingSource.match(
      /onScriptureTap=\{\(ref\) => \{[\s\S]{0,700}?\}\}/,
    )?.[0] ?? '';

    expect(scriptureTapBlock).toContain('setScriptureSheetRef(ref)');
    expect(scriptureTapBlock).not.toContain("pathname: '/(tabs)/(bible)/reader'");
    expect(scriptureTapBlock).not.toContain('referenceToRoute(ref)');
  });

  it('does not cancel the day-change callback by starting the fade-in animation before setViewingDay runs', () => {
    expect(readingSource).not.toMatch(
      /contentOpacity\.value\s*=\s*withTiming\(0,[\s\S]{0,360}runOnJS\(setViewingDay\)\(day\);[\s\S]{0,120}\}\);\s*contentOpacity\.value\s*=\s*withDelay/,
    );
    expect(readingSource).toMatch(
      /runOnJS\(setViewingDay\)\(day\);[\s\S]{0,180}contentOpacity\.value\s*=\s*withTiming\(1,/,
    );
  });

  it('shows a toast instead of only a haptic on a blocked forward swipe past the locked day', () => {
    const onEndBlock = readingSource.match(/\.onEnd\(\(event\) => \{[\s\S]{0,900}?\}\),/)?.[0] ?? '';

    // The toast only fires for a deliberate forward swipe with nothing left
    // to advance to — not for a swipe backward at day 1, and not for a
    // below-threshold nudge.
    expect(onEndBlock).toContain('event.translationX < -80 && viewingDay >= availableDays');
    expect(onEndBlock).toContain('setLockedDayToast');

    expect(readingSource).toContain("Tomorrow's reading unlocks after midnight");

    // Reuses the existing message-toast pattern (styles.toastContainer /
    // styles.toastText), not a bespoke component.
    const lockedToastBlock = readingSource.match(/\{lockedDayToast && \([\s\S]{0,600}?<\/Animated\.View>\s*\)\}/)?.[0] ?? '';
    expect(lockedToastBlock).toContain('styles.toastContainer');
    expect(lockedToastBlock).toContain('styles.toastText');
  });

  it('uses authoritative day recovery for progressive series and keeps batch continuation separate', () => {
    expect(readingSource).toContain('await dailyGeneration.retry()');
    expect(readingSource).toContain('if (!synced) await dailyGeneration.checkAgain()');
    expect(readingSource).toContain('backgroundColor: retryCtaButtonBg');
    expect(readingSource).toContain('setHasAttemptedSyncCheck(true)');
    expect(readingSource).toContain('!usesDailyRecovery && (hasAttemptedSyncCheck || !!retryError)');
    expect(readingSource).toContain('Prepare Remaining Readings');
  });

  it('pulls persisted day content before enabling progressive job discovery', () => {
    expect(readingSource).toContain('dailySyncRecoveryKey === dailyRecoveryKey');
    expect(readingSource).toMatch(
      /const synced = await recoverSyncedDay\('manual'\);[\s\S]{0,120}if \(!synced\) await dailyGeneration\.checkAgain\(\)/,
    );
    expect(readingSource).toContain("pullDevotionalContent(currentDevotional.id, { forceFull: true })");
  });

  it('re-enables job discovery when revisiting a missing progressive day after its sync pull ran', () => {
    expect(readingSource).toMatch(
      /if \(source === 'auto' && syncRecoveryAttemptRef\.current\[attemptKey\]\) \{[\s\S]{0,160}setDailySyncRecoveryKey\(attemptKey\)/,
    );
  });

  it('keeps an inactive library series read-only when its reader route becomes current', () => {
    expect(seriesDetailSource).toContain("readOnly: '1'");
    expect(seriesDetailSource).not.toContain('readOnly: isActiveSeries');
    expect(readingSource).toContain("params.readOnly !== '1'");
  });

  it('does not keep re-applying the original dayNumber route param after a manual swipe changes days', () => {
    const routeSyncBlock = readingSource.match(
      /Respect deep-linked day number[\s\S]{0,900}/,
    )?.[0] ?? '';

    expect(routeSyncBlock).toContain('lastResolvedRouteKeyRef');
    expect(routeSyncBlock).not.toMatch(/\[[^\]]*viewingDay[^\]]*\]/);
  });
});
