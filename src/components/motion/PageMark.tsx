import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Duration, Ease } from '@/constants/animations';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

const PAGE_SHEET = 'M5 4h13.2L23 8.8V32H5V4Z';
const PAGE_FOLD = 'M18.2 4V8.8H23';
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface PageMarkProps {
  color: string;
  filled: boolean;
  animate: boolean;
  testID?: string;
}

export function PageMark({
  color,
  filled,
  animate,
  testID = 'reading-page-mark',
}: PageMarkProps) {
  const { reducedMotion } = useAccessibleAnimation();
  const ink = useSharedValue(filled && (!animate || reducedMotion) ? 0.22 : 0);

  useEffect(() => {
    if (!filled) {
      ink.value = 0;
      return;
    }
    if (!animate || reducedMotion) {
      ink.value = 0.22;
      return;
    }
    ink.value = 0;
    ink.value = withTiming(0.22, { duration: Duration.normal, easing: Ease.out });
  }, [animate, filled, ink, reducedMotion]);

  const inkProps = useAnimatedProps(() => ({
    opacity: ink.value,
  }));

  return (
    <View testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={22} height={28} viewBox="0 0 28 36">
        <AnimatedPath d={PAGE_SHEET} fill={color} animatedProps={inkProps} />
        <Path d={PAGE_SHEET} fill="none" stroke={color} strokeWidth={1.25} strokeLinejoin="round" />
        <Path d={PAGE_FOLD} fill="none" stroke={color} strokeWidth={1.25} strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
