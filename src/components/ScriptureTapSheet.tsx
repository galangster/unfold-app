import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Modal, ScrollView } from 'react-native';
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
    setTimeout(() => setCopied(false), 2000);
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
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        {/* Sheet */}
        <Animated.View
          entering={SlideInDown.duration(300)}
          exiting={SlideOutDown.duration(200)}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '55%',
            paddingBottom: 100,
          }}
        >
          <TouchableOpacity activeOpacity={0.7} onPress={(e) => e.stopPropagation()}>
            {/* Grab handle */}
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.border,
                }}
              />
            </View>

            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 24,
                paddingBottom: 16,
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 17,
                  color: colors.text,
                  flex: 1,
                }}
              >
                {reference}
              </Text>

              <TouchableOpacity activeOpacity={0.7}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ padding: 4 }}
              >
                <XIcon size={20} color={colors.textSubtle} weight="light" />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView style={{ paddingHorizontal: 24 }} showsVerticalScrollIndicator={false}>
              {loading ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <ActivityIndicator size="small" color={colors.accent} />
                </View>
              ) : verse ? (
                <>
                  {/* Verse text */}
                  <Text
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: 17,
                      color: colors.text,
                      lineHeight: 28,
                      marginBottom: 12,
                    }}
                  >
                    {verse.text}
                  </Text>

                  {/* Translation badge */}
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      backgroundColor: colors.inputBackground,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 6,
                      marginBottom: 16,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 11,
                        color: colors.textSubtle,
                        letterSpacing: 0.5,
                      }}
                    >
                      {verse.translation.toUpperCase()}
                    </Text>
                  </View>

                  {/* AI Commentary */}
                  {commentaryLoading && (
                    <Animated.View
                      entering={FadeIn.duration(200)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        padding: 14,
                        backgroundColor: colors.inputBackground,
                        borderRadius: 12,
                        marginBottom: 16,
                      }}
                    >
                      <ActivityIndicator size={12} color={colors.accent} />
                      <Text
                        style={{
                          fontFamily: FontFamily.ui,
                          fontSize: 12,
                          color: colors.textSubtle,
                        }}
                      >
                        Connecting to today's theme...
                      </Text>
                    </Animated.View>
                  )}
                  {commentary && !commentaryLoading && (
                    <Animated.View
                      entering={FadeIn.duration(400)}
                      style={{
                        padding: 14,
                        backgroundColor: colors.inputBackground,
                        borderRadius: 12,
                        borderLeftWidth: 2,
                        borderLeftColor: colors.accent,
                        marginBottom: 16,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <SparkleIcon size={12} color={colors.accent} weight="fill" />
                        <Text
                          style={{
                            fontFamily: FontFamily.uiMedium,
                            fontSize: 10,
                            color: colors.accent,
                            letterSpacing: 0.5,
                            textTransform: 'uppercase',
                          }}
                        >
                          Today's Connection
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontFamily: FontFamily.body,
                          fontSize: 14,
                          color: colors.textMuted,
                          lineHeight: 22,
                        }}
                      >
                        {commentary}
                      </Text>
                    </Animated.View>
                  )}

                  {/* Action buttons */}
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity activeOpacity={0.7}
                      onPress={handleCopy}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: colors.inputBackground,
                        borderWidth: 1,
                        borderColor: colors.border,
                        opacity: 1,
                      }}
                    >
                      {copied ? (
                        <CheckIcon size={16} color={colors.accent} weight="bold" />
                      ) : (
                        <CopyIcon size={16} color={colors.textMuted} weight="light" />
                      )}
                      <Text
                        style={{
                          fontFamily: FontFamily.uiMedium,
                          fontSize: 14,
                          color: copied ? colors.accent : colors.text,
                        }}
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </Text>
                    </TouchableOpacity>

                    {devotionalId && dayNumber && !alreadyBookmarked && (
                      <TouchableOpacity activeOpacity={0.7}
                        onPress={handleBookmark}
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          paddingVertical: 12,
                          borderRadius: 12,
                          backgroundColor: saved ? colors.accent + '15' : colors.inputBackground,
                          borderWidth: 1,
                          borderColor: saved ? colors.accent : colors.border,
                          opacity: 1,
                        }}
                      >
                        <BookmarkSimpleIcon
                          size={16}
                          color={saved ? colors.accent : colors.textMuted}
                          weight={saved ? 'fill' : 'light'}
                        />
                        <Text
                          style={{
                            fontFamily: FontFamily.uiMedium,
                            fontSize: 14,
                            color: saved ? colors.accent : colors.text,
                          }}
                        >
                          {saved ? 'Saved' : 'Bookmark'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              ) : (
                <Text
                  style={{
                    fontFamily: FontFamily.body,
                    fontSize: 15,
                    color: colors.textMuted,
                    textAlign: 'center',
                    paddingVertical: 30,
                  }}
                >
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
