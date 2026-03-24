/**
 * Unfold Design System — Chip
 * Standardized chip/pill component with 3 variants and 2 sizes.
 * Uses design tokens internally. Theme-aware (dark/light/accent).
 *
 * Variants:
 *   filter     — Toggle-able filter pills (folders, theme selection)
 *   suggestion — Tappable action chips (companion prompts)
 *   reference  — Compact inline refs (scripture pills)
 */

import React, { useCallback } from 'react';
import {
  TouchableOpacity,
  TouchableOpacityProps,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { alpha, renderIcon, DISABLED_OPACITY } from './utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChipVariant = 'filter' | 'suggestion' | 'reference';
type ChipSize = 'sm' | 'md';

interface ChipProps extends Omit<TouchableOpacityProps, 'children'> {
  variant?: ChipVariant;
  size?: ChipSize;
  label: string;
  icon?: React.ReactNode;
  /** Whether the chip is in its active/selected state (filter variant) */
  selected?: boolean;
  /** Color dot indicator (e.g. folder color) */
  colorDot?: string;
  /** Numbered badge for selection order (e.g. onboarding themes) */
  badge?: number;
  onPress: () => void;
  onLongPress?: () => void;
  haptic?: boolean;
}

// ---------------------------------------------------------------------------
// Size config
// ---------------------------------------------------------------------------

const SIZE_CONFIG = {
  md: {
    height: 32,
    paddingHorizontal: Spacing['3.5'], // 14
    paddingVertical: Spacing['1.5'],   // 6
    fontSize: 13,
    iconSize: 14,
    badgeSize: 18,
    badgeFontSize: 11,
    colorDotSize: 8,
  },
  sm: {
    height: undefined, // intrinsic
    paddingHorizontal: Spacing['2'],   // 8
    paddingVertical: 3,
    fontSize: 11,
    iconSize: 11,
    badgeSize: 16,
    badgeFontSize: 10,
    colorDotSize: 6,
  },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Chip({
  variant = 'filter',
  size = 'md',
  label,
  icon,
  selected = false,
  colorDot,
  badge,
  onPress,
  onLongPress,
  haptic = true,
  disabled = false,
  style,
  ...rest
}: ChipProps) {
  const { colors } = useTheme();
  const config = SIZE_CONFIG[size];

  // --- Haptic feedback -----------------------------------------------------

  const handlePress = useCallback(() => {
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  }, [haptic, onPress]);

  // --- Variant styles ------------------------------------------------------

  const getVariantStyles = () => {
    switch (variant) {
      case 'filter':
        return {
          backgroundColor: selected ? alpha(colors.accent, 0.09) : colors.buttonBackground,
          borderWidth: 1,
          borderColor: selected ? alpha(colors.accent, 0.25) : colors.border,
          borderRadius: Radius.lg, // 16 — pill shape
        };
      case 'suggestion':
        return {
          backgroundColor: colors.inputBackground,
          borderWidth: 1,
          borderColor: alpha(colors.accent, 0.20),
          borderRadius: Radius.xl, // 20 — rounder pill
        };
      case 'reference':
        return {
          backgroundColor: alpha(colors.accent, 0.05),
          borderWidth: 0,
          borderColor: 'transparent',
          borderRadius: Radius.sm, // 6 — compact tag
        };
      default:
        return {
          backgroundColor: colors.buttonBackground,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radius.lg,
        };
    }
  };

  const getTextColor = () => {
    switch (variant) {
      case 'filter':
        return selected ? colors.accent : colors.textMuted;
      case 'suggestion':
        return colors.text;
      case 'reference':
        return colors.accent;
      default:
        return colors.text;
    }
  };

  const getFontFamily = () => {
    switch (variant) {
      case 'filter':
        return selected ? FontFamily.uiMedium : FontFamily.ui;
      case 'suggestion':
        return FontFamily.body;
      case 'reference':
        return FontFamily.uiMedium;
      default:
        return FontFamily.ui;
    }
  };

  const variantStyles = getVariantStyles();
  const textColor = getTextColor();
  const fontFamily = getFontFamily();

  // --- Icon sizing ---------------------------------------------------------

  const iconElement = renderIcon(icon, { size: config.iconSize, color: textColor });

  // --- Render --------------------------------------------------------------

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={disabled}
      onPress={handlePress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: variant === 'filter' ? selected : undefined }}
      accessibilityLabel={label}
      style={[
        styles.base,
        {
          height: config.height,
          paddingHorizontal: config.paddingHorizontal,
          paddingVertical: config.paddingVertical,
          ...variantStyles,
        },
        disabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {/* Color dot (folders) */}
      {colorDot && (
        <View
          style={[
            styles.colorDot,
            {
              width: config.colorDotSize,
              height: config.colorDotSize,
              borderRadius: config.colorDotSize / 2,
              backgroundColor: colorDot,
            },
          ]}
        />
      )}

      {/* Leading icon */}
      {iconElement && <View style={styles.iconLeft}>{iconElement}</View>}

      {/* Label */}
      <Text
        style={[
          {
            fontFamily,
            fontSize: config.fontSize,
            color: textColor,
            letterSpacing: variant === 'reference' ? 0.3 : 0,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>

      {/* Selection order badge */}
      {badge !== undefined && badge > 0 && (
        <View
          style={[
            styles.badge,
            {
              width: config.badgeSize,
              height: config.badgeSize,
              borderRadius: config.badgeSize / 2,
              backgroundColor: colors.accent,
            },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              {
                fontSize: config.badgeFontSize,
                color: colors.background,
              },
            ]}
          >
            {badge}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  disabled: {
    opacity: DISABLED_OPACITY,
  },
  colorDot: {
    marginRight: Spacing['1.5'], // 6
  },
  iconLeft: {
    marginRight: Spacing['1'], // 4
  },
  badge: {
    marginLeft: Spacing['1'], // 4
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: FontFamily.uiMedium,
  },
});
