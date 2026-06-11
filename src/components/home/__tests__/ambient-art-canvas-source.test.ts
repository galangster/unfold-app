/**
 * Source contract: Today completion ambience must use the unified EmberSystem
 * (the same higher-fidelity ember layer as the completion celebration), never
 * the deleted low-res Skia atlas sprite or a private ember implementation.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('AmbientArtCanvas Today completion ambience', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../AmbientArtCanvas.tsx'),
    'utf-8',
  );

  it('renders completed Today ambience with the shared EmberSystem', () => {
    expect(source).toContain("import { EmberSystem } from '@/components/EmberSystem';");
    expect(source).not.toContain('GoldEmberField');
    expect(source).not.toContain('EmberAtlas');
    expect(source).toContain('variant="ambient"');
    expect(source).toContain('streakLevel={streakLevel}');
  });

  it('raises the ambient opacity floor so home no longer feels weaker than the celebration', () => {
    expect(source).toContain('opacityFloor={0.5}');
  });

  it('keeps embers out of the hero card stack text via exclusion zones', () => {
    expect(source).toContain('exclusionZones={HOME_CARD_STACK_EXCLUSION}');
  });

  it('stays quiet before completion', () => {
    expect(source).toContain('if (!shouldShowCompletedEmberAmbience({ stateType, hasReadToday })) return null;');
  });
});
