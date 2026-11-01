import { useEffect } from 'react';
import { AccessibilityInfo, Linking, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Duration, Ease } from '@/constants/animations';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { CRISIS_LINKS } from '@/lib/crisis-words';
import { logger } from '@/lib/logger';
import { useTheme } from '@/lib/theme';

function open(url: string) {
  Linking.openURL(url).catch((err) => logger.warn('[CrisisResourcesCard] Could not open link', err));
}

/**
 * Shown under the journal while the reader's writing names suicide,
 * self-harm or abuse. It never blocks writing or saving.
 */
export function CrisisResourcesCard({ abuse }: { abuse: boolean }) {
  const { colors } = useTheme();
  const { reducedMotion } = useAccessibleAnimation();

  // The card mounts below the input the reader is typing in, out of focus,
  // so a screen reader would never reach it on its own.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      'Help is below. You can call or text 988, or text HOME to 741741.',
    );
  }, []);

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
      style={styles.wrapper}
      testID="journal-crisis-card"
    >
      <Card variant="subtle" padding={Spacing['5']}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          You don't have to carry this alone.
        </Text>
        <View style={styles.actions}>
          <Button
            variant="secondary"
            fullWidth
            label="Call or text 988"
            accessibilityHint="Calls the Suicide and Crisis Lifeline"
            onPress={() => open(CRISIS_LINKS.call988)}
          />
          <Button
            variant="secondary"
            fullWidth
            label="Text HOME to 741741"
            accessibilityHint="Opens a message to the Crisis Text Line"
            onPress={() => open(CRISIS_LINKS.text741741)}
          />
          {abuse && (
            <Button
              variant="secondary"
              fullWidth
              label="Call 1-800-799-7233"
              accessibilityHint="Calls the National Domestic Violence Hotline"
              onPress={() => open(CRISIS_LINKS.callAbuseHotline)}
            />
          )}
        </View>
        <Text style={[styles.note, { color: colors.textMuted }]}>Free, 24/7, confidential.</Text>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: Spacing['8'],
  },
  title: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.base,
    lineHeight: FontSize.base * 1.4,
  },
  actions: {
    gap: Spacing['2'],
    marginTop: Spacing['4'],
  },
  note: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
    marginTop: Spacing['3'],
  },
});
