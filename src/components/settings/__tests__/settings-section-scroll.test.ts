import { Spacing } from '@/constants/spacing';
import { settingsSectionScrollOffset } from '../settings-section-scroll';

describe('settingsSectionScrollOffset', () => {
  it('keeps a single-column target at the section y minus the header inset', () => {
    expect(settingsSectionScrollOffset(120)).toBe(120 - Spacing['4']);
    expect(settingsSectionScrollOffset(120, 0)).toBe(120 - Spacing['4']);
  });

  it('adds the measured second-column wrapper offset used on Profile', () => {
    expect(settingsSectionScrollOffset(120, 240)).toBe(120 + 240 - Spacing['4']);
  });

  it('updates when the wrapper offset changes across a single/split transition', () => {
    const sectionY = 88;
    const stacked = settingsSectionScrollOffset(sectionY, 312);
    const split = settingsSectionScrollOffset(sectionY, 0);
    expect(stacked).toBe(400 - Spacing['4']);
    expect(split).toBe(88 - Spacing['4']);
    expect(split).toBeLessThan(stacked);
  });

  it('does not scroll above the top of the content', () => {
    expect(settingsSectionScrollOffset(4, 0)).toBe(0);
    expect(settingsSectionScrollOffset(0, 0)).toBe(0);
  });
});
