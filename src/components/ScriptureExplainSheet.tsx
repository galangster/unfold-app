import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { WarningCircleIcon, XIcon } from '@/components/icons';

import { Duration, Ease } from '@/constants/animations';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { alpha } from '@/components/ui';
import { AnalyticsEvents, logEvent } from '@/lib/analytics';
import { useTheme } from '@/lib/theme';
import { Typography } from '@/constants/typography';
import {
  fetchScriptureExplanation,
  type ScriptureExplainApiErrorCode,
  type ScriptureExplainDevotionalContext,
  type ScriptureExplainSource,
  type ScriptureExplanationResponse,
} from '@/lib/scripture-explain-api';

interface ScriptureExplainSheetProps {
  visible: boolean;
  onClose: () => void;
  reference: string;
  passageText: string;
  translation: string;
  source: ScriptureExplainSource;
  devotionalContext?: ScriptureExplainDevotionalContext;
}

type ExplainStatus = 'idle' | 'loading' | 'success' | 'error';

function countSelectedVerses(reference: string): number {
  const normalized = reference.replace(/[–—]/g, '-');
  const match = normalized.match(/:(\d+)\s*-\s*(\d+)\b/);
  if (!match) return 1;

  const start = Number.parseInt(match[1], 10);
  const end = Number.parseInt(match[2], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;

  return end - start + 1;
}

function getErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeCode === 'string' && maybeCode.length > 0) return maybeCode;
  }
  return 'SCRIPTURE_EXPLAIN_UNAVAILABLE';
}

function buildAnalyticsParams({
  source,
  translation,
  verseCount,
  hasDevotionalContext,
  errorCode,
}: {
  source: ScriptureExplainSource;
  translation: string;
  verseCount: number;
  hasDevotionalContext: boolean;
  errorCode?: string;
}) {
  return {
    source,
    translation: translation.trim().toUpperCase() || 'BSB',
    verse_count: verseCount,
    has_devotional_context: hasDevotionalContext,
    ...(errorCode ? { error_code: errorCode } : {}),
  };
}

function explanationParagraphs(response: ScriptureExplanationResponse): string[] {
  return [
    response.explanation.plainMeaning,
    response.explanation.contextNote,
    response.explanation.personalConnection,
  ].filter((part): part is string => Boolean(part && part.trim().length > 0));
}

