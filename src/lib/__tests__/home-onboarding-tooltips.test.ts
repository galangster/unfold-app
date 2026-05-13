/**
 * Source assertions for the Today first-run tooltip sequence.
 * The tour should track the current Today layout instead of the older
 * five-step bottom-tab/streak walkthrough.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('home onboarding tooltips', () => {
  const tooltipSource = fs.readFileSync(
    path.join(__dirname, '../../components/HomeOnboardingTooltips.tsx'),
    'utf-8',
  );
  const todaySource = fs.readFileSync(
    path.join(__dirname, '../../app/(tabs)/(today)/index.tsx'),
    'utf-8',
  );

  it('uses current Today concepts instead of stale per-tab and streak copy', () => {
    expect(tooltipSource).toContain("title: 'Today’s thread'");
    expect(tooltipSource).toContain("title: 'Companion check-in'");
    expect(tooltipSource).toContain("title: 'Daily Rhythm'");
    expect(tooltipSource).toContain("title: 'Read, Ask & Write'");
    expect(tooltipSource).not.toContain("title: 'Your Streak'");
    expect(tooltipSource).not.toContain("targetKey: 'companion'");
    expect(tooltipSource).not.toContain("targetKey: 'journal'");
  });

  it('measures real Today surfaces for the tooltip spotlights', () => {
    expect(tooltipSource).toContain("type TargetKey = 'reading' | 'context' | 'rhythm' | 'tabs'");
    expect(todaySource).toContain('onLayout={handleContextLayout}');
    expect(todaySource).toContain('onLayout={handleRhythmLayout}');
    expect(todaySource).toContain('context: rect');
    expect(todaySource).toContain('rhythm: rect');
  });
});
