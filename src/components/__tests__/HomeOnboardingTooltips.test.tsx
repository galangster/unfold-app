import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Modal } from 'react-native';
import { HomeOnboardingTooltips, type OnboardingLayoutRects } from '@/components/HomeOnboardingTooltips';
import { useUIState } from '@/lib/ui-state';
import { useUnfoldStore } from '@/lib/store';
import { TAB_BAR_ROW_PADDING_TOP, tabBarRowPaddingBottom } from '@/lib/visible-tabs';

const mockUseReducedMotion = jest.fn(() => true);
// Set `completes` to false to hold the tour in its fade-out.
const mockFade = { completes: true };

// The real store pulls in native modules. The tour reads one flag from it.
jest.mock('@/lib/store', () => {
  const { create } = require('zustand');
  const useUnfoldStore = create((set: (state: object) => void) => ({
    hasSeenHomeTooltips: false,
    setHasSeenHomeTooltips: (seen: boolean) => set({ hasSeenHomeTooltips: seen }),
  }));
  return { useUnfoldStore };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#222222' }), isDark: false }),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chain = () => {
    const builder: Record<string, () => unknown> = {};
    builder.duration = () => builder;
    builder.easing = () => builder;
    builder.delay = () => builder;
    return builder;
  };
  return {
    __esModule: true,
    default: { View },
    Easing: new Proxy({}, { get: () => () => 'easing' }),
    FadeIn: chain(),
    FadeOut: chain(),
    useReducedMotion: () => mockUseReducedMotion(),
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    withTiming: (value: unknown, _config: unknown, done?: (finished: boolean) => void) => {
      if (mockFade.completes) done?.(true);
      return value;
    },
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  const Passthrough = (props: Record<string, unknown>) => <View {...props} />;
  return { __esModule: true, default: Passthrough, Defs: Passthrough, Mask: Passthrough, Path: Passthrough, Rect: Passthrough };
});

// The real tab bar row on a 440 x 956 phone. Its pads come from the shared
// tab-row constants, with a 34 pt home-indicator inset.
const TAB_ROW = { x: 0, y: 846, width: 440, height: 110 };
const BOTTOM_INSET = 34;
const NO_RECTS: OnboardingLayoutRects = { reading: null, context: null, rhythm: null };

function startTour(layoutRects: OnboardingLayoutRects, props: { onRevealTarget?: jest.Mock; onFinish?: jest.Mock } = {}) {
  return render(<HomeOnboardingTooltips layoutRects={layoutRects} {...props} />);
}

beforeEach(() => {
  mockUseReducedMotion.mockReturnValue(true);
  mockFade.completes = true;
  useUnfoldStore.setState({ hasSeenHomeTooltips: false });
  useUIState.setState({ tabBarHidden: false, tabBarRowRect: TAB_ROW });
});

