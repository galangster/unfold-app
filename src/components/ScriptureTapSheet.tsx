import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useRouter } from 'expo-router';
import { XIcon, BookmarkSimpleIcon, CopyIcon, CheckIcon, BookOpenIcon, ArrowRightIcon } from '@/components/icons';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useCopyConfirmation } from '@/hooks/useCopyConfirmation';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { SheetHandle } from '@/components/ui/SheetHandle';
import { useUnfoldStore } from '@/lib/store';
import { fetchVerse, fetchVerseLocal, type VerseResult } from '@/lib/bible-api';
import { referenceToRoute } from '@/lib/bible-constants';
import { ScriptureExplainSheet } from '@/components/ScriptureExplainSheet';
import { canonicalizeScriptureReference, findBookmarkByIdentity } from '@/lib/bookmark-identity';

export interface SavedScripturePassage {
  text: string;
  translation?: string;
}

interface ScriptureTapSheetProps {
  visible: boolean;
  onClose: () => void;
  reference: string;
  devotionalId?: string;
  dayNumber?: number;
  dayTitle?: string;
  devotionalTitle?: string;
  savedPassage?: SavedScripturePassage;
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
  savedPassage,
}: ScriptureTapSheetProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const addBookmark = useUnfoldStore((s) => s.addBookmark);
  const removeBookmark = useUnfoldStore((s) => s.removeBookmark);
  const bookmarks = useUnfoldStore((s) => s.bookmarks);
  const readerTranslation = useUnfoldStore((s) => s.bibleReaderSettings.translation);

  const [loadedVerse, setLoadedVerse] = useState<{
    result: VerseResult;
    requestedReference: string;
    requestedTranslation: string;
    source: 'fetch' | 'saved';
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const { copied, copy, reset: resetCopied } = useCopyConfirmation();
  const [showExplainSheet, setShowExplainSheet] = useState(false);

  const verse = useMemo(() => {
    if (!loadedVerse) return null;
    if (
      canonicalizeScriptureReference(loadedVerse.requestedReference)
      !== canonicalizeScriptureReference(reference)
    ) return null;
    if (loadedVerse.source === 'saved') return loadedVerse.result;
    if (loadedVerse.requestedTranslation !== readerTranslation.toUpperCase()) return null;
    return loadedVerse.result;
  }, [loadedVerse, readerTranslation, reference]);

  const existingBookmark = devotionalId && dayNumber
    ? findBookmarkByIdentity(bookmarks, {
        devotionalId,
        dayNumber,
        kind: 'scripture',
        key: reference,
      })
    : undefined;
  const alreadyBookmarked = Boolean(existingBookmark);

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
    setLoadedVerse(null);
    if (visible && reference) {
      resetCopied();
      setShowExplainSheet(false);
      const translation = readerTranslation;
      if (savedPassage) {
        setLoading(false);
        setLoadedVerse({
          result: {
            reference,
            text: savedPassage.text,
            translation: savedPassage.translation ?? '',
          },
          requestedReference: reference,
          requestedTranslation: translation.toUpperCase(),
          source: 'saved',
        });
        return;
      }
      setLoading(true);
      const fetchFn = ['BSB', 'KJV'].includes(translation.toUpperCase())
        ? () => fetchVerseLocal(reference, translation.toUpperCase() as 'BSB' | 'KJV')
            .then((local) => local ?? fetchVerse(reference, 'web'))
        : () => fetchVerse(reference, ['web', 'kjv'].includes(translation.toLowerCase()) ? translation.toLowerCase() : 'web');
      // A reference change or close re-runs this effect; the previous fetch
      // must not write its verse (or clear loading) under the new reference.
      let cancelled = false;
      fetchFn()
        .then((result) => {
          if (cancelled) return;
          if (!result) {
            setLoadedVerse(null);
            return;
          }
          setLoadedVerse({
            result,
            requestedReference: reference,
            requestedTranslation: translation.toUpperCase(),
            source: 'fetch',
          });
        })
        .catch(() => {
          if (!cancelled) setLoadedVerse(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [visible, reference, readerTranslation, savedPassage, resetCopied]);

  const handleCopy = () => {
    if (!verse) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const translationLabel = verse.translation ? ` (${verse.translation.toUpperCase()})` : '';
    void copy(`${verse.text}\n— ${verse.reference}${translationLabel}`);
  };

  const handleBookmark = () => {
    if (!devotionalId || !dayNumber || !verse) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (existingBookmark) {
      removeBookmark(existingBookmark.id);
      return;
    }
    addBookmark({
      devotionalId,
      devotionalTitle: devotionalTitle ?? '',
      dayNumber,
      dayTitle: dayTitle ?? '',
      kind: 'scripture',
      key: reference,
      scriptureReference: reference,
      scriptureText: verse.text,
      translation: verse.translation.toUpperCase(),
    });
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
              <SheetHandle />

              {/* Header row: reference + translation + actions + close */}
              <View style={s.header}>
                <View style={s.headerLeft}>
                  <Text style={[s.reference, { color: colors.text }]} numberOfLines={1}>
                    {reference}
                  </Text>
                  {verse?.translation && (
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
                  {verse && devotionalId && dayNumber && (
                    <TouchableOpacity
                      activeOpacity={0.6}
                      onPress={handleBookmark}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={[s.saveBtn, { backgroundColor: alreadyBookmarked ? alpha(colors.accent, 0.10) : 'transparent' }]}
                      accessibilityRole="button"
                      accessibilityLabel={alreadyBookmarked ? `Remove ${reference} from saved` : `Save ${reference}`}
                      accessibilityState={{ selected: alreadyBookmarked }}
                    >
                      <BookmarkSimpleIcon
                        size={16}
                        color={alreadyBookmarked ? colors.accent : colors.textMuted}
                        weight={alreadyBookmarked ? 'fill' : 'light'}
                      />
                      <Text style={[s.saveLabel, { color: alreadyBookmarked ? colors.accent : colors.textMuted }]}>
                        {alreadyBookmarked ? 'Saved' : 'Save'}
                      </Text>
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
  saveBtn: {
    minWidth: 64,
    height: 44,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing['2'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  saveLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.xs,
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
