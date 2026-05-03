/**
 * Source assertion: dev seed routes should replace their own seeded QA data.
 * Otherwise older persisted noncanonical seed rows can survive and make
 * runtime QA falsely land on the reader fallback.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('debug seed routes', () => {
  const seedRevealSource = fs.readFileSync(
    path.join(__dirname, '../../app/debug-seed-reveal.tsx'),
    'utf-8',
  );
  const seedNotificationSource = fs.readFileSync(
    path.join(__dirname, '../../app/debug-seed-notification-tap.tsx'),
    'utf-8',
  );
  const seedTodaySource = fs.readFileSync(
    path.join(__dirname, '../../app/debug-seed-today.tsx'),
    'utf-8',
  );
  const debugPremiumSource = fs.readFileSync(
    path.join(__dirname, '../../app/debug-premium.tsx'),
    'utf-8',
  );
  const revenueCatSyncSource = fs.readFileSync(
    path.join(__dirname, '../../hooks/useRevenueCatSync.ts'),
    'utf-8',
  );
  const pastDevotionalsSource = fs.readFileSync(
    path.join(__dirname, '../../app/(tabs)/(you)/past-devotionals.tsx'),
    'utf-8',
  );

  it('replaces any previous seeded reveal devotional before adding a fresh one', () => {
    expect(seedRevealSource).toContain('store.removeDevotional(seeded.id);');
    expect(seedRevealSource).toContain('store.addDevotional(seeded);');
  });

  it('replaces any previous seeded notification devotional before adding a fresh one', () => {
    expect(seedNotificationSource).toContain('store.removeDevotional(seeded.id);');
    expect(seedNotificationSource).toContain('store.addDevotional(seeded);');
  });

  it('keeps the Today seed route QA-gated and refreshes the active Today devotional', () => {
    expect(seedTodaySource).toContain('isQaToolsEnabled()');
    expect(seedTodaySource).toContain('<Redirect href="/(tabs)/(you)" />');
    expect(seedTodaySource).toContain("| 'overdue'");
    expect(seedTodaySource).toContain("| 'complete-today'");
    expect(seedTodaySource).toContain("| 'tomorrow-locked'");
    expect(seedTodaySource).toContain("| 'resume-reading'");
    expect(seedTodaySource).toContain("| 'resume-journal'");
    expect(seedTodaySource).toContain("| 'midday'");
    expect(seedTodaySource).toContain("| 'evening'");
    expect(seedTodaySource).toContain("| 'bridge'");
    expect(seedTodaySource).toContain("| 'bridge-loading'");
    expect(seedTodaySource).toContain("| 'remember-this'");
    expect(seedTodaySource).toContain("| 'premium-nudge'");
    expect(seedTodaySource).toContain("'journey-complete'");
    expect(seedTodaySource).toContain("'empty'");
    expect(seedTodaySource).toContain("'day1-review'");
    expect(seedTodaySource).toContain("if (state === 'overdue')");
    expect(seedTodaySource).toContain("if (state === 'complete-today')");
    expect(seedTodaySource).toContain("if (state === 'tomorrow-locked')");
    expect(seedTodaySource).toContain("if (state === 'journey-complete' || state === 'premium-nudge')");
    expect(seedTodaySource).toContain("if (state === 'empty')");
    expect(seedTodaySource).toContain("if (state === 'day1-review')");
    expect(seedTodaySource).toContain("if (state === 'resume-reading')");
    expect(seedTodaySource).toContain("if (state === 'resume-journal')");
    expect(seedTodaySource).toContain("state === 'midday' || state === 'bridge' || state === 'bridge-loading'");
    expect(seedTodaySource).toContain("if (state === 'evening')");
    expect(seedTodaySource).toContain('store.setResumeContext({');
    expect(seedTodaySource).toContain('route: \'reading\'');
    expect(seedTodaySource).toContain('route: \'journal\'');
    expect(seedTodaySource).toContain('QA_TODAY_CONTEXT_SLOT_PREFIX');
    expect(seedTodaySource).toContain('type AccentThemeId');
    expect(seedTodaySource).toContain('type ThemeMode');
    expect(seedTodaySource).toContain("todayPreviewThemeModes = ['dark', 'light', 'system'] as const");
    expect(seedTodaySource).toContain("todayPreviewAccentThemes = ['gold', 'ocean', 'rose', 'forest', 'lavender', 'ember', 'slate'] as const");
    expect(seedTodaySource).toContain('getTodayPreviewThemeMode(theme ?? themeMode)');
    expect(seedTodaySource).toContain('getTodayPreviewAccentTheme(accent ?? accentTheme)');
    expect(seedTodaySource).toContain('buildQaTodayUser(previewState, previewThemeMode, previewAccentTheme)');
    expect(seedTodaySource).toContain('ui.setQaPremiumOverride(isPremiumContextPreviewState(previewState));');
    expect(seedTodaySource).toContain('ui.setRevenueCatResolved();');
    expect(seedTodaySource).not.toContain('isPremium: isPremiumContextPreviewState(state)');
    expect(seedTodaySource).toContain('store.clearResumeContext();');
    expect(seedTodaySource).toContain("if (state === 'preparing')");
    expect(seedTodaySource).toContain('currentDay: seeded.totalDays');
    expect(seedTodaySource).toContain('seriesStartDate: yesterdayIso');
    expect(seedTodaySource).toContain('store.removeDevotional(returningMarker.id);');
    expect(seedTodaySource).toContain('store.addDevotional(seeded);');
    expect(seedTodaySource).toContain('store.setCurrentDevotional(seeded.id);');
    expect(seedTodaySource).toContain('store.addDevotional(returningMarker);');
    expect(seedTodaySource).toContain('store.removeDevotional(returningMarker.id);');
    expect(seedTodaySource).toContain('useUnfoldStore.setState({ hasSeenDay1Review: false });');
    expect(seedTodaySource).toContain("if (seeded && previewState === 'premium-nudge')");
    expect(seedTodaySource).toContain("if (seeded && previewState === 'remember-this')");
    expect(seedTodaySource).toContain('buildRememberThisHighlight(seeded, createdAt)');
    expect(seedTodaySource).toContain('highlights: []');
    expect(seedTodaySource).toContain('justCompletedSeriesTitle: seeded.title');
    expect(seedTodaySource).toContain('nudgeShownThisSession: false');
    expect(seedTodaySource).toContain('streakLastReadDate: new Date().toISOString()');
    expect(seedTodaySource).toContain("if (previewState === 'day1-review')");
    expect(seedTodaySource).toContain('store.setHasSeenFeatureOnboarding(true);');
    expect(seedTodaySource).toContain('store.setHasSeenDay1Review();');
    expect(seedTodaySource).toContain("router.replace('/(tabs)/(today)');");
  });

  it('keeps the QA premium override route gated, reversible, and non-persistent', () => {
    expect(debugPremiumSource).toContain('isQaToolsEnabled()');
    expect(debugPremiumSource).toContain('<Redirect href="/(tabs)/(you)" />');
    expect(debugPremiumSource).toContain('setQaPremiumOverride(shouldGrant);');
    expect(debugPremiumSource).toContain('setDebugForceTrialExpired(false);');
    expect(debugPremiumSource).toContain('setRevenueCatResolved();');
    expect(debugPremiumSource).not.toContain('updateUser({ isPremium');
    expect(debugPremiumSource).toContain("router.replace('/(tabs)/(you)');");
  });

  it('keeps RevenueCat sync as the persisted premium mirror source of truth', () => {
    expect(revenueCatSyncSource).toContain('updateUser({ isPremium: hasSubscription });');
    expect(revenueCatSyncSource).not.toContain('hasQaPremiumOverride');
    expect(revenueCatSyncSource).not.toContain('hasSubscription ||');
  });

  it('routes premium UI actions through the access policy instead of persisted user mirror', () => {
    expect(pastDevotionalsSource).toContain("import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';");
    expect(pastDevotionalsSource).toContain('const premiumPolicy = usePremiumAccessPolicy();');
    expect(pastDevotionalsSource).toContain("if (premiumPolicy !== 'granted')");
    expect(pastDevotionalsSource).not.toContain('user?.isPremium');
  });
});
