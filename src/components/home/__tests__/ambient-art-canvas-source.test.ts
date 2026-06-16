/**
 * Source contract: Today completion ambience owns one randomized ambient slot:
 * the shared EmberSystem look remains one option, and approved Rive assets may
 * render as sibling decorative backgrounds. Never restore the deleted low-res
 * Skia atlas sprite or a private ember implementation.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('AmbientArtCanvas Today completion ambience', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../AmbientArtCanvas.tsx'),
    'utf-8',
  );
  const windLeavesRivePath = path.join(__dirname, '../../../../assets/rive/today-wind-leaves.riv');

  it('keeps the native ember system as a completed-day option', () => {
    expect(source).toContain("import { EmberSystem } from '@/components/EmberSystem';");
    expect(source).not.toContain('GoldEmberField');
    expect(source).not.toContain('EmberAtlas');
    expect(source).toContain('variant="ambient"');
    expect(source).toContain('streakLevel={streakLevel}');
  });

  it('renders approved Rive assets through the Today completion Rive wrapper', () => {
    expect(source).toContain("import { TodayCompletionRive } from '@/components/home/TodayCompletionRive';");
    expect(source).toContain("import todayWindLeavesSource from '../../../assets/rive/today-wind-leaves.riv';");
    expect(source).toContain('<TodayCompletionRive');
  });

  it('bundles the animator-supplied Rive file as a real RIVE binary', () => {
    const header = fs.readFileSync(windLeavesRivePath).subarray(0, 4).toString('utf-8');
    expect(header).toBe('RIVE');
  });

  it('uses a stable completion ambience key instead of randomizing on every render', () => {
    expect(source).toContain('completionAmbienceKey: string | null;');
    expect(source).toContain('selectTodayCompletionAmbience');
    expect(source).toContain('selectionKey: completionAmbienceKey');
  });

  it('raises the ember opacity floor so home no longer feels weaker than the celebration', () => {
    expect(source).toContain('opacityFloor={0.5}');
  });

  it('keeps embers out of the hero card stack text via exclusion zones', () => {
    expect(source).toContain('exclusionZones={HOME_CARD_STACK_EXCLUSION}');
  });

  it('stays quiet before completion', () => {
    expect(source).toContain('const shouldShowCompletedAmbience = shouldShowCompletedEmberAmbience({ stateType, hasReadToday });');
    expect(source).toContain('if (!shouldShowCompletedAmbience || !ambience) return null;');
  });

  it('falls back to EmberSystem for reduced motion and low power instead of running Rive', () => {
    expect(source).toContain('if (reducedMotion || lowPowerMode === true) return renderEmberFallback(streakLevel, screenFocused);');
  });
});
