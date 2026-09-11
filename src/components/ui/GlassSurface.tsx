import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/lib/theme';
import { Radius } from '@/constants/radius';
import { GLASS } from '@/constants/today-surfaces';
import { alpha } from './utils';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  testID?: string;
  blurTestID?: string;
} & Omit<ViewProps, 'style' | 'children' | 'testID'>;

export function GlassSurface({
  children,
  style,
  radius = Radius.xl,
  testID,
  blurTestID = 'glass-surface-blur',
  ...rest
}: Props) {
  const { colors, isDark } = useTheme();
  const mode = isDark ? 'dark' : 'light';
  const isIOS = Platform.OS === 'ios';

  return (
    <View
      testID={testID}
      {...rest}
      style={[
        {
          borderRadius: radius,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: alpha(colors.text, GLASS.borderAlpha[mode]),
          backgroundColor: alpha(
            colors.backgroundElevated,
            isIOS ? GLASS.tintAlpha[mode] : GLASS.androidTintAlpha,
          ),
        },
        style,
      ]}
    >
      {isIOS ? (
        <BlurView
          pointerEvents="none"
          intensity={GLASS.blurIntensity[mode]}
          tint={mode}
          style={StyleSheet.absoluteFill}
          testID={blurTestID}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: alpha('#FFFFFF', GLASS.highlightAlpha[mode]),
        }}
      />
      {children}
    </View>
  );
}
