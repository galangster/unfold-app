import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Modal, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeIn, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { XIcon, BookmarkSimpleIcon, CopyIcon, CheckIcon, SparkleIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { fetchVerse, fetchCommentary, type VerseResult } from '@/lib/bible-api';

interface ScriptureTapSheetProps {
  visible: boolean;
  onClose: () => void;
  reference: string;
  devotionalId?: string;
  dayNumber?: number;
  dayTitle?: string;
  devotionalTitle?: string;
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

  useEffect(() => {
    if (visible && reference) {
      setLoading(true);
      setCopied(false);
      setSaved(false);
      setCommentary(null);
      setCommentaryLoading(false);
      const translation = user?.bibleTranslation?.toLowerCase() ?? 'web';
      // Only free translations for bible-api.com
      const apiTranslation = ['web', 'kjv'].includes(translation) ? translation : 'web';
      fetchVerse(reference, apiTranslation)
        .then((result) => {
          setVerse(result);
          // Start loading AI commentary after verse loads
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

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableOpacity activeOpacity={0.7}
        onPress={onClose}
        style={stStyles.backdrop}
      >
        {/* Sheet */}
        <Animated.View
          entering={SlideInDown.duration(300)}
          exiting={SlideOutDown.duration(200)}
          style={[stStyles.sheet, { backgroundColor: colors.background }]}
        >
          <TouchableOpacity activeOpacity={0.7} onPress={(e) => e.stopPropagation()}>
            {/* Grab handle */}
            <View style={stStyles.handleContainer}>
              <View style={[stStyles.handle, { backgroundColor: colors.border }]} />
            </View>

            {/* Header */}
            <View style={stStyles.header}>
              <Text style={[stStyles.headerTitle, { color: colors.text }]}>
                {reference}
              </Text>

              <TouchableOpacity activeOpacity={0.7}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={stStyles.closeButton}
                accessibilityLabel="Close scripture view"
                accessibilityRole="button"
              >
                <XIcon size={20} color={colors.textSubtle} weight="light" />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView style={stStyles.scrollContent} showsVerticalScrollIndicator={false}>
              {loading ? (
                <View style={stStyles.loadingContainer}>
                  <ActivityIndicator size="small" color={colors.accent} />
                </View>
              ) : verse ? (
                <>
                  {/* Verse text */}
                  <Text style={[stStyles.verseText, { color: colors.text }]}>
                    {verse.text}
                  </Text>

                  {/* Translation badge */}
                  <View style={[stStyles.translationBadge, { backgroundColor: colors.inputBackground }]}>
                    <Text style={[stStyles.translationText, { color: colors.textSubtle }]}>
                      {verse.translation.toUpperCase()}
                    </Text>
                  </View>

                  {/* AI Commentary */}
                  {commentaryLoading && (
                    <Animated.View
                      entering={FadeIn.duration(200)}
                      style={[stStyles.commentaryLoading, { backgroundColor: colors.inputBackground }]}
                    >
                      <ActivityIndicator size={12} color={colors.accent} />
                      <Text style={[stStyles.commentaryLoadingText, { color: colors.textSubtle }]}>
                        Connecting to today's theme...
                      </Text>
                    </Animated.View>
                  )}
                  {commentary && !commentaryLoading && (
                    <Animated.View
                      entering={FadeIn.duration(400)}
                      style={[stStyles.commentaryCard, { backgroundColor: colors.inputBackground, borderLeftColor: colors.accent }]}
                    >
                      <View style={stStyles.commentaryHeader}>
                        <SparkleIcon size={12} color={colors.accent} weight="fill" />
                        <Text style={[stStyles.commentaryLabel, { color: colors.accent }]}>
                          Today's Connection
                        </Text>
                      </View>
                      <Text style={[stStyles.commentaryText, { color: colors.textMuted }]}>
                        {commentary}
                      </Text>
                    </Animated.View>
                  )}

                  {/* Action buttons */}
                  <View style={stStyles.actionsRow}>
                    <TouchableOpacity activeOpacity={0.7}
                      onPress={handleCopy}
                      style={[stStyles.actionButton, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                    >
                      {copied ? (
                        <CheckIcon size={16} color={colors.accent} weight="bold" />
                      ) : (
                        <CopyIcon size={16} color={colors.textMuted} weight="light" />
                      )}
                      <Text style={[stStyles.actionButtonText, { color: copied ? colors.accent : colors.text }]}>
                        {copied ? 'Copied' : 'Copy'}
                      </Text>
                    </TouchableOpacity>

                    {devotionalId && dayNumber && !alreadyBookmarked && (
                      <TouchableOpacity activeOpacity={0.7}
                        onPress={handleBookmark}
                        style={[
                          stStyles.actionButton,
                          {
                            backgroundColor: saved ? colors.accent + '15' : colors.inputBackground,
                            borderColor: saved ? colors.accent : colors.border,
                          },
                        ]}
                      >
                        <BookmarkSimpleIcon
                          size={16}
                          color={saved ? colors.accent : colors.textMuted}
                          weight={saved ? 'fill' : 'light'}
                        />
                        <Text style={[stStyles.actionButtonText, { color: saved ? colors.accent : colors.text }]}>
                          {saved ? 'Saved' : 'Bookmark'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              ) : (
                <Text style={[stStyles.errorText, { color: colors.textMuted }]}>
                  Couldn't load this passage. Try again later.
                </Text>
              )}
            </ScrollView>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const stStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '55%',
    paddingBottom: 100,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  headerTitle: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 17,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  verseText: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    lineHeight: 28,
    marginBottom: 12,
  },
  translationBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 16,
  },
  translationText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  commentaryLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  commentaryLoadingText: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
  },
  commentaryCard: {
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 2,
    marginBottom: 16,
  },
  commentaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  commentaryLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  commentaryText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionButtonText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 14,
  },
  errorText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: 30,
  },
});
