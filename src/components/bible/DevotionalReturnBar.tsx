import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import { resolveStackRoute } from '@/lib/tab-stack-routes';
import { isScripturePracticeEnabled } from '@/lib/scripture-practice-feature';
import {
  resolvePracticeReturn,
  type PracticeReturn,
} from '@/lib/scripture-practice';
import { useUnfoldStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';

export function buildPracticeReturnNavigation(context: PracticeReturn): {
  pathname: string;
  params: Record<string, string>;
} {
  const params: Record<string, string> = {
    devotionalId: context.target.devotionalId,
    dayNumber: String(context.target.dayNumber),
  };
  if (context.destination === 'practice') {
    params.practice = '1';
    params.practiceMethod = context.target.methodId;
  }
  return {
    pathname: resolveStackRoute(context.target.hostTab, 'reading'),
    params,
  };
}

export function DevotionalReturnBar() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const stored = useUnfoldStore((s) => s.scripturePracticeReturn);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);
  const setScripturePracticeReturn = useUnfoldStore((s) => s.setScripturePracticeReturn);

  if (!isScripturePracticeEnabled()) return null;

  const context = resolvePracticeReturn(stored, devotionals, currentDevotionalId);
  if (!context) return null;

  const label = context.destination === 'practice'
    ? 'Return to your practice'
    : 'Return to your devotional';

  const handleContinue = () => {
    const navigation = buildPracticeReturnNavigation(context);
    setScripturePracticeReturn(null);
    router.navigate(navigation);
  };

  const handleClose = () => {
    setScripturePracticeReturn(null);
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.overlay, { bottom: Math.max(insets.bottom, 8) + 56 + Spacing['2'] }]}
    >
      <View
        testID="devotional-return-bar"
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
          accessibilityLabel={`${label}. Returns to the ${context.target.hostTab === '(study)' ? 'Devotional' : 'Today'} reader.`}
          testID="devotional-return-continue"
          style={[styles.continue, { backgroundColor: colors.accent }]}
        >
          <Text style={[styles.continueLabel, { color: colors.background }]}>{label}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleClose}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Dismiss return to reading"
          testID="devotional-return-close"
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
  },
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
