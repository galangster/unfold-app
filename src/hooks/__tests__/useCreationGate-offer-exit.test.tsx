import React, { useEffect } from 'react';
import type { CustomerInfo } from 'react-native-purchases';
import type { VerifiedEntitlementExit } from '@/lib/auto-trial-exit';
import { useCreationGate } from '../useCreationGate';

const renderer = jest.requireActual('react-test-renderer');
const { act } = renderer;

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockResolveLaterEntryExit = jest.fn();
const mockRequestLaterEntryNotifyAsk = jest.fn();
const mockGetItem = jest.fn();
const mockSetItem = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    navigate: (...args: unknown[]) => mockNavigate(...args),
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
  }),
}));

jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: {
    getItem: (...args: unknown[]) => mockGetItem(...args),
    setItem: (...args: unknown[]) => mockSetItem(...args),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => 'denied',
}));

jest.mock('@/lib/auto-trial-exit', () => ({
  resolveLaterEntryExit: (...args: unknown[]) => mockResolveLaterEntryExit(...args),
}));

jest.mock('@/lib/notification-ask', () => ({
  requestLaterEntryNotifyAsk: (...args: unknown[]) => mockRequestLaterEntryNotifyAsk(...args),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Warning: 'warning' },
}));

type HookResult = ReturnType<typeof useCreationGate>;

function HookProbe({ onValue }: { onValue: (value: HookResult) => void }) {
  const value = useCreationGate();
  useEffect(() => {
    onValue(value);
  }, [onValue, value]);
  return null;
}

async function renderGate(): Promise<HookResult> {
  let latest: HookResult | null = null;
  await act(async () => {
    renderer.create(<HookProbe onValue={(value: HookResult) => { latest = value; }} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  if (!latest) throw new Error('useCreationGate did not render');
  return latest;
}

const EXIT: VerifiedEntitlementExit = {
  source: 'offer',
  customerInfo: { entitlements: { active: {} } } as CustomerInfo,
};

describe('F7 useCreationGate handleOfferVerifiedExit', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockNavigate.mockReset();
    mockResolveLaterEntryExit.mockReset();
    mockRequestLaterEntryNotifyAsk.mockReset();
    mockGetItem.mockReset();
    mockSetItem.mockReset();
    mockGetItem.mockReturnValue(null);
  });

  it('dismisses the offer, resolves a later-entry auto decision, and navigates to reveal', async () => {
    mockResolveLaterEntryExit.mockReturnValue({
      kind: 'auto',
      intent: { intentId: 'intent-auto' },
      created: true,
    });

    const { handleOfferVerifiedExit } = await renderGate();

    await act(async () => {
      await handleOfferVerifiedExit(EXIT);
    });

    expect(mockSetItem).toHaveBeenCalledWith('@unfold_exclusive_offer_seen', 'true');
    expect(mockResolveLaterEntryExit).toHaveBeenCalledWith(EXIT, 'churned_sheet');
    expect(mockNavigate).toHaveBeenCalledWith('/generating');
    expect(mockRequestLaterEntryNotifyAsk).not.toHaveBeenCalled();
  });

  it('asks for later-entry notify and does not navigate on fallback', async () => {
    mockResolveLaterEntryExit.mockReturnValue({
      kind: 'fallback',
      reason: 'switch_off',
    });

    const { handleOfferVerifiedExit } = await renderGate();

    await act(async () => {
      await handleOfferVerifiedExit(EXIT);
    });

    expect(mockSetItem).toHaveBeenCalledWith('@unfold_exclusive_offer_seen', 'true');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockRequestLaterEntryNotifyAsk).toHaveBeenCalledWith(EXIT.customerInfo);
  });
});
