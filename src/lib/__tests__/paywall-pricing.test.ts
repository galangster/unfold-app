import { getPerMonthEquivalent } from '@/lib/paywall-pricing';

describe('getPerMonthEquivalent', () => {
  it('truncates to the cent like the App Store yearly-as-monthly presentation', () => {
    // 59.99 / 12 = 4.99916… — must NOT round up to $5.00 (de-slop Top10 #5)
    expect(getPerMonthEquivalent(59.99, '$59.99')).toBe('$4.99');
  });

  it('avoids the float-floor penny bug via integer-cent math', () => {
    // 119.88 / 12 = 9.99 exactly; naive float floor yields 9.98
    expect(getPerMonthEquivalent(119.88, '$119.88')).toBe('$9.99');
  });

  it('handles exact divisions and zero cents', () => {
    expect(getPerMonthEquivalent(120, '$120.00')).toBe('$10.00');
    expect(getPerMonthEquivalent(60, '$60.00')).toBe('$5.00');
  });

  it('extracts the locale currency symbol from the price string', () => {
    expect(getPerMonthEquivalent(49.99, '49,99 €')).toBe('€4.16');
    expect(getPerMonthEquivalent(59.99, '£59.99')).toBe('£4.99');
  });

  it('falls back to $ when the price string carries no symbol', () => {
    expect(getPerMonthEquivalent(59.99, '59.99')).toBe('$4.99');
  });

  it('returns empty when offerings are missing instead of fabricating $0.00/mo', () => {
    // Offerings failed/loading: paywall.tsx passes raw 0 and an empty price
    // string. Rendering must show nothing, never a derived "$0.00/mo" (3.1.2c).
    expect(getPerMonthEquivalent(0, '')).toBe('');
    expect(getPerMonthEquivalent(0, '$59.99')).toBe('');
    expect(getPerMonthEquivalent(59.99, '   ')).toBe('');
  });
});
