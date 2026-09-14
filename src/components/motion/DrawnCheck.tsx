import { useEffect, useRef, type MutableRefObject } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Duration, Ease } from '@/constants/animations';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

const CHECK_PATH = 'M3.2 8.2 6.6 11.6 12.8 4.4';
const CHECK_LENGTH = 16;
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface DrawnCheckProps {
  visible: boolean;
  playKey?: number;
  color: string;
  size?: number;
  testID?: string;
  playedKeyRef?: MutableRefObject<number>;
}

export function DrawnCheck({
  visible,
  playKey = 0,
  color,
  size = 14,
  testID,
  playedKeyRef,
}: DrawnCheckProps) {
  const { reducedMotion } = useAccessibleAnimation();
  const localPlayedKeyRef = useRef(0);
  const history = playedKeyRef ?? localPlayedKeyRef;
  const shouldDraw = visible && playKey > 0 && history.current !== playKey && !reducedMotion;
  const offset = useSharedValue(shouldDraw || !visible ? CHECK_LENGTH : 0);

  useEffect(() => {
    if (!visible) {
      cancelAnimation(offset);
      offset.value = CHECK_LENGTH;
      return;
    }

    if (playKey === 0 || reducedMotion) {
      offset.value = 0;
      history.current = playKey;
      return;
    }

    if (history.current === playKey) {
      offset.value = 0;
      return;
    }

    history.current = playKey;
    offset.value = CHECK_LENGTH;
    offset.value = withTiming(0, { duration: Duration.normal, easing: Ease.out });
    return () => cancelAnimation(offset);
  }, [history, offset, playKey, reducedMotion, visible]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: offset.value,
  }));

  if (!visible) return null;

  return (
    <View testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 16 16">
        <AnimatedPath
          d={CHECK_PATH}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[CHECK_LENGTH, CHECK_LENGTH]}
          animatedProps={animatedProps}
        />
      </Svg>
    </View>
  );
}
