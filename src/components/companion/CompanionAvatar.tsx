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

function joyfulTurnSequence() {
  const ease = Easing.inOut(Easing.ease);
  return withSequence(
    withTiming(0, { duration: 0 }),
    withDelay(9600, withTiming(0.08, { duration: 190, easing: ease })),
    withTiming(0.28, { duration: 480, easing: ease }),
    withTiming(0.52, { duration: 575, easing: ease }),
    withTiming(0.7, { duration: 430, easing: ease }),
    withTiming(1, { duration: 725, easing: ease }),
  );
}

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
  const glance = useSharedValue(0);
  const joy = useSharedValue(0);
  const joyWeight = useSharedValue(0);

  useEffect(() => {
    const morphValues = [morphLeft, morphCenter, morphRight];
    const motionValues = [bobLeft, bobCenter, bobRight, blink, glance, joy, joyWeight];
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
      glance.value = withLiveMotion(withTiming(0, { duration: 240, easing: LIFE_EASE }));
      joyWeight.value = withLiveMotion(withTiming(0, { duration: 420, easing: LIFE_EASE }, (finished) => {
        if (finished) joy.value = 0;
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
        glance.value = withLiveMotion(withRepeat(withSequence(
          withTiming(0, { duration: 240, easing: LIFE_EASE }),
          withDelay(idleStyle === 'joyful' ? 1700 : 4200, withTiming(1, { duration: 620, easing: LIFE_EASE })),
          withDelay(1050, withTiming(0, { duration: 620, easing: LIFE_EASE })),
          withDelay(2400, withTiming(-1, { duration: 680, easing: LIFE_EASE })),
          withDelay(850, withTiming(0, { duration: 680, easing: LIFE_EASE })),
        ), -1, false));
      }
      if (idleStyle === 'joyful') {
        joy.value = 0;
        joyWeight.value = 1;
        joy.value = withLiveMotion(withRepeat(joyfulTurnSequence(), -1, false));
      } else {
        joy.value = 0;
        joyWeight.value = 0;
      }
    }
    return stopAll;
  }, [bobCenter, bobLeft, bobRight, blink, glance, identity, idleStyle, joy, joyWeight, layout.viewScale, live, morphCenter, morphLeft, morphRight, thinking]);

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
  const eyesStyle = useAnimatedStyle(() => ({
    opacity: 1 + (interpolate(joy.value, [0, 0.42, 0.48, 0.58, 0.64, 1], [1, 1, 0, 0, 1, 1]) - 1) * joyWeight.value,
    transformOrigin: [layout.stageWidth / 2, layout.headCenterY, 0],
    transform: [
      { translateX: (interpolate(joy.value, [0, 0.12, 0.38, 0.48, 0.58, 0.76, 1], [0, -2.2, 11, 20, -20, -9, 0]) * joyWeight.value + glance.value * (idleStyle === 'joyful' ? -1.1 : -0.7)) * layout.viewScale },
      { scaleX: 1 + (interpolate(joy.value, [0, 0.38, 0.48, 0.58, 0.76, 1], [1, 0.7, 0.08, 0.08, 0.8, 1]) - 1) * joyWeight.value },
      { scaleY: interpolate(blink.value, [0, 1], [1, 0.12]) },
    ],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    transformOrigin: [layout.stageWidth / 2, (HALO.cy - VIEWBOX.y - 2.4) * layout.viewScale, 0],
    transform: [
      { translateX: glance.value * -0.25 * layout.viewScale },
      { translateY: interpolate(joy.value, [0, 0.4, 0.55, 0.75, 1], [0, -0.8, 0.3, 0, 0]) * joyWeight.value * layout.viewScale },
      { rotate: `${interpolate(joy.value, [0, 0.2, 0.45, 0.7, 1], [0, -5, 6, -2, 0]) * joyWeight.value}deg` },
    ],
  }));
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(joy.value, [0, 0.08, 0.28, 0.52, 0.7, 1], [0, 0.8, -6.5, 0.7, -0.45, 0]) * joyWeight.value * layout.viewScale },
    ],
  }));

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
