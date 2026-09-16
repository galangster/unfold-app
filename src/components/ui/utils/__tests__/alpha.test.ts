import { DarkColors, LightColors } from '@/constants/colors';
import { alpha } from '../alpha';

describe('alpha', () => {
  it('composes 6-digit hex into rgba', () => {
    expect(alpha('#C8A55C', 0.08)).toBe('rgba(200, 165, 92, 0.08)');
    expect(alpha(LightColors.background, 0.95)).toBe('rgba(250, 247, 242, 0.95)');
  });

  it('keeps rgb from rgba tokens and applies the given opacity', () => {
    expect(alpha(LightColors.error, 0.1)).toBe('rgba(204, 25, 38, 0.1)');
    expect(alpha(DarkColors.error, 0.1)).toBe('rgba(248, 113, 113, 0.1)');
    expect(alpha('rgb(245, 240, 235)', 0.6)).toBe('rgba(245, 240, 235, 0.6)');
    expect(alpha('  rgba(28, 23, 16, 0.68)  ', 0.4)).toBe('rgba(28, 23, 16, 0.4)');
  });

  it('falls back to black for colors it cannot parse', () => {
    expect(alpha('', 0.2)).toBe('rgba(0, 0, 0, 0.2)');
    expect(alpha('#fff', 0.2)).toBe('rgba(0, 0, 0, 0.2)');
    expect(alpha('hsl(0, 84%, 60%)', 0.2)).toBe('rgba(0, 0, 0, 0.2)');
  });
});
