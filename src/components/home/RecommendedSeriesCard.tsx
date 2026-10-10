/**
 * Recommendation card shown when user has no active series.
 * Fetches a personalized recommendation from the backend and displays
 * theme, a short series descriptor, and quick-start CTA.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { alpha } from '@/components/ui';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { useUnfoldStore } from '@/lib/store';
import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';
import { authenticatedFetch } from '@/lib/device-credential';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { getQaTodayProfileMarker } from '@/lib/qa-today-marker';
import { clearInitialGenerationRequestId } from '@/lib/initial-generation-request';
import { trackAutoTrialPickStartTapped } from '@/lib/auto-trial-telemetry';
import { getChurnedCreationGateAction } from '@/lib/creation-gate-policy';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { cleanRecommendationReason } from '@/lib/recommendation-text';
import type { NextPick } from '@/lib/store';
import type { PremiumAccessPolicy } from '@/lib/premium-access-policy';

/** The fields the backend serves and a stored pick carries. */
interface RecommendationFields {
  theme: string;
  themeName: string;
  type: string;
  subject?: string;
  suggestedLength: 7 | 14;
}

interface Recommendation extends RecommendationFields {
  /** The card body, built once when the recommendation is created. */
  descriptor: string;
}

interface RecommendedSeriesCardProps {
  /** "completion" renders inside journey-complete, "empty" renders standalone */
  variant: 'completion' | 'empty';
  onChooseOther: () => void;
  /** Optional fallback rendered when the recommendation fetch fails */
  renderFallback?: () => ReactNode;
  gateCreation?: () => boolean;
  storedPick?: NextPick | null;
  premiumPolicy?: PremiumAccessPolicy;
}

