import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Modal, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { Duration } from '@/constants/animations';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { XIcon, BookmarkSimpleIcon, CopyIcon, CheckIcon, SparkleIcon, BookOpenIcon, ArrowRightIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { useUnfoldStore } from '@/lib/store';
import { fetchVerse, fetchVerseLocal, fetchCommentary, type VerseResult } from '@/lib/bible-api';
import { BIBLE_BOOKS } from '@/lib/bible-constants';

interface ScriptureTapSheetProps {
  visible: boolean;
  onClose: () => void;
  reference: string;
  devotionalId?: string;
  dayNumber?: number;
  dayTitle?: string;
  devotionalTitle?: string;
}

/** Parse "Romans 8:28" into { bookId, chapter, verse } for Bible reader navigation */
function parseReferenceForNav(reference: string): { bookId: number; chapter: number; verse: number } | null {
  const match = reference.match(/^(.+?)\s+(\d+)(?::(\d+))?/);
  if (!match) return null;

  const bookName = match[1].trim();
  const chapter = parseInt(match[2], 10);
  const verse = match[3] ? parseInt(match[3], 10) : 1;

  const book = BIBLE_BOOKS.find(
    (b) => b.name.toLowerCase() === bookName.toLowerCase()
  );
  if (!book) return null;

  return { bookId: book.id, chapter, verse };
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
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const addBookmark = useUnfoldStore((s) => s.addBookmark);
  const isBookmarked = useUnfoldStore((s) => s.isBookmarked);
  const user = useUnfoldStore((s) => s.user);

  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);
  const devotionals = useUnfoldStore((s) => s.devotionals);

  const [verse, setVerse] = useState<VerseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [commentary, setCommentary] = useState<string | null>(null);
  const [commentaryLoading, setCommentaryLoading] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alreadyBookmarked = devotionalId && dayNumber
    ? isBookmarked(devotionalId, dayNumber)
    : false;

  const canNavigate = parseReferenceForNav(reference) !== null;

  useEffect(() => {
    if (visible && reference) {
      setLoading(true);
      setCopied(false);
      setSaved(false);
      setCommentary(null);
      setCommentaryLoading(false);
      const translation = user?.bibleTranslation ?? 'BSB';
      const fetchFn = ['BSB', 'KJV'].includes(translation.toUpperCase())
        ? () => fetchVerseLocal(reference, translation.toUpperCase() as 'BSB' | 'KJV')
            .then((local) => local ?? fetchVerse(reference, 'web'))
        : () => fetchVerse(reference, ['web', 'kjv'].includes(translation.toLowerCase()) ? translation.toLowerCase() : 'web');
      fetchFn()
        .then((result) => {
          setVerse(result);
          if (result && dayTitle) {
            setCommentaryLoading(true);
            fetchCommentary({
              reference: result.reference,
              verseText: result.text,
              todayTheme: dayTitle,
              todayTitle: dayTitle,
            })
              .then((c) => setCommentary(c))
              .finally(() => setCommentaryLoading(false));
          }
        })
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

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.container}>
        {/* Backdrop */}
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={s.backdrop} />

        {/* Sheet */}
        <Animated.View
          entering={FadeInDown.duration(Duration.normal)}
          exiting={FadeOut.duration(Duration.fast)}
          style={[s.sheet, { backgroundColor: colors.background }]}
        >
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
                {/* Verse text — accent left border for visual identity */}
                <View style={[s.verseBlock, { borderLeftColor: alpha(colors.accent, 0.25) }]}>
                  <Text style={[s.verseText, { color: colors.text }]}>
                    {verse.text}
                  </Text>
                </View>

                {/* AI Commentary */}
                {commentaryLoading && (
                  <Animated.View
                    entering={FadeIn.duration(Duration.normal)}
                    style={[s.commentaryLoading, { backgroundColor: colors.inputBackground }]}
                  >
                    <ActivityIndicator size={12} color={colors.accent} />
                    <Text style={[s.commentaryLoadingLabel, { color: colors.textSubtle }]}>
                      Connecting to today's theme...
                    </Text>
                  </Animated.View>
                )}
                {commentary && !commentaryLoading && (
                  <Animated.View
                    entering={FadeIn.duration(400)}
                    style={[s.commentaryCard, { backgroundColor: colors.inputBackground }]}
                  >
                    <View style={s.commentaryHeaderRow}>
                      <SparkleIcon size={11} color={colors.accent} weight="fill" />
                      <Text style={[s.commentaryLabel, { color: colors.accent }]}>
                        Today's Connection
                      </Text>
                    </View>
                    <Text style={[s.commentaryBody, { color: colors.textMuted }]}>
                      {commentary}
                    </Text>
                  </Animated.View>
                )}

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
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    maxHeight: '65%',
  },

  // ─── Handle ─────────────────────────────────────
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['2'],
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
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
    borderLeftWidth: 2,
    paddingLeft: Spacing['4'],
    marginBottom: Spacing['5'],
  },
  verseText: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    lineHeight: 30,
  },

  // ─── Commentary ─────────────────────────────────
  commentaryLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    padding: 14,
    borderRadius: Radius.md,
    marginBottom: Spacing['4'],
  },
  commentaryLoadingLabel: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  commentaryCard: {
    padding: 14,
    borderRadius: Radius.md,
    marginBottom: Spacing['4'],
  },
  commentaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  commentaryLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  commentaryBody: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 22,
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
