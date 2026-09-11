/* eslint-disable import/first */
const mockConstants: { expoConfig: { extra?: unknown } | null } = { expoConfig: { extra: {} } };

jest.mock('expo-constants', () => ({ __esModule: true, default: mockConstants }));

import { DAY_MS, QA_SIMULATED_TRIAL_APP_USER_ID } from '../trial-facts';
import {
  buildSimulatedTrialCustomerInfo,
  simulateTrialPurchase,
} from '../qa-simulated-trial';

describe('L1 qa-simulated-trial', () => {
  const devGlobal = globalThis as typeof globalThis & { __DEV__: boolean };
  const originalDev = devGlobal.__DEV__;
  const originalFlag = process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS;

  function arrange(buildProfile: string | null, isDev: boolean, flag: string | undefined) {
    mockConstants.expoConfig = { extra: buildProfile === null ? {} : { buildProfile } };
    devGlobal.__DEV__ = isDev;
    if (flag === undefined) {
      delete process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS;
    } else {
      process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS = flag;
    }
  }

  afterEach(() => {
    devGlobal.__DEV__ = originalDev;
    if (originalFlag === undefined) {
      delete process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS;
    } else {
      process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS = originalFlag;
    }
    mockConstants.expoConfig = { extra: {} };
  });

  it('P1 refuses under a production profile even with __DEV__ and the flag', () => {
    arrange('production', true, '1');
    const handle = jest.fn();
    expect(simulateTrialPurchase({ trialLengthMs: 3 * DAY_MS, handle })).toEqual({
      ok: false,
      reason: 'qa-disabled',
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it('P2 refuses in an unstamped release bundle with a stray flag', () => {
    arrange(null, false, '1');
    const handle = jest.fn();
    expect(simulateTrialPurchase({ trialLengthMs: 3 * DAY_MS, handle })).toEqual({
      ok: false,
      reason: 'qa-disabled',
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it('calls the handler once with source purchase in a dev bundle and a stamped qa-testflight build', () => {
    const now = new Date('2026-09-10T17:00:00.000Z');
    const trialLengthMs = 180_000;

    arrange('development', true, undefined);
    const devHandle = jest.fn();
    expect(simulateTrialPurchase({ trialLengthMs, now, handle: devHandle })).toEqual({ ok: true });
    expect(devHandle).toHaveBeenCalledTimes(1);
    expect(devHandle).toHaveBeenCalledWith({
      source: 'purchase',
      customerInfo: expect.objectContaining({
        originalAppUserId: QA_SIMULATED_TRIAL_APP_USER_ID,
      }),
    });

    arrange('qa-testflight', false, '1');
    const qaHandle = jest.fn();
    expect(simulateTrialPurchase({ trialLengthMs, now, handle: qaHandle })).toEqual({ ok: true });
    expect(qaHandle).toHaveBeenCalledTimes(1);
    expect(qaHandle.mock.calls[0][0].source).toBe('purchase');
  });

  it('builds fixture fields per §11.1', () => {
    const now = new Date('2026-09-10T17:00:00.000Z');
    const trialLengthMs = 259_200_000;
    const info = buildSimulatedTrialCustomerInfo({ now, trialLengthMs });
    const entitlement = info.entitlements.active['Unfold Premium'] as {
      identifier: string;
      isActive: boolean;
      willRenew: boolean;
      periodType: string;
      store: string;
      ownershipType: string;
      productIdentifier: string;
      isSandbox: boolean;
      expirationDate: string;
      latestPurchaseDate: string;
      expirationDateMillis: number;
      latestPurchaseDateMillis: number;
    };
    expect(info.originalAppUserId).toBe(QA_SIMULATED_TRIAL_APP_USER_ID);
    expect(info.requestDate).toBe(now.toISOString());
    expect(entitlement).toMatchObject({
      identifier: 'Unfold Premium',
      isActive: true,
      willRenew: true,
      periodType: 'TRIAL',
      store: 'APP_STORE',
      ownershipType: 'PURCHASED',
      productIdentifier: 'unfold_premium_yearly',
      isSandbox: true,
    });
    expect(Date.parse(entitlement.expirationDate) - Date.parse(entitlement.latestPurchaseDate)).toBe(trialLengthMs);
    expect(entitlement.expirationDateMillis - entitlement.latestPurchaseDateMillis).toBe(trialLengthMs);
    expect(info.entitlements.all['Unfold Premium']).toEqual(entitlement);
  });
});
