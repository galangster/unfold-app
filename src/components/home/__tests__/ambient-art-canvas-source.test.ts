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
  const riveWrapperSource = fs.readFileSync(
    path.join(__dirname, '../TodayCompletionRive.tsx'),
    'utf-8',
  );
  const riveThemeSource = fs.readFileSync(
    path.join(__dirname, '../../../lib/rive-theme.ts'),
    'utf-8',
  );
  const riveDir = path.join(__dirname, '../../../../assets/rive');
  const bundledTodayRiveFiles = [
    'today-campfire.riv',
    'today-canopy-lights.riv',
    'today-doors.riv',
    'today-light-rays.riv',
    'today-rain-particles.riv',
    'today-tree.riv',
    'today-waterfall.riv',
    'today-wind-leaves.riv',
    'today-wind-particles.riv',
  ];

  it('keeps the native ember system as a completed-day option', () => {
    expect(source).toContain("import { EmberSystem } from '@/components/EmberSystem';");
    expect(source).not.toContain('GoldEmberField');
    expect(source).not.toContain('EmberAtlas');
    expect(source).toContain('variant="ambient"');
    expect(source).toContain('streakLevel={streakLevel}');
  });

  it('renders approved Rive scenes through the Today completion Rive wrapper', () => {
    expect(source).toContain("import { TodayCompletionRive } from '@/components/home/TodayCompletionRive';");
    expect(source).toContain("import todayCampfireSource from '../../../assets/rive/today-campfire.riv';");
    expect(source).toContain("import todayWaterfallSource from '../../../assets/rive/today-waterfall.riv';");
    expect(source).toContain('RIVE_SCENE_SOURCES');
    expect(source).toContain('source={RIVE_SCENE_SOURCES[ambience]}');
    expect(source).toContain('<TodayCompletionRive');
  });

  it('bundles all Today Rive files as real RIVE binaries with an accent control', () => {
    for (const fileName of bundledTodayRiveFiles) {
      const binary = fs.readFileSync(path.join(riveDir, fileName));
      const ascii = binary.toString('latin1');

      expect(binary.subarray(0, 4).toString('utf-8')).toBe('RIVE');
      // Each scene must expose an accent control the app can drive. Two valid
      // contracts coexist: the newer `accentColor` color input (data-bound to a
      // ViewModel color slot — used by the corrected particle scenes) or the
      // legacy per-channel `accentR/G/B`. Corrected files may keep both or drop
      // the old channels entirely (e.g. wind-leaves exposes only accentColor).
      expect(ascii.includes('accentColor') || ascii.includes('accentR')).toBe(true);
    }
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

  it('seeds app activity as active on iOS cold-launch transient states', () => {
    expect(source).toContain('useState<AppStateStatus>(() => getInitialAmbientAppStateStatus(AppState.currentState));');
    expect(source).toContain("AppState.addEventListener('change', setAppState);");
    expect(source).toContain("return appState === 'active';");
  });

  it('falls back to EmberSystem for reduced motion and low power instead of running Rive', () => {
    expect(source).toContain('if (reducedMotion || lowPowerMode === true) return renderEmberFallback(streakLevel, screenFocused);');
    expect(riveWrapperSource).toContain('useAccessibleAnimation');
    expect(riveWrapperSource).toContain('if (!active || reducedMotion)');
  });

  it('passes both accent and background into the Rive theming blend', () => {
    expect(source).toContain('accentColor={colors.accent}');
    expect(source).toContain('backgroundColor={colors.background}');
    expect(riveWrapperSource).toContain('buildRiveThemeValues');
  });

  it('drives artwork/glow with the accent and uses the app surface for background + mask', () => {
    expect(riveWrapperSource).toContain('RIVE_ACCENT_COLOR_PROPERTIES');
    expect(riveWrapperSource).toContain('instance.colorProperty(propertyName)');
    expect(riveWrapperSource).toContain('RIVE_ACCENT_NUMBER_PROPERTIES');
    expect(riveWrapperSource).toContain('instance.numberProperty(propertyName)');
    // Particle systems get the accent via state-machine number inputs too.
    expect(riveWrapperSource).toContain('setNumberInputValue');
    // Artwork + glow carry the accent; background + mask come from the surface.
    expect(riveThemeSource).toContain("'artwork_color'");
    expect(riveThemeSource).toContain("'glow_color'");
    expect(riveThemeSource).toContain("'background_color'");
    expect(riveThemeSource).toContain("'mask_gradient_start'");
    expect(riveThemeSource).toContain('artwork_color: accentOpaque');
    expect(riveThemeSource).toContain('background_color: surfaceOpaque');
  });
});
