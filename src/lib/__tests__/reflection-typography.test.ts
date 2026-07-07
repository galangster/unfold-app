import { getReflectionTypography, reflectionBodyPx } from '@/lib/reflection-typography';

describe('getReflectionTypography', () => {
  it('keeps reflection questions dynamic across reading font-size preferences', () => {
    expect(getReflectionTypography('small')).toMatchObject({
      questionFontSize: 15,
      questionLineHeight: 25,
    });
    expect(getReflectionTypography('medium')).toMatchObject({
      questionFontSize: 17,
      questionLineHeight: 28,
    });
    expect(getReflectionTypography('large')).toMatchObject({
      questionFontSize: 20,
      questionLineHeight: 33,
    });
  });

  it('keeps question text smaller than the previous oversized 1.1x treatment', () => {
    expect(getReflectionTypography('medium').questionFontSize).toBeLessThan(19);
    expect(getReflectionTypography('large').questionFontSize).toBeLessThan(22);
  });
});

describe('reflectionBodyPx', () => {
  it('maps reader font-size preferences to the shared writing body curve', () => {
    expect(reflectionBodyPx('small')).toBe(15);
    expect(reflectionBodyPx('medium')).toBe(17);
    expect(reflectionBodyPx('large')).toBe(20);
  });
});
