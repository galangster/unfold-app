/**
 * Unfold Design System — Input
 * Standardized text input with consistent styling across the app.
 * Uses design tokens internally. Theme-aware (dark/light/accent).
 *
 * Features:
 *   - Optional label above input
 *   - Leading/trailing icon slots
 *   - Focus state border highlight
 *   - Error state with message
 *   - Multiline support with auto-grow
 *   - Character counter
 */

import React, { useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { XCircleIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Typography } from '@/constants/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InputProps extends Omit<TextInputProps, 'style'> {
  /** Label displayed above the input */
  label?: string;
  /** Leading icon (rendered inside the input, left side) */
  icon?: React.ReactNode;
  /** Show a clear button when input has text */
  clearable?: boolean;
  /** Error message displayed below the input */
  error?: string;
  /** Show character count when maxLength is set */
  showCount?: boolean;
  /** Override input container style */
  style?: TextInputProps['style'];
  /** Override outer wrapper style */
  wrapperStyle?: View['props']['style'];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    icon,
    clearable = false,
    error,
    showCount = false,
    value,
    onChangeText,
    placeholder,
    multiline = false,
    maxLength,
    style,
    wrapperStyle,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  useImperativeHandle(ref, () => inputRef.current as TextInput);

  const handleFocus = useCallback(
    (e: any) => {
      setFocused(true);
      onFocus?.(e);
    },
    [onFocus],
  );

  const handleBlur = useCallback(
    (e: any) => {
      setFocused(false);
      onBlur?.(e);
    },
    [onBlur],
  );

  const handleClear = useCallback(() => {
    onChangeText?.('');
    inputRef.current?.focus();
  }, [onChangeText]);

  // --- Border color logic --------------------------------------------------

  const getBorderColor = () => {
    if (error) return colors.error;
    if (focused) return colors.accent + '40';
    return colors.border;
  };

  // --- Icon sizing ---------------------------------------------------------

  const iconElement = icon
    ? React.isValidElement(icon)
      ? React.cloneElement(icon as React.ReactElement<any>, {
          size: 18,
          color: focused ? colors.accent : colors.textMuted,
          weight: 'light',
        })
      : icon
    : null;

  const showClear = clearable && value && value.length > 0;
  const charCount = value?.length ?? 0;

  return (
    <View style={wrapperStyle}>
      {/* Label */}
      {label && (
        <Text
          style={[
            Typography.label,
            { color: error ? colors.error : colors.textMuted, marginBottom: Spacing[2] },
          ]}
        >
          {label}
        </Text>
      )}

      {/* Input container */}
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.inputBackground,
            borderColor: getBorderColor(),
            minHeight: multiline ? 80 : undefined,
          },
          multiline && styles.multilineContainer,
        ]}
      >
        {/* Leading icon */}
        {iconElement && <View style={styles.iconLeft}>{iconElement}</View>}

        {/* TextInput */}
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            {
              color: colors.text,
              fontFamily: multiline ? FontFamily.body : FontFamily.ui,
            },
            multiline && styles.multilineInput,
            style,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textHint}
          multiline={multiline}
          maxLength={maxLength}
          onFocus={handleFocus}
          onBlur={handleBlur}
          textAlignVertical={multiline ? 'top' : 'center'}
          {...rest}
        />

        {/* Clear button */}
        {showClear && (
          <TouchableOpacity
            onPress={handleClear}
            style={styles.clearButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <XCircleIcon size={18} weight="fill" color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Footer row: error message + character count */}
      {(error || (showCount && maxLength)) && (
        <View style={styles.footer}>
          {error ? (
            <Text style={[Typography.caption, { color: colors.error }]}>{error}</Text>
          ) : (
            <View />
          )}
          {showCount && maxLength && (
            <Text
              style={[
                Typography.caption,
                { color: charCount >= maxLength ? colors.error : colors.textHint },
              ]}
            >
              {charCount}/{maxLength}
            </Text>
          )}
        </View>
      )}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md, // 12
    paddingHorizontal: Spacing[4], // 16
    paddingVertical: Spacing['3.5'], // 14
  },
  multilineContainer: {
    alignItems: 'flex-start',
  },
  input: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  multilineInput: {
    lineHeight: 24,
  },
  iconLeft: {
    marginRight: Spacing[2], // 8
  },
  clearButton: {
    marginLeft: Spacing[2], // 8
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing['1'], // 4
    paddingHorizontal: Spacing['0.5'], // 2
  },
});
