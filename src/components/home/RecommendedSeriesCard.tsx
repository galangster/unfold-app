/**
 * Recommendation card shown when user has no active series.
 * Fetches a personalized recommendation from the backend and displays
 * theme, reason text, and quick-start CTA.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { alpha } from '@/components/ui';
import { AccentGlow } from '@/components/AccentGlow';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { useUnfoldStore } from '@/lib/store';
import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';

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
  /** Optional fallback rendered when the recommendation fetch fails */
  renderFallback?: () => ReactNode;
}

export function RecommendedSeriesCard({ variant, onChooseOther, renderFallback }: RecommendedSeriesCardProps) {
  const { colors, isDark } = useTheme();
  const { entering } = useAccessibleAnimation();
  const router = useRouter();
  const updateUser = useUnfoldStore((s) => s.updateUser);

  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
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
  }, []);

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

  // Error or no recommendation → render fallback if provided, otherwise don't render
  if (error || (!loading && !recommendation)) {
    return renderFallback ? <>{renderFallback()}</> : null;
  }

  // Loading state — subtle shimmer
  if (loading) {
    return (
      <Animated.View entering={entering(FadeIn.duration(200).easing(Ease.out))}>
        <View style={[styles.card, {
          backgroundColor: Platform.OS === 'ios'
            ? alpha(colors.backgroundElevated, 0.6)
            : alpha(colors.backgroundElevated, 0.85),
          borderColor: alpha(colors.accent, 0.09),
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 120,
        }]}>
          {Platform.OS === 'ios' && (
            <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          )}
          <ActivityIndicator color={colors.textMuted} size="small" />
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={entering(FadeIn.duration(Duration.normal).easing(Ease.out))}>
      <View style={[styles.card, {
        backgroundColor: Platform.OS === 'ios'
          ? alpha(colors.backgroundElevated, 0.6)
          : alpha(colors.backgroundElevated, 0.85),
        borderColor: alpha(colors.accent, 0.09),
        overflow: 'hidden',
      }]}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        )}

        {variant === 'empty' && (
          <Text style={[styles.eyebrow, { color: colors.textHint }]}>
            Recommended for you
          </Text>
        )}

        {variant === 'completion' && (
          <View style={[styles.divider, { borderColor: alpha(colors.textMuted, 0.2) }]}>
            <Text style={[styles.dividerText, { color: colors.textMuted }]}>Up Next</Text>
          </View>
        )}

        <Text style={[styles.themeName, { color: colors.text }]}>
          {recommendation!.themeName}
        </Text>

        <Text style={[styles.reason, { color: colors.textMuted }]}>
          {recommendation!.reason}
        </Text>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleStartStudy}
          accessibilityRole="button"
          accessibilityLabel="Start this study"
        >
          <AccentGlow color={colors.accent} intensity="medium" active style={{ borderRadius: Radius.md }}>
            <View style={[styles.cta, { backgroundColor: colors.accent }]}>
              <Text style={[styles.ctaText, { color: colors.background }]}>
                Start This Study
              </Text>
            </View>
          </AccentGlow>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onChooseOther}
          accessibilityRole="button"
          accessibilityLabel="Choose something else"
          style={styles.secondaryAction}
        >
          <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
            or choose something else
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing['5'],
  },
  eyebrow: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    marginBottom: Spacing['3'],
  },
  divider: {
    borderTopWidth: 1,
    paddingTop: Spacing['3'],
    marginBottom: Spacing['3'],
  },
  dividerText: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  themeName: {
    fontFamily: FontFamily.body,
    fontSize: 20,
    fontWeight: '600' as const,
    marginBottom: Spacing['2'],
  },
  reason: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: Spacing['5'],
  },
  cta: {
    paddingVertical: Spacing['3.5'],
    paddingHorizontal: Spacing['4'],
    borderRadius: Radius.md,
    alignItems: 'center' as const,
  },
  ctaText: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  secondaryAction: {
    alignItems: 'center' as const,
    paddingTop: Spacing['3'],
  },
  secondaryText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
  },
});
