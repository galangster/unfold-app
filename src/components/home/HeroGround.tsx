import React, { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui/utils/alpha';
import { HERO_GROUND } from '@/constants/today-surfaces';

const MASK_COLORS = ['transparent', 'black', 'black', 'transparent'] as const;
const GROUND_LOCATIONS = [0, HERO_GROUND.midStop, HERO_GROUND.endStop] as const;

type Props = {
  children: React.ReactNode;
  active: boolean;
  style?: StyleProp<ViewStyle>;
};

export function HeroGround({ children, active, style }: Props) {
  const { colors } = useTheme();
  const [boxHeight, setBoxHeight] = useState(0);
  const bg = colors.background;
  const groundColors = useMemo(() => [
    alpha(bg, HERO_GROUND.leftAlpha),
    alpha(bg, HERO_GROUND.midAlpha),
    alpha(bg, 0),
  ] as const, [bg]);

  if (!active) {
    return style ? <View style={style}>{children}</View> : <>{children}</>;
  }

  const totalHeight = boxHeight + HERO_GROUND.featherTop + HERO_GROUND.featherBottom;
  const topStop = totalHeight > 0 ? HERO_GROUND.featherTop / totalHeight : 0;
  const bottomStop = totalHeight > 0 ? 1 - HERO_GROUND.featherBottom / totalHeight : 1;

  const handleLayout = (event: LayoutChangeEvent) => {
    setBoxHeight(event.nativeEvent.layout.height);
  };

  return (
    <View style={[{ position: 'relative', alignSelf: 'stretch' }, style]} onLayout={handleLayout}>
      <MaskedView
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -HERO_GROUND.featherTop,
          bottom: -HERO_GROUND.featherBottom,
          left: 0,
          right: 0,
        }}
        maskElement={
          <LinearGradient
            pointerEvents="none"
            colors={MASK_COLORS}
            locations={[0, topStop, bottomStop, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        <LinearGradient
          pointerEvents="none"
          testID="hero-ground"
          colors={groundColors}
          locations={GROUND_LOCATIONS}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </MaskedView>
      {children}
    </View>
  );
}
