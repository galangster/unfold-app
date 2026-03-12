import { useMemo, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  PencilLineIcon,
  BookOpenIcon,
  MagnifyingGlassIcon,
  ArrowBendDownRightIcon,
  CheckCircleIcon,
  XIcon,
} from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';

export default function JournalHubScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const currentDevotional = devotionals.find((d) => d.id === currentDevotionalId);

  // Group entries by devotional
  const entriesByDevotional = useMemo(() => {
    const grouped = new Map<string, typeof journalEntries>();
    for (const entry of journalEntries) {
      const existing = grouped.get(entry.devotionalId) ?? [];
      existing.push(entry);
      grouped.set(entry.devotionalId, existing);
    }
    return grouped;
  }, [journalEntries]);

  // Current day data for reflection questions
  const currentDayData = useMemo(() => {
    if (!currentDevotional) return null;
    return currentDevotional.days.find(
      (d) => d.dayNumber === currentDevotional.currentDay
    ) ?? null;
  }, [currentDevotional]);

  // Today's reflection question (if any)
  const todayQuestion = useMemo(() => {
    if (!currentDayData) return null;
    if (!currentDayData.reflectionQuestions?.length) return null;
    return {
      question: currentDayData.reflectionQuestions[0],
      dayNumber: currentDayData.dayNumber,
      dayTitle: currentDayData.title,
    };
  }, [currentDayData]);

  // All reflection questions for Go Deeper section
  const reflectionQuestions = useMemo(() => {
    if (!currentDayData?.reflectionQuestions?.length) return [];
    return currentDayData.reflectionQuestions;
  }, [currentDayData]);

  // Check which questions already have responses
  const todayEntry = useMemo(() => {
    if (!currentDevotional) return null;
    return journalEntries.find(
      (e) =>
        e.devotionalId === currentDevotional.id &&
        e.dayNumber === currentDevotional.currentDay
    ) ?? null;
  }, [currentDevotional, journalEntries]);

  const answeredQuestions = useMemo(() => {
    if (!todayEntry?.questionResponses) return new Set<string>();
    return new Set(
      todayEntry.questionResponses
        .filter((qr) => qr.response.trim().length > 0)
        .map((qr) => qr.question)
    );
  }, [todayEntry]);

  const hasExistingEntry = useMemo(() => {
    if (!currentDevotional) return false;
    return journalEntries.some(
      (e) =>
        e.devotionalId === currentDevotional.id &&
        e.dayNumber === currentDevotional.currentDay
    );
  }, [currentDevotional, journalEntries]);

  // First unanswered reflection question for inline prompt
  const firstUnansweredQuestion = useMemo(() => {
    if (!reflectionQuestions.length) return null;
    for (let i = 0; i < reflectionQuestions.length; i++) {
      if (!answeredQuestions.has(reflectionQuestions[i])) {
        return { question: reflectionQuestions[i], index: i };
      }
    }
    return null;
  }, [reflectionQuestions, answeredQuestions]);

  // Relative date formatting
  const formatRelativeDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, []);

  // Filter entries by search query
  const filteredEntries = useMemo(() => {
    const sorted = [...journalEntries].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    if (!searchQuery.trim()) return sorted;
    const query = searchQuery.toLowerCase().trim();
    return sorted.filter((entry) => {
      const devotional = devotionals.find((d) => d.id === entry.devotionalId);
      const day = devotional?.days.find((d) => d.dayNumber === entry.dayNumber);
      const searchableText = [
        entry.content,
        day?.title,
        devotional?.title,
        ...(entry.questionResponses?.map((qr) => `${qr.question} ${qr.response}`) ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchableText.includes(query);
    });
  }, [journalEntries, searchQuery, devotionals]);

  const handleWriteToday = useCallback(() => {
    if (!currentDevotional) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/(tabs)/(today)/journal',
      params: {
        devotionalId: currentDevotional.id,
        dayNumber: String(currentDevotional.currentDay),
      },
    });
  }, [currentDevotional, router]);

  const handleQuestionTap = useCallback(
    (questionIndex: number) => {
      if (!currentDevotional) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: '/(tabs)/(today)/journal',
        params: {
          devotionalId: currentDevotional.id,
          dayNumber: String(currentDevotional.currentDay),
          focusQuestion: String(questionIndex),
        },
      });
    },
    [currentDevotional, router]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header with search toggle */}
          <Animated.View
            entering={FadeIn.duration(700)}
            style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text
              style={{
                fontFamily: FontFamily.display,
                fontSize: 34,
                color: colors.text,
                letterSpacing: -0.5,
              }}
            >
              Journal
            </Text>
            {journalEntries.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setShowSearch(!showSearch);
                  if (showSearch) setSearchQuery('');
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.6}
                style={{ padding: 8 }}
              >
                {showSearch ? (
                  <XIcon size={20} color={colors.textMuted} weight="light" />
                ) : (
                  <MagnifyingGlassIcon size={20} color={colors.textMuted} weight="light" />
                )}
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Search Bar — togglable */}
          {showSearch && (
            <Animated.View
              entering={FadeInDown.duration(300)}
              style={{ paddingHorizontal: 24, marginTop: 4 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.inputBackground,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  gap: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.04,
                  shadowRadius: 4,
                  elevation: 1,
                }}
              >
                <MagnifyingGlassIcon size={16} color={colors.textSubtle} weight="light" />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search entries..."
                  placeholderTextColor={colors.textHint}
                  autoFocus
                  style={{
                    flex: 1,
                    fontFamily: FontFamily.ui,
                    fontSize: 14,
                    color: colors.text,
                    padding: 0,
                  }}
                />
              </View>
            </Animated.View>
          )}

          {/* Today's Reflection Card — redesigned with gradient + inline prompt */}
          {currentDevotional && (
            <Animated.View
              entering={FadeInDown.duration(600).delay(100)}
              style={{ paddingHorizontal: 24, marginTop: 20 }}
            >
              <TouchableOpacity
                onPress={handleWriteToday}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={hasExistingEntry ? 'Continue today\'s reflection' : 'Start today\'s reflection'}
                accessibilityHint="Opens journal editor for today"
              >
                <View
                  style={{
                    backgroundColor: colors.accent + '0D',
                    borderRadius: 20,
                    padding: 24,
                    borderWidth: 1,
                    borderColor: colors.accent + '12',
                    // Elevated reflection card
                    shadowColor: colors.accent,
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.08,
                    shadowRadius: 12,
                    elevation: 3,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <PencilLineIcon size={16} color={colors.accent} weight="light" />
                      <Text
                        style={{
                          fontFamily: FontFamily.mono,
                          fontSize: 11,
                          color: colors.accent,
                          letterSpacing: 1,
                        }}
                      >
                        {hasExistingEntry ? 'CONTINUE' : 'REFLECT'}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 12,
                        color: colors.textSubtle,
                      }}
                    >
                      Day {currentDevotional.currentDay}/{currentDevotional.days.length}
                    </Text>
                  </View>

                  <Text
                    style={{
                      fontFamily: FontFamily.display,
                      fontSize: 20,
                      color: colors.text,
                      letterSpacing: -0.3,
                      marginBottom: 6,
                    }}
                    numberOfLines={2}
                  >
                    {currentDayData?.title ?? `Day ${currentDevotional.currentDay}`}
                  </Text>

                  {currentDayData?.scriptureReference && (
                    <Text
                      style={{
                        fontFamily: FontFamily.bodyItalic,
                        fontSize: 13,
                        color: colors.textMuted,
                        marginBottom: firstUnansweredQuestion ? 14 : 0,
                      }}
                    >
                      {currentDayData.scriptureReference}
                    </Text>
                  )}

                  {/* Inline first reflection question as invitation */}
                  {firstUnansweredQuestion && (
                    <Text
                      style={{
                        fontFamily: FontFamily.bodyItalic,
                        fontSize: 14,
                        color: colors.text,
                        lineHeight: 21,
                        opacity: 0.7,
                      }}
                      numberOfLines={2}
                    >
                      "{firstUnansweredQuestion.question}"
                    </Text>
                  )}

                  {/* Progress bar */}
                  <View
                    style={{
                      height: 2,
                      backgroundColor: colors.border,
                      borderRadius: 1,
                      marginTop: 16,
                    }}
                  >
                    <View
                      style={{
                        height: 2,
                        backgroundColor: colors.accent,
                        borderRadius: 1,
                        width: `${Math.round((currentDevotional.currentDay / currentDevotional.days.length) * 100)}%`,
                      }}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Go Deeper — single invitation, not a checklist */}
          {currentDevotional && firstUnansweredQuestion && reflectionQuestions.length > 1 && (
            <Animated.View
              entering={FadeInDown.duration(600).delay(150)}
              style={{ paddingHorizontal: 24, marginTop: 16 }}
            >
              <TouchableOpacity
                onPress={() => handleQuestionTap(firstUnansweredQuestion.index)}
                activeOpacity={0.7}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    backgroundColor: colors.inputBackground,
                    borderRadius: 12,
                    // Subtle lift
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.04,
                    shadowRadius: 6,
                    elevation: 1,
                  }}
                >
                  <ArrowBendDownRightIcon size={14} color={colors.accent} weight="light" />
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: FontFamily.ui,
                      fontSize: 13,
                      color: colors.textMuted,
                    }}
                  >
                    {reflectionQuestions.length - answeredQuestions.size} more reflection{reflectionQuestions.length - answeredQuestions.size !== 1 ? 's' : ''} to explore
                  </Text>
                  {answeredQuestions.size > 0 && (
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 12,
                        color: colors.accent,
                      }}
                    >
                      {answeredQuestions.size}/{reflectionQuestions.length}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Past Entries */}
          {(journalEntries.length > 0 || !currentDevotional) && (
            <Animated.View
              entering={FadeInDown.duration(600).delay(200)}
              style={{ paddingHorizontal: 24, marginTop: 28 }}
            >
              {journalEntries.length > 0 && (
                <Text
                  style={{
                    fontFamily: FontFamily.mono,
                    fontSize: 11,
                    color: colors.textSubtle,
                    letterSpacing: 1,
                    marginBottom: 16,
                  }}
                >
                  YOUR JOURNEY
                </Text>
              )}

              {journalEntries.length === 0 ? (
                /* Empty state — motivating, not clinical */
                <View
                  style={{
                    borderRadius: 16,
                    padding: 32,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.display,
                      fontSize: 24,
                      color: colors.text,
                      textAlign: 'center',
                      marginBottom: 8,
                    }}
                  >
                    Your story is unfolding.
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: 15,
                      color: colors.textMuted,
                      textAlign: 'center',
                      lineHeight: 22,
                      marginBottom: 24,
                    }}
                  >
                    Each day's reflection becomes a letter{'\n'}to your future self.
                  </Text>
                  {/* Ghost entry preview */}
                  <View
                    style={{
                      width: '100%',
                      backgroundColor: colors.backgroundElevated,
                      borderRadius: 14,
                      padding: 18,
                      opacity: 0.5,
                      borderWidth: 1,
                      borderColor: colors.border,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.04,
                      shadowRadius: 8,
                      elevation: 1,
                    }}
                  >
                    <View style={{ height: 10, width: '70%', backgroundColor: colors.border, borderRadius: 5, marginBottom: 10 }} />
                    <View style={{ height: 10, width: '90%', backgroundColor: colors.border, borderRadius: 5, marginBottom: 10 }} />
                    <View style={{ height: 10, width: '50%', backgroundColor: colors.border, borderRadius: 5 }} />
                  </View>
                </View>
              ) : filteredEntries.length === 0 && searchQuery ? (
                <View
                  style={{
                    borderRadius: 16,
                    padding: 24,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: 15,
                      color: colors.textMuted,
                      textAlign: 'center',
                    }}
                  >
                    No entries match "{searchQuery}"
                  </Text>
                </View>
              ) : (
                filteredEntries.map((entry) => {
                  const devotional = devotionals.find((d) => d.id === entry.devotionalId);
                  const day = devotional?.days.find((d) => d.dayNumber === entry.dayNumber);
                  const answeredCount = entry.questionResponses?.filter(
                    (qr) => qr.response.trim().length > 0
                  ).length ?? 0;
                  return (
                    <TouchableOpacity
                      key={entry.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push({
                          pathname: '/(tabs)/(today)/journal',
                          params: {
                            devotionalId: entry.devotionalId,
                            dayNumber: String(entry.dayNumber),
                          },
                        });
                      }}
                      activeOpacity={0.7}
                    >
                      <View
                        style={{
                          backgroundColor: colors.backgroundElevated,
                          borderRadius: 14,
                          padding: 16,
                          marginBottom: 10,
                          borderWidth: 1,
                          borderColor: colors.border,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.06,
                          shadowRadius: 10,
                          elevation: 2,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text
                            style={{
                              fontFamily: FontFamily.uiMedium,
                              fontSize: 14,
                              color: colors.text,
                              flex: 1,
                            }}
                            numberOfLines={1}
                          >
                            {day?.title ?? `Day ${entry.dayNumber}`}
                          </Text>
                          <Text
                            style={{
                              fontFamily: FontFamily.ui,
                              fontSize: 11,
                              color: colors.textSubtle,
                              marginLeft: 8,
                            }}
                          >
                            {formatRelativeDate(entry.updatedAt)}
                          </Text>
                        </View>
                        {entry.content ? (
                          <Text
                            style={{
                              fontFamily: FontFamily.body,
                              fontSize: 13,
                              color: colors.textMuted,
                              lineHeight: 19,
                            }}
                            numberOfLines={2}
                          >
                            {entry.content}
                          </Text>
                        ) : null}
                        {(answeredCount > 0 || devotional) && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                            {devotional && (
                              <Text
                                style={{
                                  fontFamily: FontFamily.ui,
                                  fontSize: 11,
                                  color: colors.textSubtle,
                                }}
                                numberOfLines={1}
                              >
                                {devotional.title}
                              </Text>
                            )}
                            {answeredCount > 0 && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <CheckCircleIcon size={11} color={colors.accent} weight="fill" />
                                <Text
                                  style={{
                                    fontFamily: FontFamily.ui,
                                    fontSize: 11,
                                    color: colors.accent,
                                  }}
                                >
                                  {answeredCount}
                                </Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
