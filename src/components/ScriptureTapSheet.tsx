import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Modal, ScrollView, StyleSheet } from 'react-native';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeInDown,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { XIcon, BookmarkSimpleIcon, CopyIcon, CheckIcon, BookOpenIcon, ArrowRightIcon } from '@/components/icons';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { useUnfoldStore } from '@/lib/store';
import { fetchVerse, fetchVerseLocal, type VerseResult } from '@/lib/bible-api';
import { referenceToRoute } from '@/lib/bible-constants';
import { ScriptureExplainSheet } from '@/components/ScriptureExplainSheet';

interface ScriptureTapSheetProps {
  visible: boolean;
  onClose: () => void;
  reference: string;
  devotionalId?: string;
  dayNumber?: number;
  dayTitle?: string;
  devotionalTitle?: string;
}

const SWIPE_DISMISS_THRESHOLD = 72;
const SWIPE_DISMISS_VELOCITY = 850;
const SWIPE_DISMISS_OFFSCREEN = 520;

/** Parse "Romans 8:28" into { bookId, chapter, verse } for Bible reader navigation */
function parseReferenceForNav(reference: string): { bookId: number; chapter: number; verse: number } | null {
  // referenceToRoute's alias table resolves citation forms ("Psalm 46:10")
  // to the book entry named "Psalms" — exact-name matching silently dropped
  // the Read in Bible affordance for the most common Psalm references.
  const parsed = referenceToRoute(reference);
  if (!parsed) return null;
  return { bookId: parsed.bookId, chapter: parsed.chapter, verse: parsed.verse ?? 1 };
}

