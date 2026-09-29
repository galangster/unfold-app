import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, fireEvent, render, type RenderResult } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { CheckIcon, CopyIcon } from '@/components/icons';
import { CompanionActions } from '../CompanionActions';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@shopify/react-native-skia', () => ({
  BackdropBlur: () => null,
  Canvas: () => null,
  Fill: () => null,
}));

// Shared values settle at once, so a rendered style is the resting style.
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    cancelAnimation: jest.fn(),
    interpolate: (value: number, input: number[], output: number[]) =>
      output[0] + ((value - input[0]) / (input[1] - input[0])) * (output[1] - output[0]),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useDerivedValue: (factory: () => unknown) => ({ value: factory() }),
    useSharedValue: (value: unknown) => ({ value }),
    withDelay: (_delay: number, value: unknown) => value,
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});

jest.mock('@/components/icons', () => ({
  CheckIcon: () => null,
  CopyIcon: () => null,
}));
jest.mock('@/constants/animations', () => ({
  Duration: { fast: 150 },
  Ease: { out: jest.fn() },
  Stagger: { normal: 80 },
}));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ colors: { success: '#2E7D32', textMuted: '#666666' } }),
}));
jest.mock('../CompanionMessageContent', () => ({ COMPANION_TEXT_INDENT: 0 }));

const REPLY = 'Grace is a gift, not a wage.';
const COPY_LABEL = /^(Copy response|Copied)$/;
const setStringAsync = jest.mocked(Clipboard.setStringAsync);

function renderRow(): RenderResult {
  return render(<CompanionActions content={REPLY} reducedMotion />);
}

function copyLabel(tree: RenderResult): string {
  return tree.getByLabelText(COPY_LABEL).props.accessibilityLabel;
}

async function pressCopy(tree: RenderResult) {
  await act(async () => {
    fireEvent.press(tree.getByLabelText(COPY_LABEL));
    await Promise.resolve();
  });
}

/** Opacity of the layer that holds the icon: 1 is in view, 0 is out of view. */
function iconOpacity(tree: RenderResult, Icon: typeof CheckIcon): number {
  const layer = tree.UNSAFE_getByType(Icon).parent;
  return StyleSheet.flatten(layer?.props.style).opacity;
}

describe('CompanionActions copy', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    // act() queues a microtask of its own. Microtasks stay real, so the
    // timer count holds timers only.
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'setImmediate'] });
    jest.clearAllMocks();
    setStringAsync.mockResolvedValue(true);
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    announce.mockRestore();
    jest.useRealTimers();
  });

  it('shows the copy icon and the copy label before a copy', () => {
    const tree = renderRow();

    expect(copyLabel(tree)).toBe('Copy response');
    expect(iconOpacity(tree, CopyIcon)).toBe(1);
    expect(iconOpacity(tree, CheckIcon)).toBe(0);
  });

  it('writes the reply to the clipboard, shows the check mark, and announces the copy', async () => {
    const tree = renderRow();

    await pressCopy(tree);

    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(setStringAsync).toHaveBeenCalledTimes(1);
    expect(setStringAsync).toHaveBeenCalledWith(REPLY);
    expect(copyLabel(tree)).toBe('Copied');
    expect(iconOpacity(tree, CopyIcon)).toBe(0);
    expect(iconOpacity(tree, CheckIcon)).toBe(1);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Copied');
  });

  it('returns to the copy icon and the copy label 2 seconds after the copy', async () => {
    const tree = renderRow();
    await pressCopy(tree);

    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(copyLabel(tree)).toBe('Copied');
    expect(iconOpacity(tree, CheckIcon)).toBe(1);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(copyLabel(tree)).toBe('Copy response');
    expect(iconOpacity(tree, CopyIcon)).toBe(1);
    expect(iconOpacity(tree, CheckIcon)).toBe(0);
  });

  it('leaves no timer behind when the row unmounts during the confirmation', async () => {
    const tree = renderRow();
    await pressCopy(tree);
    expect(jest.getTimerCount()).toBe(1);

    act(() => {
      tree.unmount();
    });

    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps the check mark for 2 seconds after a second copy', async () => {
    const tree = renderRow();
    await pressCopy(tree);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    await pressCopy(tree);

    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(copyLabel(tree)).toBe('Copied');
    expect(iconOpacity(tree, CheckIcon)).toBe(1);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(copyLabel(tree)).toBe('Copy response');
    expect(iconOpacity(tree, CheckIcon)).toBe(0);
  });

  it.each([
    ['refuses', () => setStringAsync.mockResolvedValue(false)],
    ['rejects', () => setStringAsync.mockRejectedValue(new Error('clipboard unavailable'))],
  ])('does not confirm or announce a copy that the clipboard %s', async (_case, arrange) => {
    arrange();
    const tree = renderRow();

    await pressCopy(tree);
    // One real macrotask. Node reports a rejection that nothing handled
    // before it ends, and Jest fails the test that was running.
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(setStringAsync).toHaveBeenCalledWith(REPLY);
    expect(copyLabel(tree)).toBe('Copy response');
    expect(iconOpacity(tree, CheckIcon)).toBe(0);
    expect(announce).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
