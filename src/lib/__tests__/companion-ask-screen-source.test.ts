/**
 * Source-contract tests for a handful of (ask)/index.tsx fixes that are
 * impractical to exercise via a full render (the screen pulls in the whole
 * companion chat + store + drawer dependency graph) — matching this repo's
 * existing convention for screen-embedded logic.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, '../../app/(tabs)/(ask)/index.tsx'), 'utf8');

describe('free quota line shown at full quota too', () => {
  it('no longer gates the quota indicator on some quota being spent', () => {
    expect(source).not.toMatch(/\{!isPremium && dailyRemaining < FREE_COMPANION_DAILY_LIMIT/);
    expect(source).toMatch(/\{!isPremium && \(/);
  });

  it('shows "N free messages today" at full quota, distinct from the "left today" copy', () => {
    expect(source).toContain('${FREE_COMPANION_DAILY_LIMIT} free messages today');
    expect(source).toContain('free messages left today');
  });

  it('uses FontSize tokens for the quota copy instead of a raw 11-12px', () => {
    const quotaBlock = source.slice(
      source.indexOf('Daily limit indicator'),
      source.indexOf('Daily limit indicator') + 2200,
    );
    expect(quotaBlock).not.toMatch(/fontSize:\s*1[12],/);
    expect(quotaBlock).toMatch(/fontSize: FontSize\.(xs|sm)/);
  });
});

describe('todayTheme wired into the companion empty state', () => {
  it('reads the current devotional the same way the Today screen does', () => {
    expect(source).toContain("import { getCurrentDevotional } from '@/lib/home-devotional-state'");
    expect(source).toMatch(/getCurrentDevotional\(devotionals, currentDevotionalId\)/);
  });

  it('passes todayTheme through to CompanionEmptyState', () => {
    expect(source).toMatch(/<CompanionEmptyState onSelectStarter=\{handleSend\} todayTheme=\{todayTheme\} \/>/);
  });
});

describe('drawer edge-swipe gesture wired at the screen root', () => {
  it('imports and calls useDrawerGesture with the screen\'s own drawer state', () => {
    expect(source).toContain('useDrawerGesture');
    expect(source).toMatch(
      /useDrawerGesture\(drawerTranslateX, drawerOpen, handleDrawerOpen, handleDrawerClose\)/,
    );
  });

  it('wraps the screen root in a GestureDetector using that gesture', () => {
    expect(source).toMatch(/<GestureDetector gesture=\{drawerPanGesture\}>\s*<KeyboardAvoidingView/);
    expect(source).toMatch(/<\/KeyboardAvoidingView>\s*<\/GestureDetector>/);
  });
});