/** Fetched JSON is unchecked, so a theme name renders only when it is text. */
function displayThemeName(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const PLAIN_FALLBACK_DESCRIPTOR = 'A new series — right where you are right now.';

/**
 * The card's body. The backend writes a new reason on each fetch, and a
 * stored pick carries its own line, so the body would change from one mount
 * to the next. The card shows this short descriptor from the
 * length and the theme instead. The theme name keeps its case, so a name
 * such as "Honest Before God" reads as written. The theme name is data, so
 * the sentence is cleaned too, and a constant covers a theme name the
 * cleaner refuses.
 */
function seriesDescriptor(suggestedLength: number, themeName: string) {
  const theme = themeName.trim() ? themeName : 'this theme';
  return cleanRecommendationReason(`A ${suggestedLength}-day series on ${theme} — right where you are right now.`)
    ?? PLAIN_FALLBACK_DESCRIPTOR;
}

function withDescriptor(fields: RecommendationFields): Recommendation {
  return { ...fields, descriptor: seriesDescriptor(fields.suggestedLength, displayThemeName(fields.themeName)) };
}

function toRecommendation(pick: NextPick): Recommendation {
  return withDescriptor({
    theme: pick.theme,
    themeName: pick.themeName,
    type: pick.type,
    suggestedLength: pick.suggestedLength,
  });
}

function formatRecommendationType(type: string) {
  return type
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const QA_TODAY_PROFILE_MARKER = getQaTodayProfileMarker();

const QA_TODAY_RECOMMENDATION = withDescriptor({
  theme: 'discernment',
  themeName: 'A Quiet Strength',
  type: 'theme',
  suggestedLength: 7,
});

export function RecommendedSeriesCard({
  variant,
  onChooseOther,
  renderFallback,
  gateCreation = () => true,
  storedPick,
  premiumPolicy = 'granted',
}: RecommendedSeriesCardProps) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();
  const router = useRouter();
  const user = useUnfoldStore((s) => s.user);
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const startingRef = useRef(false);

  useFocusEffect(useCallback(() => {
    startingRef.current = false;
  }, []));

  const storedRecommendation = useMemo(
    () => (storedPick ? toRecommendation(storedPick) : null),
    [storedPick],
  );

  const qaRecommendation = useMemo(() => (
    isQaToolsEnabled() && user?.aboutMe === QA_TODAY_PROFILE_MARKER
      ? QA_TODAY_RECOMMENDATION
      : null
  ), [user?.aboutMe]);

  const [recommendation, setRecommendation] = useState<Recommendation | null>(
    storedRecommendation ?? qaRecommendation,
  );
  const [loading, setLoading] = useState(!storedRecommendation && !qaRecommendation);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (storedRecommendation) {
      setRecommendation(storedRecommendation);
      setLoading(false);
      setError(false);
      return;
    }

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
        const res = await authenticatedFetch(`${PRIMARY_BACKEND_URL}/api/recommendations/next-series`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: RecommendationFields = await res.json();
        if (!cancelled) {
          setRecommendation(withDescriptor(data));
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
  }, [qaRecommendation, storedRecommendation]);

  const handleStartStudy = () => {
    if (startingRef.current) return;
    if (!recommendation) return;
    startingRef.current = true;
    const allowed = gateCreation();
    if (storedPick !== undefined) {
      const gateAction = allowed
        ? 'allow'
        : getChurnedCreationGateAction({
          policy: premiumPolicy,
          hasSeenExclusiveOffer: mmkvStorage.getItem('@unfold_exclusive_offer_seen') === 'true',
        });
      trackAutoTrialPickStartTapped({
        gate_action: gateAction,
        pick_source: storedRecommendation ? 'stored' : 'fetched',
      });
    }
    if (!allowed) {
      startingRef.current = false;
      return;
    }
    clearInitialGenerationRequestId();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateUser({
      selectedTheme: recommendation.theme as any,
      selectedType: recommendation.type as any,
      selectedStudySubject: recommendation.subject,
      devotionalLength: recommendation.suggestedLength as any,
    });
    router.navigate({ pathname: '/life-update', params: { next: 'series' } });
  };

  if (error || (!loading && !recommendation)) {
    return renderFallback ? <>{renderFallback()}</> : null;
  }

  const isCompletion = variant === 'completion';
  // After a finished series, this link is the only other next step on Today,
  // so the completion card shows it while the recommendation loads too.
  const otherLabel = isCompletion ? 'Create your own series' : 'Choose another direction';
  const otherAction = (
    <TouchableOpacity
      activeOpacity={0.72}
      onPress={onChooseOther}
      accessibilityRole="button"
      accessibilityLabel={isCompletion ? otherLabel : 'Choose a different devotional direction'}
      accessibilityHint="Opens the new series setup instead of this recommendation"
      style={styles.secondaryAction}
    >
      <Text style={[styles.secondaryText, { color: colors.textMuted }]}>{otherLabel}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <Animated.View entering={entering(FadeIn.duration(200).easing(Ease.out))}>
        <GlassSurface
          radius={Radius.xl}
          style={[
            styles.card,
            styles.loadingCard,
            { shadowColor: colors.accent },
          ]}
        >
          <View accessible accessibilityRole="progressbar" accessibilityLabel="Finding a recommended devotional series">
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
          </View>

          <ActivityIndicator
            color={colors.accent}
            size="small"
            style={styles.loadingSpinner}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          {isCompletion ? otherAction : null}
        </GlassSurface>
      </Animated.View>
    );
  }

  // 'theme' is the backend recommendation-kind discriminator, not a display value —
  // the actual theme name is already the card headline, so the chip would render
  // the bare word 'Theme' with no value attached.
  const typeLabel = recommendation!.type === 'theme' ? null : formatRecommendationType(recommendation!.type);
  const actionLabel = isCompletion ? 'Begin the Next Study' : 'Start This Study';
  const themeName = displayThemeName(recommendation!.themeName);

  return (
    <Animated.View entering={entering(FadeIn.duration(Duration.normal).easing(Ease.out))}>
      <GlassSurface
        radius={Radius.xl}
        style={[
          styles.card,
          { shadowColor: colors.accent },
        ]}
      >
        <View style={styles.contentColumn}>
          <Text style={[styles.themeName, { color: colors.text }]}>
            {themeName}
          </Text>

          <Text style={[styles.descriptor, { color: colors.textMuted }]}>
            {recommendation!.descriptor}
          </Text>

          <View style={styles.metaRow}>
            <View style={[styles.metaPill, { backgroundColor: alpha(colors.accent, 0.1), borderColor: alpha(colors.accent, 0.18) }]}>
              <Text style={[styles.metaText, { color: colors.accent }]}>{recommendation!.suggestedLength} days</Text>
            </View>
            {typeLabel != null && (
              <View style={[styles.metaPill, { backgroundColor: alpha(colors.text, 0.045), borderColor: alpha(colors.text, 0.08) }]}>
                <Text style={[styles.metaText, { color: colors.textMuted }]}>{typeLabel}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            activeOpacity={0.72}
            onPress={handleStartStudy}
            accessibilityRole="button"
            accessibilityLabel={`${actionLabel}: ${themeName}`}
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

          {otherAction}
        </View>
      </GlassSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing['6'],
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
  loadingTitle: {
    width: '100%',
    fontFamily: FontFamily.display,
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.15,
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
    fontSize: 28,
    lineHeight: 33,
    letterSpacing: -0.15,
    marginBottom: Spacing['3'],
  },
  descriptor: {
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
