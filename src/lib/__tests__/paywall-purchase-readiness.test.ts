import { resolvePurchaseReadiness } from '../paywall-purchase-readiness';
import type { PurchasesPackage } from 'react-native-purchases';

describe('resolvePurchaseReadiness', () => {
  it('package present → purchase', () => {
    const result = resolvePurchaseReadiness({ pkg: {} as PurchasesPackage });
    expect(result).toEqual({ action: 'purchase' });
  });

  it('package missing → refetch then purchase when refetch yields one', () => {
    const result = resolvePurchaseReadiness({ pkg: null, refetchedPkg: {} as PurchasesPackage });
    expect(result).toEqual({ action: 'purchase-after-refetch' });
  });

  it('package missing and refetch empty → visible error', () => {
    const result = resolvePurchaseReadiness({ pkg: null, refetchedPkg: null });
    expect(result).toEqual({
      action: 'error',
      message: "Couldn't load subscription plans. Check your connection and try again.",
    });
  });
});
