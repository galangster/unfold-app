import React, { useEffect } from 'react';
import { useReaderBrightness } from '../useReaderBrightness';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockIsAvailableAsync = jest.fn();
const mockGetBrightnessAsync = jest.fn();
const mockSetBrightnessAsync = jest.fn();
const mockSetReaderBrightness = jest.fn((value: number | null) => {
  mockStoreState.readerBrightness = value;
});

let mockStoreState = {
  readerBrightness: null as number | null,
  setReaderBrightness: mockSetReaderBrightness,
};

jest.mock('expo-brightness', () => ({
  isAvailableAsync: (...args: unknown[]) => mockIsAvailableAsync(...args),
  getBrightnessAsync: (...args: unknown[]) => mockGetBrightnessAsync(...args),
  setBrightnessAsync: (...args: unknown[]) => mockSetBrightnessAsync(...args),
}));

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

type HookResult = ReturnType<typeof useReaderBrightness>;

function HookProbe({ onValue }: { onValue: (value: HookResult) => void }) {
  const value = useReaderBrightness();
  useEffect(() => {
    onValue(value);
  }, [onValue, value]);
  return null;
}

async function renderHookProbe() {
  let latest: HookResult | null = null;
  await act(async () => {
    renderer.create(<HookProbe onValue={(value) => { latest = value; }} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  if (!latest) throw new Error('Hook did not render');
  return latest as HookResult;
}

describe('useReaderBrightness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreState = {
      readerBrightness: null,
      setReaderBrightness: mockSetReaderBrightness,
    };
    mockIsAvailableAsync.mockResolvedValue(true);
    mockGetBrightnessAsync.mockResolvedValue(0.8);
    mockSetBrightnessAsync.mockResolvedValue(undefined);
  });

  it('does not apply device brightness on mount when no reader value is stored', async () => {
    const result = await renderHookProbe();

    expect(result.brightness).toBeNull();
    expect(result.brightnessAvailable).toBe(true);
    expect(mockGetBrightnessAsync).toHaveBeenCalledTimes(1);
    expect(mockSetBrightnessAsync).not.toHaveBeenCalled();
  });

  it('applies a stored reader brightness on mount after capturing the original level', async () => {
    mockStoreState.readerBrightness = 0.42;

    await renderHookProbe();

    expect(mockGetBrightnessAsync).toHaveBeenCalledTimes(1);
    expect(mockSetBrightnessAsync).toHaveBeenCalledWith(0.42);
  });

  it('clamps, persists, and applies explicit brightness changes', async () => {
    const result = await renderHookProbe();

    await act(async () => {
      await result.setBrightness(0.01);
    });

    expect(mockSetReaderBrightness).toHaveBeenCalledWith(0.15);
    expect(mockSetBrightnessAsync).toHaveBeenCalledWith(0.15);
  });

  it('resets to system brightness preference and restores the captured original value', async () => {
    mockStoreState.readerBrightness = 0.35;
    const result = await renderHookProbe();
    mockSetBrightnessAsync.mockClear();

    await act(async () => {
      await result.resetBrightness();
    });

    expect(mockSetReaderBrightness).toHaveBeenCalledWith(null);
    expect(mockSetBrightnessAsync).toHaveBeenCalledWith(0.8);
  });

  it('reports unavailable brightness without throwing or applying values', async () => {
    mockIsAvailableAsync.mockResolvedValue(false);
    mockStoreState.readerBrightness = 0.4;

    const result = await renderHookProbe();

    expect(result.brightnessAvailable).toBe(false);
    expect(mockGetBrightnessAsync).not.toHaveBeenCalled();
    expect(mockSetBrightnessAsync).not.toHaveBeenCalled();
  });
});
