import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readingSource = readFileSync(
  join(__dirname, '../../app/(tabs)/(today)/reading.tsx'),
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

  it('makes "Check for Day X" the primary CTA and gates "Prepare Remaining Readings" behind an attempted check', () => {
    const checkButtonBlock = readingSource.match(
      /onPress=\{\(\) => void recoverSyncedDay\('manual'\)\}[\s\S]{0,1500}?<\/TouchableOpacity>/,
    )?.[0] ?? '';
    expect(checkButtonBlock).toContain('backgroundColor: retryCtaButtonBg');

    expect(readingSource).toContain('setHasAttemptedSyncCheck(true)');

    const prepareGate = readingSource.match(
      /\{\(hasAttemptedSyncCheck \|\| !!retryError\) && \([\s\S]{0,1400}?<\/TouchableOpacity>\s*\)\}/,
    )?.[0] ?? '';
    expect(prepareGate).toContain('Prepare Remaining Readings');
    // Demoted to a text-style button — no filled background or border.
    expect(prepareGate).not.toContain('backgroundColor: retryCtaButtonBg');
    expect(prepareGate).not.toContain('borderColor');
  });

  it('does not keep re-applying the original dayNumber route param after a manual swipe changes days', () => {
    const routeSyncBlock = readingSource.match(
      /Respect deep-linked day number[\s\S]{0,900}/,
    )?.[0] ?? '';

    expect(routeSyncBlock).toContain('lastResolvedRouteKeyRef');
    expect(routeSyncBlock).not.toMatch(/\[[^\]]*viewingDay[^\]]*\]/);
  });
});
