/**
 * Recommendation card shown when user has no active series.
 * Fetches a personalized recommendation from the backend and displays
 * theme, reason text, and quick-start CTA.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { alpha } from '@/components/ui';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { useUnfoldStore } from '@/lib/store';
import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { getQaTodayProfileMarker } from '@/lib/qa-today-marker';

interface Recommendation {
  theme: string;
  themeName: string;
  type: string;
  subject?: string;
  reason: string;
  suggestedLength: 7 | 14;
}

interface RecommendedSeriesCardProps {
  /** "completion" renders inside journey-complete, "empty" renders standalone */
  variant: 'completion' | 'empty';
  onChooseOther: () => void;
  completedSeriesTitle?: string;
  /** Optional fallback rendered when the recommendation fetch fails */
  renderFallback?: () => ReactNode;
}

function formatRecommendationType(type: string) {
  return type
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const QA_TODAY_PROFILE_MARKER = getQaTodayProfileMarker();

const QA_TODAY_RECOMMENDATION: Recommendation = {
  theme: 'discernment',
  themeName: 'A Quiet Strength',
  type: 'theme',
  reason:
    'Because this season is asking for patience without passivity — a study on waiting, courage, and hearing God clearly.',
  suggestedLength: 7,
};

export function RecommendedSeriesCard({
  variant,
  onChooseOther,
  completedSeriesTitle,
  renderFallback,
}: RecommendedSeriesCardProps) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();
  const router = useRouter();
  const user = useUnfoldStore((s) => s.user);
  const updateUser = useUnfoldStore((s) => s.updateUser);

  const qaRecommendation = useMemo(() => (
    isQaToolsEnabled() && user?.aboutMe === QA_TODAY_PROFILE_MARKER
      ? QA_TODAY_RECOMMENDATION
      : null
  ), [user?.aboutMe]);

  const [recommendation, setRecommendation] = useState<Recommendation | null>(qaRecommendation);
  const [loading, setLoading] = useState(!qaRecommendation);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (qaRecommendation) {
      setRecommendation(qaRecommendation);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;

    async function fetchRecommendation() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${PRIMARY_BACKEND_URL}/api/recommendations/next-series`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Recommendation = await res.json();
        if (!cancelled) {
          setRecommendation(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    fetchRecommendation();
    return () => { cancelled = true; };
  }, [qaRecommendation]);

  const handleStartStudy = () => {
    if (!recommendation) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateUser({
      selectedTheme: recommendation.theme as any,
      selectedType: recommendation.type as any,
      selectedStudySubject: recommendation.subject,
      devotionalLength: recommendation.suggestedLength as any,
    });
    router.push('/generating');
  };

  if (error || (!loading && !recommendation)) {
    return renderFallback ? <>{renderFallback()}</> : null;
  }

  const isCompletion = variant === 'completion';
  const eyebrow = isCompletion ? 'Up next' : 'Recommended for you';
  const introCopy = isCompletion
    ? `${completedSeriesTitle ?? 'This series'} is complete. Here’s a next thread for the season you’re carrying now.`
    : 'A quiet next thread shaped around the season you named.';

  if (loading) {
    return (
      <Animated.View entering={entering(FadeIn.duration(200).easing(Ease.out))}>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Finding a recommended devotional series"
          style={[
            styles.card,
            styles.loadingCard,
            {
              backgroundColor: alpha(colors.backgroundElevated, 0.7),
              borderColor: alpha(colors.accent, 0.12),
              shadowColor: colors.accent,
            },
          ]}
        >
          <View style={styles.kickerRow}>
            <View style={[styles.kickerRule, { backgroundColor: colors.accent }]} />
            <Text style={[styles.eyebrow, { color: colors.accent }]}>Discerning what’s next</Text>
          </View>

          <Text style={[styles.loadingTitle, { color: colors.text }]}>Finding your next thread.</Text>
          <Text style={[styles.loadingCopy, { color: colors.textMuted }]}>Unfold is matching a devotional to your story and rhythm.</Text>

          <View style={styles.loadingMetaRow}>
            {[0, 1].map((index) => (
              <View
                key={index}
                style={[
                  styles.loadingPill,
                  {
                    backgroundColor: alpha(colors.accent, index === 0 ? 0.12 : 0.075),
                    borderColor: alpha(colors.accent, index === 0 ? 0.2 : 0.12),
                  },
                ]}
              />
            ))}
          </View>

          <ActivityIndicator color={colors.accent} size="small" style={styles.loadingSpinner} />
        </View>
      </Animated.View>
    );
  }

  const typeLabel = formatRecommendationType(recommendation!.type);
  const actionLabel = isCompletion ? 'Begin the Next Study' : 'Start This Study';

  return (
    <Animated.View entering={entering(FadeIn.duration(Duration.normal).easing(Ease.out))}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: alpha(colors.backgroundElevated, 0.72),
            borderColor: alpha(colors.accent, 0.14),
            shadowColor: colors.accent,
          },
        ]}
      >
        <View style={styles.contentColumn}>
          <View style={styles.kickerRow}>
            <View style={[styles.kickerRule, { backgroundColor: colors.accent }]} />
            <Text style={[styles.eyebrow, { color: colors.accent }]}>{eyebrow}</Text>
          </View>

          <Text style={[styles.introCopy, { color: colors.textMuted }]}>{introCopy}</Text>

          <Text style={[styles.themeName, { color: colors.text }]}>
            {recommendation!.themeName}
          </Text>

          <Text style={[styles.reason, { color: colors.textMuted }]}>
            {recommendation!.reason}
          </Text>

          <View style={styles.metaRow}>
            <View style={[styles.metaPill, { backgroundColor: alpha(colors.accent, 0.1), borderColor: alpha(colors.accent, 0.18) }]}>
              <Text style={[styles.metaText, { color: colors.accent }]}>{recommendation!.suggestedLength} days</Text>
            </View>
            <View style={[styles.metaPill, { backgroundColor: alpha(colors.text, 0.045), borderColor: alpha(colors.text, 0.08) }]}>
              <Text style={[styles.metaText, { color: colors.textMuted }]}>{typeLabel}</Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.72}
            onPress={handleStartStudy}
            accessibilityRole="button"
            accessibilityLabel={`${actionLabel}: ${recommendation!.themeName}`}
            accessibilityHint="Starts generation for this recommended devotional series"
            style={[
              styles.primaryAction,
              {
                backgroundColor: alpha(colors.accent, 0.1),
                borderColor: alpha(colors.accent, 0.3),
              },
            ]}
          >
            <Text style={[styles.primaryText, { color: colors.text }]}>{actionLabel}</Text>
            <Text style={[styles.primaryArrow, { color: colors.accent }]}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.72}
            onPress={onChooseOther}
            accessibilityRole="button"
            accessibilityLabel="Choose a different devotional direction"
            accessibilityHint="Opens the new series setup instead of this recommendation"
            style={styles.secondaryAction}
          >
            <Text style={[styles.secondaryText, { color: colors.textMuted }]}>Choose another direction</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing['6'],
    overflow: 'hidden',
    position: 'relative',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.11,
    shadowRadius: 24,
    elevation: 5,
  },
  loadingCard: {
    minHeight: 214,
  },
  contentColumn: {
    zIndex: 2,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    marginBottom: Spacing['4'],
  },
  kickerRule: {
    width: 34,
    height: 1.5,
    borderRadius: 1,
  },
  eyebrow: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  introCopy: {
    width: '100%',
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: Spacing['4'],
  },
  loadingTitle: {
    width: '100%',
    fontFamily: FontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
    marginBottom: Spacing['2'],
  },
  loadingCopy: {
    width: '100%',
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: Spacing['5'],
  },
  loadingMetaRow: {
    flexDirection: 'row',
    gap: Spacing['2'],
  },
  loadingPill: {
    width: 74,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
  },
  loadingSpinner: {
    position: 'absolute',
    right: Spacing['6'],
    bottom: Spacing['6'],
  },
  themeName: {
    width: '100%',
    fontFamily: FontFamily.display,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
    marginBottom: Spacing['3'],
  },
  reason: {
    width: '100%',
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: Spacing['5'],
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing['2'],
    marginBottom: Spacing['6'],
  },
  metaPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: Spacing['1.5'],
    paddingHorizontal: Spacing['3'],
  },
  metaText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.4,
  },
  primaryAction: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    minHeight: 48,
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['5'],
    borderRadius: 999,
    borderWidth: 1,
  },
  primaryText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  primaryArrow: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 17,
    lineHeight: 20,
    marginTop: -1,
  },
  secondaryAction: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: Spacing['1'],
    paddingHorizontal: Spacing['1'],
  },
  secondaryText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
    lineHeight: 18,
  },
});
