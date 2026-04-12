import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAutoHide } from '@/hooks/useAutoHide';
import Animated, { SlideInDown, SlideOutDown, useReducedMotion } from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import { FontFamily, FontSize } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';

interface UndoToastProps {
  visible: boolean;
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number;
}

export function UndoToast({
  visible,
  message,
  onUndo,
  onDismiss,
  duration = 3000,
}: UndoToastProps) {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();

  useAutoHide(visible, duration, onDismiss);

  if (!visible) return null;

  return (
    <Animated.View
      entering={reducedMotion ? undefined : SlideInDown.duration(Duration.slow).easing(Ease.out)}
      exiting={reducedMotion ? undefined : SlideOutDown.duration(Duration.fast).easing(Ease.out)}
      style={[
        styles.container,
        {
          backgroundColor: isDark
            ? 'rgba(30, 30, 30, 0.95)'
            : 'rgba(255, 255, 255, 0.97)',
          borderWidth: isDark ? 0 : StyleSheet.hairlineWidth,
          borderColor: isDark ? 'transparent' : colors.border,
          shadowColor: '#000',
        },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.message, { color: isDark ? '#FFFFFF' : colors.text }]} numberOfLines={1}>
        {message}
      </Text>
      <TouchableOpacity
        onPress={onUndo}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Undo"
      >
        <Text style={[styles.undoText, { color: colors.accent }]}>Undo</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 24,
    right: 24,
    borderRadius: Radius.card,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 200,
  },
  message: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
    flex: 1,
    marginRight: Spacing['4'],
  },
  undoText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
});
