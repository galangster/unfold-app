import { memo, useEffect, useId, useMemo, useState } from 'react';
import { AppState, type AppStateStatus, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import {
  COMPANION_IDENTITY_IN_DELAY_MS,
  COMPANION_IDENTITY_IN_MS,
  COMPANION_IDLE_CYCLES,
  COMPANION_IDENTITY_OUT_MS,
  COMPANION_MORPH_MS,
  COMPANION_OUTER_REST_SCALE,
  COMPANION_SPHERE_SCALE,
  COMPANION_THINKING_DELAYS_MS,
  COMPANION_THINKING_MS,
  COMPANION_THINKING_Y,
  HALO,
  VIEWBOX,
  companionLayout,
  type CompanionExpression,
  type CompanionIdleMotionCycle,
} from '@/lib/companion-avatar-model';
import { CompanionIdentity } from './CompanionIdentity';
import { CompanionPearl } from './CompanionPearl';

export type CompanionIdleStyle = 'calm' | 'joyful' | 'off';

export interface CompanionAvatarProps {
  size: number;
  thinking?: boolean;
  expression?: CompanionExpression;
  idleStyle?: CompanionIdleStyle;
  animated?: boolean;
  active?: boolean;
}

const MORPH_EASE = Easing.bezier(0.22, 1.16, 0.36, 1);
const LIFE_EASE = Easing.bezier(0.19, 1, 0.22, 1);
const IDLE_EASE = Easing.bezier(0.45, 0, 0.55, 1);
const IDLE_TRANSITION_MS = 420;

function useIsAppActive(): boolean {
  const [appState, setAppState] = useState<AppStateStatus | null>(AppState.currentState ?? null);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);
  return appState == null || appState === 'active';
}

function cancelValues(...values: SharedValue<number>[]) {
  for (const value of values) cancelAnimation(value);
}

// The live accessibility gate owns motion. Reanimated caches its System flag at startup.
// Override that stale flag only after the gate permits animation. Children inherit this policy.
function withLiveMotion(animation: number): number {
  return withDelay(0, animation, ReduceMotion.Never);
}

function thinkingSequence(distance: number) {
  const down = Math.round(COMPANION_THINKING_MS * 0.2);
  const rise = Math.round(COMPANION_THINKING_MS * 0.3);
  const settle = Math.round(COMPANION_THINKING_MS * 0.15);
  return withRepeat(
    withSequence(
      withTiming(-distance * 0.18, { duration: down, easing: Easing.inOut(Easing.ease) }),
      withTiming(distance, { duration: rise, easing: Easing.inOut(Easing.ease) }),
      withTiming(distance * 0.63, { duration: settle, easing: Easing.inOut(Easing.ease) }),
      withTiming(0, { duration: COMPANION_THINKING_MS - down - rise - settle, easing: Easing.inOut(Easing.ease) }),
    ),
    -1,
    false,
  );
}

function idleCycleSequence(cycle: CompanionIdleMotionCycle) {
  return withSequence(
    withTiming(0, { duration: 0 }),
    ...cycle.frames.slice(1).map((frame, index) => withTiming(frame.timeMs, {
      duration: frame.timeMs - cycle.frames[index].timeMs,
      easing: IDLE_EASE,
    })),
  );
}

function idleMotionChannels(cycle: CompanionIdleMotionCycle) {
  return {
    times: cycle.frames.map((frame) => frame.timeMs),
    bodyX: cycle.frames.map((frame) => frame.bodyX),
    bodyY: cycle.frames.map((frame) => frame.bodyY),
    bodyScaleX: cycle.frames.map((frame) => frame.bodyScaleX),
    bodyScaleY: cycle.frames.map((frame) => frame.bodyScaleY),
    faceX: cycle.frames.map((frame) => frame.faceX),
    faceY: cycle.frames.map((frame) => frame.faceY),
    faceScaleX: cycle.frames.map((frame) => frame.faceScaleX),
    faceOpacity: cycle.frames.map((frame) => frame.faceOpacity),
    haloY: cycle.frames.map((frame) => frame.haloY),
    haloRotate: cycle.frames.map((frame) => frame.haloRotate),
  };
}

const CALM_IDLE = idleMotionChannels(COMPANION_IDLE_CYCLES.calm);
const JOYFUL_IDLE = idleMotionChannels(COMPANION_IDLE_CYCLES.joyful);