export function ScriptureExplainSheet({
  visible,
  onClose,
  reference,
  passageText,
  translation,
  source,
  devotionalContext,
}: ScriptureExplainSheetProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const [status, setStatus] = useState<ExplainStatus>('idle');
  const [response, setResponse] = useState<ScriptureExplanationResponse | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const verseCount = useMemo(() => countSelectedVerses(reference), [reference]);
  const hasDevotionalContext = Boolean(devotionalContext && Object.keys(devotionalContext).length > 0);

  const analyticsParams = useMemo(
    () => buildAnalyticsParams({
      source,
      translation,
      verseCount,
      hasDevotionalContext,
    }),
    [hasDevotionalContext, source, translation, verseCount],
  );

  const loadExplanation = useCallback(async () => {
    if (!visible) return;

    const trimmedReference = reference.trim();
    const trimmedPassageText = passageText.trim();
    const normalizedTranslation = translation.trim().toUpperCase() || 'BSB';

    setResponse(null);
    setErrorCode(null);

    if (!trimmedReference || !trimmedPassageText) {
      setStatus('error');
      setErrorCode('SCRIPTURE_EXPLAIN_INVALID_INPUT');
      void logEvent(AnalyticsEvents.SCRIPTURE_EXPLAIN_ERROR, {
        ...analyticsParams,
        error_code: 'SCRIPTURE_EXPLAIN_INVALID_INPUT',
      });
      return;
    }

    setStatus('loading');
    void logEvent(AnalyticsEvents.SCRIPTURE_EXPLAIN_OPENED, analyticsParams);

    try {
      const result = await fetchScriptureExplanation({
        reference: trimmedReference,
        passageText: trimmedPassageText,
        translation: normalizedTranslation,
        source,
        ...(devotionalContext ? { devotionalContext } : {}),
      });

      setResponse(result);
      setStatus('success');
      void logEvent(AnalyticsEvents.SCRIPTURE_EXPLAIN_COMPLETED, analyticsParams);
    } catch (error) {
      const code = getErrorCode(error) as ScriptureExplainApiErrorCode;
      setErrorCode(code);
      setStatus('error');
      void logEvent(AnalyticsEvents.SCRIPTURE_EXPLAIN_ERROR, {
        ...analyticsParams,
        error_code: code,
      });
    }
  }, [analyticsParams, devotionalContext, passageText, reference, source, translation, visible]);

  useEffect(() => {
    if (!visible) {
      setStatus('idle');
      setResponse(null);
      setErrorCode(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      await loadExplanation();
      if (cancelled) return;
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [loadExplanation, visible]);

  if (!visible) return null;

  const displayTranslation = (response?.translation ?? translation.trim().toUpperCase()) || 'BSB';
  const showRetry = status === 'error' && errorCode !== 'SCRIPTURE_EXPLAIN_INVALID_INPUT';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.backdrop} />

        <Animated.View
          entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).easing(Ease.out)}
          exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
          </View>

          <View style={styles.header}>
            <View style={styles.headerTextGroup}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>Study note</Text>
              <View style={styles.referenceRow}>
                <Text style={[styles.reference, { color: colors.text }]} numberOfLines={1}>
                  {response?.reference ?? reference}
                </Text>
                <View style={[styles.translationPill, { backgroundColor: alpha(colors.accent, 0.10) }]}>
                  <Text style={[styles.translationPillText, { color: colors.accent }]}>
                    {displayTranslation}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.6}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.iconButton}
              accessibilityLabel="Close scripture explanation"
              accessibilityRole="button"
            >
              <XIcon size={18} color={colors.textSubtle} weight="light" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces
          >
            <View
              style={[
                styles.scriptureBlock,
                {
                  borderTopColor: alpha(colors.accent, 0.18),
                  borderBottomColor: alpha(colors.accent, 0.10),
                },
              ]}
            >
              <View style={styles.scriptureLabelRow}>
                <Text style={[styles.scriptureLabel, { color: colors.accent }]}>Scripture</Text>
              </View>
              <Text style={[styles.scriptureText, { color: colors.text }]} numberOfLines={6}>
                {passageText.trim() || 'Select a verse first.'}
              </Text>
            </View>

            {status === 'loading' && (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>Reading the passage...</Text>
              </View>
            )}

            {status === 'success' && response && (
              <Animated.View
                entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
                style={styles.explanationWrap}
              >
                <Text style={[styles.sectionLabel, { color: colors.accent }]}>Meaning</Text>
                <View style={styles.explanationBody}>
                  {explanationParagraphs(response).map((paragraph, index) => (
                    <Text
                      key={`${index}-${paragraph.slice(0, 12)}`}
                      style={[styles.explanationText, { color: colors.textMuted }]}
                    >
                      {paragraph}
                    </Text>
                  ))}
                </View>

                {response.explanation.reflectionPrompt ? (
                  <View
                    style={[
                      styles.carryNote,
                      {
                        borderTopColor: alpha(colors.accent, 0.18),
                      },
                    ]}
                  >
                    <Text style={[styles.sectionLabel, { color: colors.accent }]}>Carry this</Text>
                    <Text style={[styles.promptText, { color: colors.text }]}>
                      {response.explanation.reflectionPrompt}
                    </Text>
                  </View>
                ) : null}
              </Animated.View>
            )}

            {status === 'error' && (
              <View style={styles.errorWrap}>
                <WarningCircleIcon size={22} color={colors.accent} weight="light" />
                <Text style={[styles.errorText, { color: colors.text }]}>
                  {errorCode === 'SCRIPTURE_EXPLAIN_INVALID_INPUT'
                    ? 'Select a verse first.'
                    : "The study note didn't load. Try again in a moment."}
                </Text>
                {showRetry ? (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={loadExplanation}
                    style={[styles.retryButton, { backgroundColor: alpha(colors.accent, 0.10) }]}
                    accessibilityLabel="Retry scripture explanation"
                    accessibilityRole="button"
                  >
                    <Text style={[styles.retryText, { color: colors.accent }]}>Try again</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.56)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '84%',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['2'],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['2'],
    paddingBottom: Spacing['4'],
  },
  headerTextGroup: {
    flex: 1,
    gap: 5,
  },
  eyebrow: {
    ...Typography.cardMeta,
  },
  referenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
  },
  reference: {
    flexShrink: 1,
    fontFamily: FontFamily.display,
    fontSize: 20,
    lineHeight: 25,
  },
  translationPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.md,
  },
  translationPillText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 0.7,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing['3'],
  },
  scroll: {
    paddingHorizontal: Spacing['5'],
  },
  scrollContent: {
    paddingBottom: Spacing['12'],
    gap: Spacing['6'],
  },
  scriptureBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing['1'],
    paddingVertical: Spacing['5'],
  },
  scriptureLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing['3'],
  },
  scriptureLabel: {
    ...Typography.cardMeta,
  },
  scriptureText: {
    fontFamily: FontFamily.display,
    fontSize: 18,
    lineHeight: 30,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['8'],
    gap: Spacing['3'],
  },
  loadingText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
  },
  explanationWrap: {
    gap: Spacing['4'],
  },
  sectionLabel: {
    ...Typography.cardMeta,
  },
  explanationBody: {
    gap: Spacing['4'],
  },
  explanationText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    lineHeight: 26,
  },
  carryNote: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing['1'],
    paddingTop: Spacing['4'],
    gap: Spacing['2'],
    marginTop: Spacing['2'],
  },
  promptText: {
    fontFamily: FontFamily.display,
    fontSize: 16,
    lineHeight: 24,
  },
  errorWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['8'],
    gap: Spacing['3'],
  },
  errorText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 22,
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
  },
  retryText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
});
