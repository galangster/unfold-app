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
    const onEndBlock = readingSource.match(/\.onEnd\(\(event, success\) => \{[\s\S]{0,1100}?\}\),/)?.[0] ?? '';

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

  it('ignores cancelled page pans and disables page swipes during reflection editing', () => {
    const panGestureBlock = readingSource.match(
      /Gesture\.Pan\(\)[\s\S]{0,1500}?\[viewingDay, availableDays, reflectionToolbar/,
    )?.[0] ?? '';

    expect(panGestureBlock).toContain('.enabled(reflectionToolbar === null)');
    expect(panGestureBlock).toContain('.onEnd((event, success) => {');
    expect(panGestureBlock).toContain('if (!success) return;');
    expect(panGestureBlock).toContain('.onFinalize((_event, success) => {');
    expect(panGestureBlock).toMatch(
      /\.onFinalize\(\(_event, success\) => \{[\s\S]{0,180}?if \(!success\)[\s\S]{0,120}?translateX\.value = withTiming\(0/,
    );
  });

  it('uses authoritative day recovery for progressive series and keeps batch continuation separate', () => {
    expect(readingSource).toContain('await dailyGeneration.retry()');
    expect(readingSource).toContain('if (usesDailyRecovery) await dailyGeneration.checkAgain()');
    expect(readingSource).toContain('backgroundColor: retryCtaButtonBg');
    expect(readingSource).toContain('setHasAttemptedSyncCheck(true)');
    expect(readingSource).toContain('!usesDailyRecovery && (hasAttemptedSyncCheck || !!retryError)');
    expect(readingSource).toContain('Prepare Remaining Readings');
  });

  it('pulls persisted day content before enabling progressive job discovery', () => {
    expect(readingSource).toContain('dailySyncRecoveryKey === dailyRecoveryKey');
    expect(readingSource).toMatch(
      /const outcome = await recoverSyncedDay\('manual'\);[\s\S]{0,120}if \(usesDailyRecovery\) await dailyGeneration\.checkAgain\(\)/,
    );
    // A found day or a rate-limited pull skips the job lookup: the lookup
    // spends the same per-user read budget the pull just exhausted.
    expect(readingSource).toContain("if (outcome !== 'missing' && outcome !== 'failed') return;");
    // The generation watch waits out a rate-limit window instead of looking up into it.
    expect(readingSource).toContain('&& !readBudgetBlocked,');
    expect(readingSource).toContain("pullDevotionalContent(currentDevotional.id, { forceFull: true })");
  });

  it('shares one read-budget block across reader recovery entry points', () => {
    expect(readingSource).toContain('const readBudgetBlocked = useReadBudgetBlocked();');
    expect(readingSource).toContain(
      'const isPrimaryActionDisabled = !isPausedSeriesDay && (isCheckBusy || isCheckResting || readBudgetBlocked);',
    );
    expect(readingSource).toMatch(
      /readBudgetBlocked\s*\? 'Try again in a minute'[\s\S]{0,120}isCheckResting\s*\? 'Checked just now'/,
    );
    expect(readingSource).toContain('disabled={isCheckingForSyncedDay || readBudgetBlocked}');
    expect(readingSource).toContain('disabled={readBudgetBlocked}');
  });

  it('shows the paused-series verdict only after pull and job discovery both confirm absence', () => {
    const pausedVerdict = readingSource.match(
      /const isPausedSeriesDay = usesDailyRecovery[\s\S]{0,500}?;/,
    )?.[0] ?? '';

    expect(pausedVerdict).toContain('confirmedMissingDayKey === dailyRecoveryKey');
    expect(pausedVerdict).toContain('discoveredAbsentKey === dailyRecoveryKey');
    expect(pausedVerdict).toContain('!isCheckingForSyncedDay');
    expect(pausedVerdict).toContain("dailyState.status !== 'running'");
    expect(pausedVerdict).toContain("dailyState.status !== 'slow'");
    expect(readingSource).toContain('nextConfirmedAbsentKey(previous, dailyRecoveryKey, dailyGeneration.state)');
  });

  it('retries missing-devotional hydration after the shared window ends without self-cancelling', () => {
    const hydrationEffect = readingSource.match(
      /useEffect\(\(\) => \{\n    const devotionalId = effectiveDevotionalId;[\s\S]{0,2400}?\n  \}, \[[^\]]+\]\);/,
    )?.[0] ?? '';

    expect(hydrationEffect).toContain('if (!devotionalId || currentDevotional || readBudgetBlocked) return;');
    expect(hydrationEffect).toContain('if (!readingMountedRef.current || !isSyncSessionCurrent(session)) return;');
    expect(hydrationEffect).toContain('delete missingDevotionalHydrationAttemptRef.current[devotionalId]');
    expect(hydrationEffect).not.toContain('let cancelled = false');
    expect(hydrationEffect).not.toContain('isHydratingMissingDevotional,');
    expect(hydrationEffect).toMatch(/\[[^\]]*readBudgetBlocked[^\]]*\]/);
  });

  it('re-enables job discovery when revisiting a missing progressive day after its sync pull ran', () => {
    expect(readingSource).toMatch(
      /if \(source === 'auto' && syncRecoveryAttemptRef\.current\[attemptKey\]\) \{[\s\S]{0,160}setDailySyncRecoveryKey\(attemptKey\)/,
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
