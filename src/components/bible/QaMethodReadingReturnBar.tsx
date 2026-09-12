import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import {
  clearQaMethodReadingReturn,
  useQaMethodReadingReturn,
} from '@/lib/qa-method-reading-return';
import { qaMethodReadingsHref } from '@/lib/qa-method-readings-route';
import { useTheme } from '@/lib/theme';

export function buildQaMethodReadingReturnNavigation(methodId: string) {
  return qaMethodReadingsHref(methodId);
}

export function QaMethodReadingReturnBar() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const context = useQaMethodReadingReturn();

  if (!context) return null;

  const handleContinue = () => {
    const navigation = buildQaMethodReadingReturnNavigation(context.methodId);
    clearQaMethodReadingReturn();
    router.navigate(navigation);
  };

  const handleClose = () => {
    clearQaMethodReadingReturn();
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.overlay,
        { bottom: Math.max(insets.bottom, 8) + 56 + Spacing['2'] },
      ]}
    >
      <View
        testID="qa-method-reading-return-bar"
        style={[
          styles.bar,
          {
            backgroundColor: colors.backgroundElevated,
            borderColor: colors.borderStrong,
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleContinue}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Return to sample. Opens the sample reading."
          testID="qa-method-reading-return-continue"
          style={[styles.continue, { backgroundColor: colors.accent }]}
        >
          <Text style={[styles.continueLabel, { color: colors.background }]}>
            Return to sample
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleClose}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Dismiss return to sample"
          testID="qa-method-reading-return-close"
          style={styles.close}
        >
          <XIcon size={18} color={colors.text} weight="light" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing['4'],
  },
  bar: {
    minHeight: 44,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    padding: Spacing['2'],
  },
  continue: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['2'],
  },
  continueLabel: {
    ...Typography.uiLg,
    fontFamily: FontFamily.uiSemiBold,
    textAlign: 'center',
    flexShrink: 1,
  },
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
