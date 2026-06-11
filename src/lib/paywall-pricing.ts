/**
 * One per-month equivalent for the yearly plan, shared by every paywall
 * (de-slop Top10 #5: $5.00/mo vs $4.99/mo for the same product).
 *
 * Truncates to the cent — matches Apple's own App Store yearly-as-monthly
 * presentation ($59.99/yr → $4.99/mo) and never overstates the price.
 * Integer-cent math avoids float-floor penny errors (119.88/12 must be 9.99,
 * but naive Math.floor((raw/12)*100)/100 gives 9.98 in binary float).
 * Currency symbol is extracted from RC's locale-aware priceString —
 * never hardcode '$' around a raw number (FAP-UI-2).
 */
export function getPerMonthEquivalent(yearlyRaw: number, yearlyPriceString: string): string {
  const currencySymbol = yearlyPriceString.replace(/[\d.,\s]/g, '').trim() || '$';
  const yearlyCents = Math.round(yearlyRaw * 100);
  const perMonthCents = Math.floor(yearlyCents / 12);
  const whole = Math.floor(perMonthCents / 100);
  const cents = (perMonthCents % 100).toString().padStart(2, '0');
  return `${currencySymbol}${whole}.${cents}`;
}