describe('HomeOnboardingTooltips', () => {
  it('draws the tour above the tab bar and spotlights the measured tabs', () => {
    startTour(NO_RECTS);

    expect(screen.getByText('Read, Ask & Write')).toBeTruthy();
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);

    const hole = screen.getByTestId('home-tooltip-spotlight').props;
    const iconsTop = TAB_ROW.y + TAB_BAR_ROW_PADDING_TOP;
    const iconsBottom = TAB_ROW.y + TAB_ROW.height - tabBarRowPaddingBottom(BOTTOM_INSET);
    expect(hole.y).toBeGreaterThanOrEqual(TAB_ROW.y - 8);
    expect(hole.y).toBeLessThanOrEqual(iconsTop);
    expect(hole.y + hole.height).toBeGreaterThanOrEqual(iconsBottom);
    expect(hole.y + hole.height).toBeLessThanOrEqual(iconsBottom + 8);
  });

  it('asks Today to bring an off-screen target into view before pointing at it', () => {
    const onRevealTarget = jest.fn();
    const belowTheTabBar = { x: 24, y: 900, width: 392, height: 150 };
    const view = startTour({ ...NO_RECTS, rhythm: belowTheTabBar }, { onRevealTarget });

    expect(onRevealTarget).toHaveBeenCalledTimes(1);
    expect(onRevealTarget.mock.calls[0][0]).toBeGreaterThan(0);
    expect(screen.queryByText('Daily Rhythm')).toBeNull();

    view.rerender(
      <HomeOnboardingTooltips layoutRects={{ ...NO_RECTS, rhythm: { ...belowTheTabBar, y: 640 } }} onRevealTarget={onRevealTarget} />,
    );

    expect(screen.getByText('Daily Rhythm')).toBeTruthy();
    expect(onRevealTarget).toHaveBeenCalledTimes(1);
  });

  it('asks again when fresh positions still leave the target out of view', () => {
    const onRevealTarget = jest.fn();
    const view = startTour({ ...NO_RECTS, rhythm: { x: 24, y: 900, width: 392, height: 150 } }, { onRevealTarget });

    // A replayed tour can start from positions taken at an old scroll offset.
    view.rerender(
      <HomeOnboardingTooltips layoutRects={{ ...NO_RECTS, rhythm: { x: 24, y: 880, width: 392, height: 150 } }} onRevealTarget={onRevealTarget} />,
    );

    expect(onRevealTarget).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Daily Rhythm')).toBeNull();
  });

  it('scrolls Today back up when a target sits above the top of the screen', () => {
    const onRevealTarget = jest.fn();
    startTour({ ...NO_RECTS, reading: { x: 24, y: -120, width: 392, height: 416 } }, { onRevealTarget });

    expect(onRevealTarget).toHaveBeenCalledTimes(1);
    expect(onRevealTarget.mock.calls[0][0]).toBeLessThan(0);
  });

  it('keeps the top of a tall target on screen when it scrolls down', () => {
    const onRevealTarget = jest.fn();
    const tall = { x: 24, y: 300, width: 392, height: 900 };
    startTour({ ...NO_RECTS, rhythm: tall }, { onRevealTarget });

    const distance = onRevealTarget.mock.calls[0][0];
    expect(distance).toBeGreaterThan(0);
    // The safe-area top is 59 pt in this test.
    expect(tall.y - distance).toBeGreaterThanOrEqual(59);
  });

  it('waits for the tab bar to report where the tabs sit', () => {
    useUIState.setState({ tabBarRowRect: null });
    startTour(NO_RECTS);

    expect(screen.queryByText('Read, Ask & Write')).toBeNull();

    act(() => {
      useUIState.setState({ tabBarRowRect: TAB_ROW });
    });

    expect(screen.getByText('Read, Ask & Write')).toBeTruthy();
  });

  it('fades out and still closes when motion is on', () => {
    mockUseReducedMotion.mockReturnValue(false);
    const onFinish = jest.fn();
    startTour(NO_RECTS, { onFinish });

    act(() => {
      fireEvent.press(screen.getByText('Got it'));
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(useUnfoldStore.getState().hasSeenHomeTooltips).toBe(true);
  });

  it('shows the step anyway when a reveal stalls', () => {
    jest.useFakeTimers();
    try {
      const onRevealTarget = jest.fn();
      startTour({ ...NO_RECTS, rhythm: { x: 24, y: 900, width: 392, height: 150 } }, { onRevealTarget });

      expect(screen.queryByText('Daily Rhythm')).toBeNull();

      act(() => {
        jest.advanceTimersByTime(1500);
      });

      expect(screen.getByText('Daily Rhythm')).toBeTruthy();
      expect(screen.getByText('Next')).toBeTruthy();
      expect(screen.getByText('Skip')).toBeTruthy();
      expect(onRevealTarget).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('takes no taps and asks for no scroll while it fades out', () => {
    mockUseReducedMotion.mockReturnValue(false);
    mockFade.completes = false;
    const onRevealTarget = jest.fn();
    const onFinish = jest.fn();
    startTour(
      { ...NO_RECTS, context: { x: 24, y: 420, width: 392, height: 200 }, rhythm: { x: 24, y: 900, width: 392, height: 150 } },
      { onRevealTarget, onFinish },
    );

    act(() => {
      fireEvent.press(screen.getByText('Skip'));
    });
    act(() => {
      fireEvent.press(screen.getByText('Next'));
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onRevealTarget).not.toHaveBeenCalled();
  });

  it('hands Today back to the top when the tour ends', () => {
    const onFinish = jest.fn();
    startTour(NO_RECTS, { onFinish });

    act(() => {
      fireEvent.press(screen.getByText('Got it'));
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(useUnfoldStore.getState().hasSeenHomeTooltips).toBe(true);
  });

  it('introduces the card stack to every new reader', () => {
    startTour({ ...NO_RECTS, context: { x: 24, y: 420, width: 392, height: 200 } });

    expect(screen.getByText('Through the day')).toBeTruthy();
    expect(screen.queryByText('Companion check-in')).toBeNull();
  });
});
