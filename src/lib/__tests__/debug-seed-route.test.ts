/**
 * Source assertion: regression coverage for QA-marker isolation and
 * premium-state routing that used to be colocated with dev seed route
 * assertions. The dev seed routes themselves (debug-seed-*.tsx,
 * debug-premium.tsx, debug-reset-beginning.tsx) were deleted as dead code —
 * see "3b. Dead code deletion" in the maximize-token-efficiency plan — so
 * their route-source assertions were removed along with them.
 */
import * as fs from 'fs';
import * as path from 'path';

import { getQaTodayProfileMarker } from '../qa-today-marker';

describe('debug seed routes', () => {
  const revenueCatSyncSource = fs.readFileSync(
    path.join(__dirname, '../../hooks/useRevenueCatSync.ts'),
    'utf-8',
  );
  const pastDevotionalsSource = fs.readFileSync(
    path.join(__dirname, '../../app/(tabs)/(you)/past-devotionals.tsx'),
    'utf-8',
  );
  const youTabSource = fs.readFileSync(
    path.join(__dirname, '../../app/(tabs)/(you)/index.tsx'),
    'utf-8',
  );
  const todayTabSource = fs.readFileSync(
    path.join(__dirname, '../../app/(tabs)/(today)/index.tsx'),
    'utf-8',
  );
  const recommendedSeriesCardSource = fs.readFileSync(
    path.join(__dirname, '../../components/home/RecommendedSeriesCard.tsx'),
    'utf-8',
  );
  const qaTodayMarkerSource = fs.readFileSync(
    path.join(__dirname, '../qa-today-marker.ts'),
    'utf-8',
  );

  it('keeps the Today QA profile marker value stable for QA comparisons', () => {
    expect(getQaTodayProfileMarker()).toBe('Seeded Today-screen runtime QA profile.');
  });

  it('keeps the exact Today QA profile marker literal out of production-bundled sources', () => {
    const bannedMarkers = [
      'Seeded Today-screen runtime QA profile.',
      'Seeded Today-screen runtime QA profile',
    ];

    for (const source of [todayTabSource, recommendedSeriesCardSource, qaTodayMarkerSource]) {
      for (const bannedMarker of bannedMarkers) {
        expect(source).not.toContain(bannedMarker);
      }
    }
  });

  it('does not route the QA tools section to deleted debug routes', () => {
    expect(youTabSource).not.toContain("router.push('/debug-reset-beginning')");
    expect(youTabSource).not.toContain("router.push('/debug-light-mode')");
    expect(youTabSource).not.toContain("onPress={() => router.push('/onboarding')}");
  });

  it('routes Today new-series CTAs to discovery selection instead of first-run onboarding', () => {
    expect(todayTabSource).toContain('openNewSeriesDiscovery');
    expect(todayTabSource).toContain("pathname: '/onboarding'");
    expect(todayTabSource).toContain("startAt: 'themeType'");
    expect(todayTabSource).toContain("flow: 'newSeries'");
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
