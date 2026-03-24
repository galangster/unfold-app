/**
 * Unfold Design System — Card
 * Standardized card container with 4 variants.
 * Uses design tokens internally. Theme-aware (dark/light/accent).
 *
 * Variants:
 *   default  — Elevated surface with border and subtle shadow (notes, series)
 *   subtle   — Muted background with border, no shadow (streak, highlights)
 *   accent   — Accent-tinted background and border (premium nudges, prompts)
 *   elevated — Strong shadow, no border (floating overlays, toasts)
 */

import React from 'react';
import {
  View,
  ViewProps,
  TouchableOpacity,
  TouchableOpacityProps,
  StyleSheet,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { Spacing } from '@/constants/spacing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CardVariant = 'default' | 'subtle' | 'accent' | 'elevated';

interface CardProps extends Omit<ViewProps, 'children'> {
  variant?: CardVariant;
  /** Inner padding — number or Spacing token value. Default: 16 */
  padding?: number;
  /** When set, card becomes pressable with haptic feedback */
  onPress?: () => void;
  onLongPress?: () => void;
  /** Disable haptic on press */
  haptic?: boolean;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Shadow presets (platform-aware)
// ---------------------------------------------------------------------------

const SHADOW_SM = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  android: { elevation: 2 },
  default: {},
});

const SHADOW_LG = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  android: { elevation: 6 },
  default: {},
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Card({
  variant = 'default',
  padding = Spacing[4], // 16
  onPress,
  onLongPress,
  haptic = true,
  children,
  style,
  ...rest
}: CardProps) {
  const { colors } = useTheme();

  const getVariantStyles = () => {
    switch (variant) {
      case 'default':
        return {
          backgroundColor: colors.backgroundElevated,
          borderWidth: 1,
          borderColor: colors.border,
          ...SHADOW_SM,
        };
      case 'subtle':
        return {
          backgroundColor: colors.inputBackground,
          borderWidth: 1,
          borderColor: colors.border,
        };
      case 'accent':
        return {
          backgroundColor: colors.accent + '14',
          borderWidth: 1,
          borderColor: colors.accent + '30',
        };
      case 'elevated':
        return {
          backgroundColor: colors.backgroundElevated,
          borderWidth: 0,
          borderColor: 'transparent',
          ...SHADOW_LG,
        };
      default:
        return {
          backgroundColor: colors.backgroundElevated,
          borderWidth: 1,
          borderColor: colors.border,
          ...SHADOW_SM,
        };
    }
  };

  const variantStyles = getVariantStyles();
  const cardStyle = [
    styles.base,
    { padding, ...variantStyles },
    style,
  ];

  if (onPress || onLongPress) {
    const handlePress = () => {
      if (haptic) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onPress?.();
    };

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress ? handlePress : undefined}
        onLongPress={onLongPress}
        style={cardStyle}
        {...(rest as TouchableOpacityProps)}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={cardStyle} {...rest}>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    overflow: 'hidden',
  },
});
