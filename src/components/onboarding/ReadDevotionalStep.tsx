/**
 * ReadDevotionalStep — Inline reading experience during onboarding.
 *
 * Shows the actual generated devotional content using DevotionalContent,
 * with a fixed "Mark as complete" button at the bottom. On mount, creates
 * the Devotional shell in the Zustand store so it persists after onboarding.
 */

import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// LinearGradient removed — button is now inline, not fixed with gradient
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { DevotionalContent } from '@/components/reading/DevotionalContent';
import { useUnfoldStore } from '@/lib/store';
import type { ColorTheme } from '@/constants/colors';
import type { Devotional } from '@/lib/store';

interface Props {
  devotionalDay: any | null;
  devotionalId: string;
  colors: ColorTheme;
  onComplete: () => void;
  onRetry?: () => void;
}

const READINESS_RECOVERY_DELAY_MS = 12_000;

export function ReadDevotionalStep({
  devotionalDay,
  devotionalId,
  colors,
  onComplete,
  onRetry,
}: Props) {
  const insets = useSafeAreaInsets();
  const addDevotional = useUnfoldStore((s) => s.addDevotional);
  const markDayAsRead = useUnfoldStore((s) => s.markDayAsRead);
  const [showRecovery, setShowRecovery] = useState(false);

  // On mount, add the devotional to the store if not already present
  useEffect(() => {
    if (!devotionalDay || !devotionalId) return;
    addDevotional({
      id: devotionalId,
      title: 'Your First Devotional',
      totalDays: 1,
      currentDay: 1,
      days: [{ ...devotionalDay, dayNumber: 1, isRead: false }],
      createdAt: new Date().toISOString(),
      generationMode: 'progressive',
    } as Devotional);
  }, [devotionalDay, devotionalId]);

  useEffect(() => {
    if (devotionalDay) {
      setShowRecovery(false);
      return;
    }

    const timer = setTimeout(() => setShowRecovery(true), READINESS_RECOVERY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [devotionalDay]);

  const handleComplete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    markDayAsRead(devotionalId, 1);
    onComplete();
  };

  // Loading state while devotional is being generated
  if (!devotionalDay) {
    if (showRecovery) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={[styles.recoveryTitle, { color: colors.text }]}>
            Still preparing your reading.
          </Text>
          <Text style={[styles.recoveryText, { color: colors.textMuted }]}>
            This should only take a moment. Try again so we can reconnect the
            devotional instead of leaving you on a spinner.
          </Text>
          {onRetry && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onRetry();
              }}
              style={[styles.button, styles.retryButton, { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.buttonText, { color: colors.background }]}>Try again</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          Preparing your reading...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + Spacing['8'], 40) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Devotional content with horizontal padding */}
        <View style={{ paddingHorizontal: Spacing['6'] }}>
          <DevotionalContent
            day={devotionalDay}
            fontSize="medium"
            devotionalId={devotionalId}
          />
        </View>

        {/* Complete button — inline at end of content, not fixed */}
        <View style={{ paddingHorizontal: Spacing['6'], marginTop: Spacing['8'] }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleComplete}
            style={[styles.button, { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.buttonText, { color: colors.background }]}>
              I've finished reading
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing['4'],
  },
  loadingText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    marginTop: Spacing['3'],
  },
  recoveryTitle: {
    fontFamily: FontFamily.display,
    fontSize: 30,
    lineHeight: 38,
    textAlign: 'center',
  },
  recoveryText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    lineHeight: 24,
    maxWidth: 320,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing['4'],
    minWidth: 180,
    paddingHorizontal: Spacing['6'],
  },
  scrollContent: {
    flexGrow: 1,
  },
  button: {
    paddingVertical: Spacing['4'],
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.base,
    letterSpacing: 0.3,
  },
});
