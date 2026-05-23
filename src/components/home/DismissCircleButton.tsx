import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { XIcon } from 'phosphor-react-native';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function DismissCircleButton({
  colors,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
}: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[styles.button, style]}
    >
      <XIcon size={12} color={colors.textSubtle} weight="regular" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
