/**
 * Greptile A13 regression: the pause/resume effect started a second timer on
 * its mount pass, orphaning the start effect's timer, so an active segment
 * fired onSegmentComplete twice and pause could not stop the first timer.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StoryProgressBar } from '../StoryProgressBar';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { out: () => 'out', linear: 'linear', cubic: 'cubic' },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (v: unknown) => v,
    cancelAnimation: jest.fn(),
  };
});
jest.mock('@/constants/animations', () => ({ Duration: { fast: 120, normal: 250 } }));

describe('StoryProgressBar timers (Greptile A13)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('completes an active segment exactly once', () => {
    const onSegmentComplete = jest.fn();
    act(() => {
      renderer.create(<StoryProgressBar current={0} total={3} paused={false} duration={1000} onSegmentComplete={onSegmentComplete} />);
    });
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(onSegmentComplete).toHaveBeenCalledTimes(1);
  });

  it('does not run a timer for a segment that becomes active while already paused', () => {
    const onSegmentComplete = jest.fn();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<StoryProgressBar current={0} total={3} paused duration={1000} onSegmentComplete={onSegmentComplete} />);
    });
    // Advance to the next card while still paused (an overflowing card).
    act(() => {
      tree!.update(<StoryProgressBar current={1} total={3} paused duration={1000} onSegmentComplete={onSegmentComplete} />);
    });
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(onSegmentComplete).not.toHaveBeenCalled();

    act(() => {
      tree!.update(<StoryProgressBar current={1} total={3} paused={false} duration={1000} onSegmentComplete={onSegmentComplete} />);
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(onSegmentComplete).toHaveBeenCalledTimes(1);
  });

  it('does not complete a segment that was paused before its timer fired', () => {
    const onSegmentComplete = jest.fn();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<StoryProgressBar current={0} total={3} paused={false} duration={1000} onSegmentComplete={onSegmentComplete} />);
    });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    act(() => {
      tree!.update(<StoryProgressBar current={0} total={3} paused duration={1000} onSegmentComplete={onSegmentComplete} />);
    });
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(onSegmentComplete).not.toHaveBeenCalled();

    act(() => {
      tree!.update(<StoryProgressBar current={0} total={3} paused={false} duration={1000} onSegmentComplete={onSegmentComplete} />);
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(onSegmentComplete).toHaveBeenCalledTimes(1);
  });
});
