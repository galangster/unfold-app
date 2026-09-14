import { StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { ReaderText as Text } from './ReaderText';
import { FontFamily, FontSize as FontSizeTokens } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';

export type ReflectionKeyboardToolbarState = {
  questionIndex: number;
  questionCount: number;
  onPrevious: () => void;
  onNext: () => void;
  onDone: () => void;
};

const navButtonStyle = {
  minWidth: 44,
  minHeight: 44,
  paddingHorizontal: Spacing['2'],
  justifyContent: 'center' as const,
};

export function ReflectionQuestionNav({
  questionIndex,
  questionCount,
  onPrevious,
  onNext,
  onDone,
}: {
  questionIndex: number;
  questionCount: number;
  onPrevious: () => void;
  onNext: () => void;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const canGoPrevious = questionIndex > 0;
  const canGoNext = questionIndex < questionCount - 1;
  const wrapActions = fontScale >= 1.3;

  return (
    <View
      testID="reflection-question-nav"
      accessible={false}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 44,
        paddingHorizontal: Spacing['1'],
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        flexWrap: wrapActions ? 'wrap' : 'nowrap',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
        <NavTextButton
          testID="reflection-nav-previous"
          label="Previous"
          accessibilityLabel="Previous question"
          disabled={!canGoPrevious}
          onPress={onPrevious}
          color={canGoPrevious ? colors.text : colors.textSubtle}
        />
        <NavTextButton
          testID="reflection-nav-next"
          label="Next"
          accessibilityLabel="Next question"
          disabled={!canGoNext}
          onPress={onNext}
          color={canGoNext ? colors.text : colors.textSubtle}
        />
      </View>
      <NavTextButton
        testID="reflection-nav-done"
        label="Done"
        accessibilityLabel="Done"
        accessibilityHint="Saves this answer and closes the keyboard."
        onPress={onDone}
        color={colors.text}
      />
    </View>
  );
}

function NavTextButton({
  testID,
  label,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  onPress,
  color,
}: {
  testID: string;
  label: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
  onPress: () => void;
  color: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={disabled ? 1 : 0.7}
      style={navButtonStyle}
    >
      <Text
        style={{
          fontFamily: FontFamily.ui,
          fontSize: FontSizeTokens.sm,
          color,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
