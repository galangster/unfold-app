/**
 * Source contract: Today completion ambience should use the same higher-fidelity
 * ember layer used by the completion celebration/paywall, not the low-res Skia
 * atlas sprite that can look pixelated on-device.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('AmbientArtCanvas Today completion ambience', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../AmbientArtCanvas.tsx'),
    'utf-8',
  );

  it('renders completed Today ambience with GoldEmberField rather than EmberAtlas', () => {
    expect(source).toContain("import { GoldEmberField } from '@/components/home/GoldEmberField';");
    expect(source).not.toContain("import { EmberAtlas } from '@/components/home/EmberAtlas';");
    expect(source).toContain('return <GoldEmberField streakLevel={streakLevel} active />;');
  });
});
