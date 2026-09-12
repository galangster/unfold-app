import * as fs from 'fs';
import * as path from 'path';
import React, { useEffect } from 'react';
import { useCreationGate } from '../useCreationGate';

// useCreationGate now reaches the auto-trial exit decision, whose storage seam loads netinfo.
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()) }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '' }, Directory: jest.fn() }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '1' }));
const mockResolveLaterEntryExit = jest.fn();
const mockRequestLaterEntryNotifyAsk = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('@/lib/auto-trial-exit', () => ({
  resolveLaterEntryExit: (...args: unknown[]) => mockResolveLaterEntryExit(...args),
}));
jest.mock('@/lib/notification-ask', () => ({
  requestLaterEntryNotifyAsk: (...args: unknown[]) => mockRequestLaterEntryNotifyAsk(...args),
}));

const renderer = jest.requireActual('react-test-renderer');
const { act } = renderer;

const mockNavigate = jest.fn();
const mockPush = jest.fn();
const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockNotify = jest.fn();
let mockPolicy: 'granted' | 'denied' | 'unknown' = 'denied';

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, navigate: (...args: unknown[]) => mockNavigate(...args),
  useSegments: () => [],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }) }),
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
  usePremiumAccessPolicy: () => mockPolicy,
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: (...args: unknown[]) => mockNotify(...args),
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

describe('useCreationGate paywall presentation', () => {
  beforeEach(() => {
    mockPolicy = 'denied';
    mockNavigate.mockReset();
    mockPush.mockReset();
    mockGetItem.mockReset();
    mockSetItem.mockReset();
    mockNotify.mockReset();
    mockGetItem.mockReturnValue(null);
  });

  it('presents the paywall with navigate for each denied edit, never push', async () => {
    const { gate } = await renderGate();

    await act(async () => {
      expect(gate()).toBe(false);
      expect(gate()).toBe(false);
      expect(gate()).toBe(false);
    });

    expect(mockNavigate.mock.calls).toEqual([['/paywall'], ['/paywall'], ['/paywall']]);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps granted access on the invoking screen', async () => {
    mockPolicy = 'granted';
    const { gate, isPremium } = await renderGate();

    expect(isPremium).toBe(true);
    expect(gate()).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps unknown policy on pending feedback instead of a paywall', async () => {
    mockPolicy = 'unknown';
    const { gate } = await renderGate();

    expect(gate()).toBe(false);
    expect(mockNotify).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('burns the once-ever offer only when the sheet actually showed one', async () => {
    const { dismissOffer } = await renderGate();

    await act(async () => {
      dismissOffer({ offerShown: true });
    });

    expect(mockSetItem).toHaveBeenCalledWith('@unfold_exclusive_offer_seen', 'true');
  });

  it('leaves the once-ever offer intact when the sheet never made one', async () => {
    // The sheet reports offerShown: false when it could only render its failure
    // state. Writing the flag anyway spent the person's single chance on a
    // "View Plans" tap that showed them no offer.
    const { dismissOffer } = await renderGate();

    await act(async () => {
      dismissOffer({ offerShown: false });
    });

    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('leaves the once-ever offer intact for a caller that reports no outcome', async () => {
    const { dismissOffer } = await renderGate();

    await act(async () => {
      dismissOffer();
    });

    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('keeps the exclusive-offer branch ahead of paywall navigation', () => {
    const src = fs.readFileSync(path.join(__dirname, '../useCreationGate.ts'), 'utf8');
    const exclusiveIdx = src.indexOf("if (action === 'exclusive-offer')");
    const navigateIdx = src.indexOf("router.navigate('/paywall')");
    expect(src).toContain('getChurnedCreationGateAction');
    expect(exclusiveIdx).toBeGreaterThan(-1);
    expect(navigateIdx).toBeGreaterThan(exclusiveIdx);
    expect(src).not.toContain('router.push(');
  });
});
