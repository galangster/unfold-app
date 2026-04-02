import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { alpha } from '@/components/ui';
import type { ColorTheme } from '@/constants/colors';

/**
 * Identity chips the user can select to quickly describe themselves.
 * Mirrors the discovery chip design language from onboarding.tsx.
 */

export const IDENTITY_CHIPS = [
  'dad',
  'mom',
  'student',
  'entrepreneur',
  'married',
  'single',
  'pastor',
  'military',
  'creative',
  'retired',
  'caregiver',
  'young professional',
  'volunteer',
  'teacher',
  'healthcare worker',
] as const;

export type IdentityChip = (typeof IDENTITY_CHIPS)[number];

interface IdentityChipsProps {
  selectedChips: string[];
  onChipsChange: (chips: string[]) => void;
  text: string;
  onTextChange: (text: string) => void;
  colors: ColorTheme;
}

const MIN_TEXT_LENGTH = 20;

export function IdentityChips({
  selectedChips,
  onChipsChange,
  text,
  onTextChange,
  colors,
}: IdentityChipsProps) {
  const handleChipPress = (chip: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = selectedChips.includes(chip)
      ? selectedChips.filter((c) => c !== chip)
      : [...selectedChips, chip];
    onChipsChange(updated);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Identity chips */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: Spacing['2'],
          marginBottom: Spacing['4'],
        }}
      >
        {IDENTITY_CHIPS.map((chip) => {
          const isSelected = selectedChips.includes(chip);
          return (
            <TouchableOpacity
              activeOpacity={1}
              key={chip}
              onPress={() => handleChipPress(chip)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={chip}
            >
              <View
                style={{
                  paddingHorizontal: Spacing['3.5'],
                  paddingVertical: Spacing['2'],
                  borderRadius: Radius.xl,
                  backgroundColor: isSelected
                    ? alpha(colors.accent, 0.13)
                    : colors.inputBackground,
                  borderWidth: 1,
                  borderColor: isSelected
                    ? alpha(colors.accent, 0.4)
                    : colors.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: isSelected ? FontFamily.uiMedium : FontFamily.ui,
                    fontSize: FontSize.sm,
                    color: isSelected ? colors.text : colors.textMuted,
                  }}
                >
                  {chip}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Prompt text */}
      <Text
        style={{
          fontFamily: FontFamily.body,
          fontSize: FontSize.sm,
          color: colors.textMuted,
          marginBottom: Spacing['2'],
        }}
      >
        {selectedChips.length > 0
          ? 'Anything else you want to share?'
          : 'Tell us a bit about yourself'}
      </Text>

      {/* Multiline text input */}
      <View
        style={{
          backgroundColor: colors.inputBackground,
          borderRadius: Radius.xl,
          borderWidth: 1,
          borderColor: colors.border,
          padding: Spacing['5'],
          minHeight: 100,
        }}
      >
        <TextInput
          value={text}
          onChangeText={onTextChange}
          placeholder="What's on your heart right now?"
          placeholderTextColor={colors.textMuted}
          style={{
            fontFamily: FontFamily.body,
            fontSize: 17,
            color: colors.text,
            lineHeight: 26,
            textAlignVertical: 'top',
            minHeight: 60,
          }}
          multiline
          maxLength={500}
        />
      </View>

      {/* Character count hint */}
      {text.length > 0 && text.length < MIN_TEXT_LENGTH && (
        <Text
          style={{
            fontFamily: FontFamily.body,
            fontSize: 13,
            color: colors.textMuted,
            marginTop: Spacing['2.5'],
            opacity: 0.7,
          }}
        >
          Keep going -- the more you share, the more personal your experience.
        </Text>
      )}
    </View>
  );
}