/** Warm pearl with a single eye pair and overhead gold halo. */
export const CompanionAvatar = memo(function CompanionAvatar({
  size,
  thinking = false,
  expression = 'gentle',
  idleStyle = 'calm',
  animated = true,
  active = true,
}: CompanionAvatarProps) {
  const { reducedMotion } = useAccessibleAnimation();
  const isAppActive = useIsAppActive();
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const faceId = rawId.length > 0 ? rawId : 'companion';
  const layout = useMemo(() => companionLayout(size), [size]);
  const live = animated && active && isAppActive && !reducedMotion;

  const morphLeft = useSharedValue(thinking ? 1 : 0);
  const morphCenter = useSharedValue(thinking ? 1 : 0);
  const morphRight = useSharedValue(thinking ? 1 : 0);
  const identity = useSharedValue(thinking ? 0 : 1);
  const bobLeft = useSharedValue(0);
  const bobCenter = useSharedValue(0);
  const bobRight = useSharedValue(0);
  const blink = useSharedValue(0);
  const idleTime = useSharedValue(0);
  const idleWeight = useSharedValue(0);
  const idleMode = useSharedValue(idleStyle === 'joyful' ? 1 : 0);
  const idleCycle = COMPANION_IDLE_CYCLES[idleStyle === 'joyful' ? 'joyful' : 'calm'];

  useEffect(() => {
    const morphValues = [morphLeft, morphCenter, morphRight];
    const motionValues = [bobLeft, bobCenter, bobRight, blink, idleTime, idleWeight, idleMode];
    const stopAll = () => cancelValues(identity, ...morphValues, ...motionValues);
    stopAll();

    if (!live) {
      morphValues.forEach((value) => { value.value = thinking ? 1 : 0; });
      motionValues.forEach((value) => { value.value = 0; });
      identity.value = thinking ? 0 : 1;
      return stopAll;
    }

    if (thinking) {
      blink.value = withLiveMotion(withTiming(0, { duration: 120, easing: LIFE_EASE }));
      idleWeight.value = withLiveMotion(withTiming(0, { duration: IDLE_TRANSITION_MS, easing: LIFE_EASE }, (finished) => {
        if (finished) {
          idleTime.value = 0;
        }
      }));
      identity.value = withLiveMotion(withTiming(0, { duration: COMPANION_IDENTITY_OUT_MS, easing: LIFE_EASE }));
      morphCenter.value = withLiveMotion(withTiming(1, { duration: COMPANION_MORPH_MS, easing: MORPH_EASE }));
      morphLeft.value = withLiveMotion(withDelay(45, withTiming(1, { duration: COMPANION_MORPH_MS, easing: MORPH_EASE })));
      morphRight.value = withLiveMotion(withDelay(90, withTiming(1, { duration: COMPANION_MORPH_MS, easing: MORPH_EASE })));
      const distance = COMPANION_THINKING_Y * layout.viewScale;
      bobLeft.value = withLiveMotion(withDelay(COMPANION_MORPH_MS + COMPANION_THINKING_DELAYS_MS[0], thinkingSequence(distance)));
      bobCenter.value = withLiveMotion(withDelay(COMPANION_MORPH_MS + COMPANION_THINKING_DELAYS_MS[1], thinkingSequence(distance)));
      bobRight.value = withLiveMotion(withDelay(COMPANION_MORPH_MS + COMPANION_THINKING_DELAYS_MS[2], thinkingSequence(distance)));
    } else {
      bobLeft.value = withLiveMotion(withTiming(0, { duration: 240, easing: LIFE_EASE }));
      bobCenter.value = withLiveMotion(withTiming(0, { duration: 240, easing: LIFE_EASE }));
      bobRight.value = withLiveMotion(withTiming(0, { duration: 240, easing: LIFE_EASE }));
      morphLeft.value = withLiveMotion(withTiming(0, { duration: COMPANION_MORPH_MS, easing: MORPH_EASE }));
      morphRight.value = withLiveMotion(withDelay(35, withTiming(0, { duration: COMPANION_MORPH_MS, easing: MORPH_EASE })));
      morphCenter.value = withLiveMotion(withDelay(75, withTiming(0, { duration: COMPANION_MORPH_MS, easing: MORPH_EASE })));
      identity.value = withLiveMotion(withDelay(COMPANION_IDENTITY_IN_DELAY_MS, withTiming(1, { duration: COMPANION_IDENTITY_IN_MS, easing: LIFE_EASE })));

      if (idleStyle !== 'off') {
        blink.value = withLiveMotion(withRepeat(withSequence(
          withTiming(0, { duration: 120, easing: LIFE_EASE }),
          withDelay(idleStyle === 'joyful' ? 4700 : 6700, withTiming(1, { duration: 85, easing: LIFE_EASE })),
          withTiming(0, { duration: 115, easing: LIFE_EASE }),
        ), -1, false));
        const nextIdleCycle = withLiveMotion(withRepeat(
          idleCycleSequence(idleCycle),
          -1,
          false,
        ));
        const nextIdleMode = idleStyle === 'joyful' ? 1 : 0;
        idleWeight.value = withLiveMotion(withTiming(0, { duration: IDLE_TRANSITION_MS, easing: LIFE_EASE }, (finished) => {
          if (finished) {
            idleTime.value = 0;
            idleMode.value = nextIdleMode;
            idleWeight.value = 1;
            idleTime.value = nextIdleCycle;
          }
        }));
      } else {
        idleWeight.value = withLiveMotion(withTiming(0, { duration: IDLE_TRANSITION_MS, easing: LIFE_EASE }, (finished) => {
          if (finished) {
            idleTime.value = 0;
          }
        }));
      }
    }
    return stopAll;
  }, [bobCenter, bobLeft, bobRight, blink, identity, idleCycle, idleMode, idleStyle, idleTime, idleWeight, layout.viewScale, live, morphCenter, morphLeft, morphRight, thinking]);

  const leftStyle = useAnimatedStyle(() => ({
    opacity: morphLeft.value,
    transform: [
      { translateX: interpolate(morphLeft.value, [0, 1], [0, -layout.splitPx]) },
      { scale: interpolate(morphLeft.value, [0, 1], [COMPANION_OUTER_REST_SCALE, COMPANION_SPHERE_SCALE]) },
    ],
  }));
  const centerStyle = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(morphCenter.value, [0, 1], [1, COMPANION_SPHERE_SCALE]) }] }));
  const rightStyle = useAnimatedStyle(() => ({
    opacity: morphRight.value,
    transform: [
      { translateX: interpolate(morphRight.value, [0, 1], [0, layout.splitPx]) },
      { scale: interpolate(morphRight.value, [0, 1], [COMPANION_OUTER_REST_SCALE, COMPANION_SPHERE_SCALE]) },
    ],
  }));
  const leftBobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bobLeft.value }] }));
  const centerBobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bobCenter.value }] }));
  const rightBobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bobRight.value }] }));
  const identityStyle = useAnimatedStyle(() => ({ opacity: identity.value }));
  const eyesStyle = useAnimatedStyle(() => {
    const idle = idleMode.value === 1 ? JOYFUL_IDLE : CALM_IDLE;
    return {
      opacity: 1 + (interpolate(idleTime.value, idle.times, idle.faceOpacity) - 1) * idleWeight.value,
      transformOrigin: [layout.stageWidth / 2, layout.headCenterY, 0],
      transform: [
        { translateX: interpolate(idleTime.value, idle.times, idle.faceX) * idleWeight.value * layout.viewScale },
        { translateY: interpolate(idleTime.value, idle.times, idle.faceY) * idleWeight.value * layout.viewScale },
        { scaleX: 1 + (interpolate(idleTime.value, idle.times, idle.faceScaleX) - 1) * idleWeight.value },
        { scaleY: interpolate(blink.value, [0, 1], [1, 0.12]) },
      ],
    };
  });
  const haloStyle = useAnimatedStyle(() => {
    const idle = idleMode.value === 1 ? JOYFUL_IDLE : CALM_IDLE;
    return {
      transformOrigin: [layout.stageWidth / 2, (HALO.cy - VIEWBOX.y - 2.4) * layout.viewScale, 0],
      transform: [
        { translateY: interpolate(idleTime.value, idle.times, idle.haloY) * idleWeight.value * layout.viewScale },
        { rotate: `${interpolate(idleTime.value, idle.times, idle.haloRotate) * idleWeight.value}deg` },
      ],
    };
  });
  const bodyStyle = useAnimatedStyle(() => {
    const idle = idleMode.value === 1 ? JOYFUL_IDLE : CALM_IDLE;
    return {
      transformOrigin: [layout.headCenterX, layout.headCenterY, 0],
      transform: [
        { translateX: interpolate(idleTime.value, idle.times, idle.bodyX) * idleWeight.value * layout.viewScale },
        { translateY: interpolate(idleTime.value, idle.times, idle.bodyY) * idleWeight.value * layout.viewScale },
        { scaleX: 1 + (interpolate(idleTime.value, idle.times, idle.bodyScaleX) - 1) * idleWeight.value },
        { scaleY: 1 + (interpolate(idleTime.value, idle.times, idle.bodyScaleY) - 1) * idleWeight.value },
      ],
    };
  });

  const sphereBox = {
    position: 'absolute' as const,
    left: layout.headCenterX - layout.sphereDiameter / 2,
    top: layout.headCenterY - layout.sphereDiameter / 2,
    width: layout.sphereDiameter,
    height: layout.sphereDiameter,
  };

  return (
    <View pointerEvents="none" style={{ width: size, height: size, overflow: 'visible' }}>
      <Animated.View style={[{ position: 'absolute', left: layout.stageLeft, top: 0, width: layout.stageWidth, height: size, overflow: 'visible' }, bodyStyle]}>
        <Animated.View style={[sphereBox, leftBobStyle]}><Animated.View style={[StyleSheet.absoluteFill, leftStyle]}><CompanionPearl diameter={layout.sphereDiameter} gradientId={`${faceId}L`} highlight={false} /></Animated.View></Animated.View>
        <Animated.View style={[sphereBox, rightBobStyle]}><Animated.View style={[StyleSheet.absoluteFill, rightStyle]}><CompanionPearl diameter={layout.sphereDiameter} gradientId={`${faceId}R`} highlight={false} /></Animated.View></Animated.View>
        <Animated.View style={[sphereBox, centerBobStyle]}><Animated.View style={[StyleSheet.absoluteFill, centerStyle]}><CompanionPearl diameter={layout.sphereDiameter} gradientId={`${faceId}C`} /></Animated.View></Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, identityStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, haloStyle]}><CompanionIdentity width={layout.stageWidth} height={size} expression={expression} gradientId={`${faceId}H`} part="halo" /></Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, eyesStyle]}><CompanionIdentity width={layout.stageWidth} height={size} expression={expression} gradientId={`${faceId}E`} part="eyes" /></Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
});
