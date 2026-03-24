/**
 * Unfold Design System — Button
 * Standardized button component with 5 variants and 3 sizes.
 * Uses design tokens internally. Theme-aware (dark/light/accent).
 */

import React, { useCallback } from 'react';
import {
  TouchableOpacity,
  TouchableOpacityProps,
  Text,
  View,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Typography } from '@/constants/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'icon';
type ButtonSize = 'lg' | 'md' | 'sm';

interface ButtonProps extends Omit<TouchableOpacityProps, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  fullWidth?: boolean;
  haptic?: boolean;
  destructiveStyle?: 'filled' | 'ghost';
}

// ---------------------------------------------------------------------------
// Size config
// ---------------------------------------------------------------------------

const SIZE_CONFIG = {
  lg: {
    height: 52,
    paddingHorizontal: Spacing[6], // 24
    iconSize: 20,
    radius: Radius.lg, // 16
    typography: Typography.uiLg,
  },
  md: {
    height: 44,
    paddingHorizontal: Spacing[4], // 16
    iconSize: 18,
    radius: Radius.md, // 12
    typography: Typography.uiMd,
  },
  sm: {
    height: 32,
    paddingHorizontal: Spacing[3], // 12
    iconSize: 14,
    radius: Radius.sm, // 8
    typography: Typography.uiSm,
  },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Button({
  variant = 'primary',
  size = 'md',
  label,
  icon,
  iconPosition = 'left',
  loading = false,
  fullWidth = false,
  haptic = true,
  destructiveStyle = 'filled',
  disabled = false,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const { colors, isDark } = useTheme();
  const sizeConfig = SIZE_CONFIG[size];

  // Dev warning for icon variant without accessibility
  if (__DEV__ && variant === 'icon' && !label && !rest.accessibilityLabel) {
    console.warn(
      '[Button] Icon variant without label or accessibilityLabel is inaccessible.'
    );
  }

  // --- Variant styles ---------------------------------------------------

  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: colors.accent,
          borderWidth: 0,
          borderColor: 'transparent',
        };
      case 'secondary':
        return {
          backgroundColor: colors.buttonBackground,
          borderWidth: 1,
          borderColor: colors.border,
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          borderWidth: 0,
          borderColor: 'transparent',
        };
      case 'destructive':
        if (destructiveStyle === 'ghost') {
          return {
            backgroundColor: 'transparent',
            borderWidth: 0,
            borderColor: 'transparent',
          };
        }
        return {
          backgroundColor: colors.error,
          borderWidth: 0,
          borderColor: 'transparent',
        };
      case 'icon':
        return {
          backgroundColor: colors.buttonBackground,
          borderWidth: 0,
          borderColor: 'transparent',
        };
      default:
        return {
          backgroundColor: colors.accent,
          borderWidth: 0,
          borderColor: 'transparent',
        };
    }
  };

  const getTextColor = () => {
    switch (variant) {
      case 'primary':
        // White text on accent — works for both dark/light since accent is mid-tone
        return '#FFFFFF';
      case 'secondary':
        return colors.text;
      case 'ghost':
        return colors.accent;
      case 'destructive':
        if (destructiveStyle === 'ghost') return colors.error;
        return '#FFFFFF';
      case 'icon':
        return colors.text;
      default:
        return '#FFFFFF';
    }
  };

  const variantStyles = getVariantStyles();
  const textColor = getTextColor();

  // --- Haptic feedback ---------------------------------------------------

  const handlePress = useCallback(
    (e: any) => {
      if (haptic) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onPress?.(e);
    },
    [haptic, onPress]
  );

  // --- Icon sizing -------------------------------------------------------

  const iconElement = icon
    ? React.isValidElement(icon)
      ? React.cloneElement(icon as React.ReactElement<any>, {
          size: sizeConfig.iconSize,
          color: textColor,
        })
      : icon
    : null;

  // --- Render ------------------------------------------------------------

  const isIconOnly = variant === 'icon';
  const iconOnlySize = {
    lg: 52,
    md: 44,
    sm: 32,
  }[size];

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={disabled || loading}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      accessibilityLabel={label || rest.accessibilityLabel}
      style={[
        styles.base,
        {
          height: sizeConfig.height,
          borderRadius: isIconOnly ? sizeConfig.height / 2 : sizeConfig.radius,
          paddingHorizontal: isIconOnly ? 0 : sizeConfig.paddingHorizontal,
          width: isIconOnly ? iconOnlySize : undefined,
          ...variantStyles,
        },
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      <View style={styles.content}>
        {/* Left icon */}
        {iconElement && iconPosition === 'left' && !isIconOnly && (
          <View style={styles.iconLeft}>{iconElement}</View>
        )}

        {/* Icon-only center */}
        {isIconOnly && iconElement}

        {/* Loading indicator */}
        {loading && (
          <ActivityIndicator
            size="small"
            color={textColor}
          />
        )}

        {/* Label */}
        {label && !loading && !isIconOnly && (
          <Text
            style={[
              sizeConfig.typography,
              { color: textColor },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        )}

        {/* Right icon */}
        {iconElement && iconPosition === 'right' && !isIconOnly && (
          <View style={styles.iconRight}>{iconElement}</View>
        )}
      </View>
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
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.4,
  },
  iconLeft: {
    marginRight: Spacing[2], // 8px
  },
  iconRight: {
    marginLeft: Spacing[2], // 8px
  },
});