export function ScriptureTapSheet({
  visible,
  onClose,
  reference,
  devotionalId,
  dayNumber,
  dayTitle,
  devotionalTitle,
}: ScriptureTapSheetProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const addBookmark = useUnfoldStore((s) => s.addBookmark);
  const isBookmarked = useUnfoldStore((s) => s.isBookmarked);
  const user = useUnfoldStore((s) => s.user);

  const [verse, setVerse] = useState<VerseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showExplainSheet, setShowExplainSheet] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alreadyBookmarked = devotionalId && dayNumber
    ? isBookmarked(devotionalId, dayNumber)
    : false;

  const canNavigate = parseReferenceForNav(reference) !== null;
  const translateY = useSharedValue(0);
  const dismissDuration = reducedMotion ? 1 : Duration.fast;

  const handleSwipeDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
    }
  }, [translateY, visible]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .failOffsetX([-24, 24])
        .onUpdate((e) => {
          if (e.translationY > 0) {
            translateY.value = e.translationY;
          }
        })
        .onEnd((e) => {
          if (e.translationY > SWIPE_DISMISS_THRESHOLD || e.velocityY > SWIPE_DISMISS_VELOCITY) {
            translateY.value = withTiming(
              SWIPE_DISMISS_OFFSCREEN,
              { duration: dismissDuration },
              (finished) => {
                if (finished) {
                  runOnJS(handleSwipeDismiss)();
                }
              },
            );
          } else {
            translateY.value = withTiming(0, { duration: Duration.fast });
          }
        }),
    [dismissDuration, handleSwipeDismiss, translateY],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  useEffect(() => {
    if (visible && reference) {
      setLoading(true);
      setCopied(false);
      setSaved(false);
      setShowExplainSheet(false);
      const translation = user?.bibleTranslation ?? 'BSB';
      const fetchFn = ['BSB', 'KJV'].includes(translation.toUpperCase())
        ? () => fetchVerseLocal(reference, translation.toUpperCase() as 'BSB' | 'KJV')
            .then((local) => local ?? fetchVerse(reference, 'web'))
        : () => fetchVerse(reference, ['web', 'kjv'].includes(translation.toLowerCase()) ? translation.toLowerCase() : 'web');
      fetchFn()
        .then((result) => setVerse(result))
        .finally(() => setLoading(false));
    }
  }, [visible, reference, user?.bibleTranslation, dayTitle]);

  const handleCopy = async () => {
    if (!verse) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(`${verse.text}\n— ${verse.reference} (${verse.translation.toUpperCase()})`);
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleBookmark = () => {
    if (!devotionalId || !dayNumber || !verse) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addBookmark({
      devotionalId,
      devotionalTitle: devotionalTitle ?? '',
      dayNumber,
      dayTitle: dayTitle ?? '',
      scriptureReference: verse.reference,
      scriptureText: verse.text,
      quotedText: verse.text,
    });
    setSaved(true);
  };

  const handleReadInBible = () => {
    const nav = parseReferenceForNav(reference);
    if (!nav) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    setTimeout(() => {
      router.push(`/(tabs)/(bible)/reader?bookId=${nav.bookId}&chapter=${nav.chapter}&verse=${nav.verse}`);
    }, 200);
  };

  const handleExplain = () => {
    if (!verse) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowExplainSheet(true);
  };

  if (!visible) return null;

  return (
    <>
    <Modal
      visible={visible && !showExplainSheet}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={s.container}>
        {/* Backdrop */}
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={s.backdrop} />

        {/* Sheet shell owns mount/unmount layout animation; inner sheet owns gesture transform. */}
        <Animated.View
          entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).easing(Ease.out)}
          exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
          style={s.sheetShell}
        >
          <Animated.View style={[s.sheet, sheetAnimatedStyle, { backgroundColor: colors.background }]}>
          <GestureDetector gesture={panGesture}>
            <View testID="scripture-sheet-swipe-dismiss-region" style={s.dragRegion}>
              {/* Drag indicator */}
              <View style={s.handleRow}>
                <View style={[s.handle, { backgroundColor: colors.borderStrong }]} />
              </View>

              {/* Header row: reference + translation + actions + close */}
              <View style={s.header}>
                <View style={s.headerLeft}>
                  <Text style={[s.reference, { color: colors.text }]} numberOfLines={1}>
                    {reference}
                  </Text>
                  {verse && (
                    <View style={[s.translationPill, { backgroundColor: alpha(colors.accent, 0.10) }]}>
                      <Text style={[s.translationPillText, { color: colors.accent }]}>
                        {verse.translation.toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={s.headerActions}>
                  {/* Copy */}
                  {verse && (
                    <TouchableOpacity
                      activeOpacity={0.6}
                      onPress={handleCopy}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={[s.iconBtn, { backgroundColor: copied ? alpha(colors.accent, 0.10) : 'transparent' }]}
                      accessibilityRole="button"
                      accessibilityLabel="Copy verse text"
                    >
                      {copied ? (
                        <CheckIcon size={16} color={colors.accent} weight="bold" />
                      ) : (
                        <CopyIcon size={16} color={colors.textMuted} weight="light" />
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Bookmark */}
                  {verse && devotionalId && dayNumber && !alreadyBookmarked && (
                    <TouchableOpacity
                      activeOpacity={0.6}
                      onPress={handleBookmark}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={[s.iconBtn, { backgroundColor: saved ? alpha(colors.accent, 0.10) : 'transparent' }]}
                      accessibilityRole="button"
                      accessibilityLabel={saved ? 'Remove bookmark' : 'Save bookmark'}
                    >
                      <BookmarkSimpleIcon
                        size={16}
                        color={saved ? colors.accent : colors.textMuted}
                        weight={saved ? 'fill' : 'light'}
                      />
                    </TouchableOpacity>
                  )}

                  {/* Close */}
                  <TouchableOpacity
                    activeOpacity={0.6}
                    onPress={onClose}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={s.iconBtn}
                    accessibilityLabel="Close scripture view"
                    accessibilityRole="button"
                  >
                    <XIcon size={18} color={colors.textSubtle} weight="light" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </GestureDetector>

          {/* Scrollable content */}
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces
          >
            {loading ? (
              <View style={s.loadingWrap}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : verse ? (
              <>
                {/* Verse text — quiet editorial frame, no automatic explanation */}
                <View
                  style={[
                    s.verseBlock,
                    {
                      borderTopColor: alpha(colors.accent, 0.18),
                      borderBottomColor: alpha(colors.accent, 0.10),
                    },
                  ]}
                >
                  <Text style={[s.verseText, { color: colors.text }]}>
                    {verse.text}
                  </Text>
                </View>

                {/* Explain — explicit opt-in, no hidden AI call on sheet open */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleExplain}
                  style={[s.explainCta, { backgroundColor: colors.inputBackground, borderColor: alpha(colors.accent, 0.16) }]}
                  accessibilityLabel="Explain this passage"
                  accessibilityRole="button"
                >
                  <BookOpenIcon size={16} color={colors.accent} weight="light" />
                  <View style={s.explainCtaTextGroup}>
                    <Text style={[s.explainCtaText, { color: colors.text }]}>Explain this passage</Text>
                    <Text style={[s.explainCtaSubtext, { color: colors.textSubtle }]}>Meaning, context, and a prompt for prayer</Text>
                  </View>
                  <ArrowRightIcon size={14} color={colors.accent} weight="bold" style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>

                {/* Read in Bible — primary CTA */}
                {canNavigate && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={handleReadInBible}
                    style={[s.readCta, { backgroundColor: alpha(colors.accent, 0.07) }]}
                  >
                    <BookOpenIcon size={16} color={colors.accent} weight="light" />
                    <Text style={[s.readCtaText, { color: colors.accent }]}>
                      Read in Bible
                    </Text>
                    <ArrowRightIcon size={14} color={colors.accent} weight="bold" style={{ marginLeft: 'auto' }} />
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <Text style={[s.errorText, { color: colors.textMuted }]}>
                Couldn't load this passage. Try again later.
              </Text>
            )}
          </ScrollView>
        </Animated.View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
    {verse && (
      <ScriptureExplainSheet
        visible={showExplainSheet}
        onClose={() => setShowExplainSheet(false)}
        reference={verse.reference}
        passageText={verse.text}
        translation={verse.translation.toUpperCase()}
        source="devotional-scripture-sheet"
        devotionalContext={{
          ...(devotionalId ? { devotionalId } : {}),
          ...(devotionalTitle ? { devotionalTitle } : {}),
          ...(dayNumber ? { dayNumber } : {}),
          ...(dayTitle ? { dayTitle } : {}),
        }}
      />
    )}
    </>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetShell: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '65%',
  },
  sheet: {
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
  },

  // ─── Handle ─────────────────────────────────────
  dragRegion: {
    width: '100%',
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

  // ─── Header ─────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['2'],
    paddingBottom: 14,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
  },
  reference: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 17,
    flexShrink: 1,
  },
  translationPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  translationPillText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: Spacing['2'],
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Scroll ─────────────────────────────────────
  scroll: {
    paddingHorizontal: Spacing['5'],
  },
  scrollContent: {
    paddingBottom: Spacing['12'],
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: Spacing['10'],
  },

  // ─── Verse ──────────────────────────────────────
  verseBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing['1'],
    paddingVertical: Spacing['5'],
    marginBottom: Spacing['5'],
  },
  verseText: {
    fontFamily: FontFamily.display,
    fontSize: 18,
    lineHeight: 30,
  },

  // ─── Explain CTA ─────────────────────────────────
  explainCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: Spacing['4'],
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing['3'],
  },
  explainCtaTextGroup: {
    flex: 1,
    gap: 2,
  },
  explainCtaText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
  explainCtaSubtext: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },

  // ─── Read CTA ───────────────────────────────────
  readCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: Spacing['4'],
    borderRadius: Radius.md,
  },
  readCtaText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },

  // ─── Error ──────────────────────────────────────
  errorText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: 30,
  },
});
