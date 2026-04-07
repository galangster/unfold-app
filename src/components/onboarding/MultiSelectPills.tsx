import { View, Text, TouchableOpacity } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import type { ColorTheme } from '@/constants/colors';

interface PillOption {
  value: string;
  label: string;
}

interface MultiSelectPillsProps {
  options: PillOption[];
  selected: string[];
  onToggle: (value: string) => void;
  maxCount?: number;
  colors: ColorTheme;
  isDark: boolean;
}

function Pill({ option, isSelected, onPress, disabled, colors, isDark }: {
  option: PillOption;
  isSelected: boolean;
  onPress: () => void;
  disabled: boolean;
  colors: ColorTheme;
  isDark: boolean;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={disabled && !isSelected}
        onPress={() => {
          scale.value = withSpring(0.95, { damping: 20, stiffness: 300 });
          setTimeout(() => {
            scale.value = withSpring(1, { damping: 20, stiffness: 200 });
          }, 100);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        style={{
          paddingVertical: Spacing['2.5'],
          paddingHorizontal: Spacing['4'],
          borderRadius: Radius['2xl'],
          borderWidth: 1.5,
          borderColor: isSelected ? colors.accent : colors.border,
          backgroundColor: isSelected
            ? (isDark ? 'rgba(200, 165, 92, 0.15)' : 'rgba(154, 123, 60, 0.1)')
            : 'transparent',
          opacity: disabled && !isSelected ? 0.4 : 1,
        }}
      >
        <Text style={{
          fontFamily: FontFamily.uiMedium,
          fontSize: FontSize.sm,
          color: isSelected ? colors.accent : colors.text,
        }}>
          {option.label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function MultiSelectPills({ options, selected, onToggle, maxCount, colors, isDark }: MultiSelectPillsProps) {
  const atMax = maxCount ? selected.length >= maxCount : false;

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing['2'] }}>
        {options.map((option) => (
          <Pill
            key={option.value}
            option={option}
            isSelected={selected.includes(option.value)}
            onPress={() => onToggle(option.value)}
            disabled={atMax}
            colors={colors}
            isDark={isDark}
          />
        ))}
      </View>
      {maxCount && (
        <Text style={{
          fontFamily: FontFamily.ui,
          fontSize: FontSize.xs,
          color: colors.textHint,
          marginTop: Spacing['3'],
        }}>
          {selected.length} of {maxCount} selected
        </Text>
      )}
    </View>
  );
}
