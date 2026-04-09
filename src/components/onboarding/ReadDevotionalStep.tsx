/**
 * ReadDevotionalStep — Inline reading experience during onboarding.
 *
 * Shows the actual generated devotional content using DevotionalContent,
 * with a fixed "Mark as complete" button at the bottom. On mount, creates
 * the Devotional shell in the Zustand store so it persists after onboarding.
 */

import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
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
}

export function ReadDevotionalStep({ devotionalDay, devotionalId, colors, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const addDevotional = useUnfoldStore((s) => s.addDevotional);
  const markDayAsRead = useUnfoldStore((s) => s.markDayAsRead);

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

  const handleComplete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    markDayAsRead(devotionalId, 1);
    onComplete();
  };

  // Loading state while devotional is being generated
  if (!devotionalDay) {
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
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <DevotionalContent
          day={devotionalDay}
          fontSize="medium"
          devotionalId={devotionalId}
        />
      </ScrollView>

      {/* Fixed bottom button with gradient fade */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, Spacing['4']) },
        ]}
        pointerEvents="box-none"
      >
        <LinearGradient
          colors={['rgba(10,10,10,0)', 'rgba(10,10,10,0.85)', 'rgba(10,10,10,1)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.buttonWrapper}>
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
      </View>
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
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 120,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['10'],
  },
  buttonWrapper: {
    position: 'relative',
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
