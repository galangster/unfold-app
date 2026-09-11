/**
 * StoryProgressBar — Stories-style segmented progress for the Unfolded recap.
 * Each active segment fills over `duration` ms and fires onSegmentComplete.
 */
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Duration } from '@/constants/animations';

const GOLD = '#C8A55C';

export function StoryProgressBar({
  current,
  total,
  paused,
  duration,
  onSegmentComplete,
}: {
  current: number;
  total: number;
  paused: boolean;
  duration: number;
  onSegmentComplete: () => void;
}) {
  return (
    <View style={styles.progressContainer}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={styles.progressSegment}>
          <ProgressFill
            isActive={i === current}
            isComplete={i < current}
            paused={paused}
            duration={duration}
            onComplete={onSegmentComplete}
          />
        </View>
      ))}
    </View>
  );
}

function ProgressFill({
  isActive,
  isComplete,
  paused,
  duration,
  onComplete,
}: {
  isActive: boolean;
  isComplete: boolean;
  paused: boolean;
  duration: number;
  onComplete: () => void;
}) {
  const width = useSharedValue(isComplete ? 100 : 0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);
  const elapsedRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Start animation + timer when this segment becomes active
  useEffect(() => {
    clearTimer();
    elapsedRef.current = 0;

    if (isComplete) {
      width.value = 100;
      return;
    }
    if (!isActive) {
      width.value = withTiming(0, { duration: Duration.normal });
      return;
    }
    if (duration === 0) {
      // Last card (no auto-advance) — fill bar immediately
      width.value = withTiming(100, { duration: 400, easing: Easing.out(Easing.cubic) });
      return;
    }

    // Start fill animation and auto-advance timer
    width.value = 0;
    width.value = withTiming(100, { duration, easing: Easing.linear });
    startTimeRef.current = Date.now();

    timerRef.current = setTimeout(() => {
      onComplete();
    }, duration);

    return clearTimer;
  }, [isActive, isComplete, duration, onComplete, clearTimer]);

  // Pause/resume. Runs only on a paused transition: on the mount pass the
  // start effect above already owns the timer, and starting a second one here
  // orphaned the first so clearTimer could never cancel it.
  const wasPausedRef = useRef(paused);
  useEffect(() => {
    const wasPaused = wasPausedRef.current;
    wasPausedRef.current = paused;
    if (!isActive || duration === 0 || isComplete) return;
    if (!paused && !wasPaused) return;

    if (paused) {
      // Freeze
      clearTimer();
      elapsedRef.current += Date.now() - startTimeRef.current;
      cancelAnimation(width);
    } else {
      // Resume
      const remaining = duration - elapsedRef.current;
      if (remaining > 100) {
        width.value = withTiming(100, { duration: remaining, easing: Easing.linear });
        startTimeRef.current = Date.now();
        timerRef.current = setTimeout(() => {
          onComplete();
        }, remaining);
      }
    }

    return clearTimer;
  }, [paused]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
    backgroundColor: isComplete ? 'rgba(255,255,255,0.5)' : GOLD,
  }));

  return <Animated.View style={[styles.progressFill, fillStyle]} />;
}

const styles = StyleSheet.create({
  progressContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    height: 3,
  },
  progressSegment: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
});
