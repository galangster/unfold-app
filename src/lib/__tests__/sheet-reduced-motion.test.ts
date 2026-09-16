import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, '../../components/ui/Sheet.tsx'), 'utf8');

describe('Sheet honors reduced motion', () => {
  it('reads the live reduce-motion preference', () => {
    expect(source).toContain("import { useAccessibleAnimation } from '@/hooks/useAccessibility'");
    expect(source).toContain('const { reducedMotion } = useAccessibleAnimation()');
    expect(source).toContain('reduceMotionSV.value = reducedMotion');
  });

  it('snaps the panel and scrim instead of timing when reduced motion is on', () => {
    expect(source).toContain('if (reducedMotion)');
    expect(source).toContain('translateY.value = 0');
    expect(source).toContain('backdropOpacity.value = 0.4');
    expect(source).toContain('translateY.value = OFFSCREEN');
    expect(source).toContain('backdropOpacity.value = 0');
    expect(source).toContain('withTiming(0, SLIDE_IN)');
  });
});
