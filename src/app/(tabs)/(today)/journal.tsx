import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { logger } from '@/lib/logger';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  ActivityIndicator,
  AccessibilityInfo,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { XIcon, CheckIcon, SparkleIcon, LockIcon, CheckCircleIcon, CaretDownIcon, CaretUpIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { isOnline } from '@/lib/network-error-handler';
import { PERSONA_BRIEF } from '@/constants/persona';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || 'https://unfold-backend-production.up.railway.app';

export default function JournalScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ devotionalId: string; dayNumber: string; focusQuestion?: string }>();

  const devotionalId = params.devotionalId ?? '';
  const dayNumber = parseInt(params.dayNumber ?? '1', 10);
  const focusQuestionIndex = params.focusQuestion != null ? parseInt(params.focusQuestion, 10) : null;

  const getJournalEntry = useUnfoldStore((s) => s.getJournalEntry);
  const addJournalEntry = useUnfoldStore((s) => s.addJournalEntry);
  const updateJournalEntry = useUnfoldStore((s) => s.updateJournalEntry);
  const updateQuestionResponse = useUnfoldStore((s) => s.updateQuestionResponse);
  const setResumeContext = useUnfoldStore((s) => s.setResumeContext);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const isPremium = useUnfoldStore((s) => s.user?.isPremium ?? false);

  const existingEntry = getJournalEntry(devotionalId, dayNumber);
  const [content, setContent] = useState(existingEntry?.content ?? '');
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savedEntryIdRef = useRef<string | null>(existingEntry?.id ?? null);
  const isMountedRef = useRef(true);

  // Go Deeper state
  const [deeperPrompts, setDeeperPrompts] = useState<string[]>([]);
  const [loadingDeeper, setLoadingDeeper] = useState(false);
  const [deeperError, setDeeperError] = useState(false);

  const [showPremiumSheet, setShowPremiumSheet] = useState(false);

  // Expandable question response state
  const [expandedQuestionIndex, setExpandedQuestionIndex] = useState<number | null>(null);
  const [questionResponses, setQuestionResponses] = useState<Map<number, string>>(new Map());
  const questionInputRefs = useRef<Map<number, TextInput | null>>(new Map());

  const inputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Track refs for unmount save
  const contentRef = useRef(content);
  contentRef.current = content;
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;

  // Get devotional context
  const currentDevotional = devotionals.find((d) => d.id === devotionalId);
  const currentDay = currentDevotional?.days.find((d) => d.dayNumber === dayNumber);

  // Initialize question responses from existing entry
  useEffect(() => {
    if (existingEntry?.questionResponses) {
      const initial = new Map<number, string>();
      for (const qr of existingEntry.questionResponses) {
        // Find the index of this question in deeperPrompts or reflectionQuestions
        const allQuestions = [
          ...(currentDay?.reflectionQuestions ?? []),
          ...deeperPrompts,
        ];
        const idx = allQuestions.findIndex((q) => q === qr.question);
        if (idx >= 0) {
          initial.set(idx, qr.response);
        }
      }
      if (initial.size > 0) {
        setQuestionResponses(initial);
      }
    }
  }, [existingEntry?.id]); // Only run when entry changes

  // Handle focusQuestion param from journal hub navigation
  useEffect(() => {
    if (focusQuestionIndex != null && currentDay?.reflectionQuestions?.length) {
      // Auto-expand the focused question
      setExpandedQuestionIndex(focusQuestionIndex);
      // Pre-populate deeper prompts with reflection questions if they exist
      if (deeperPrompts.length === 0 && currentDay.reflectionQuestions.length > 0) {
        setDeeperPrompts(currentDay.reflectionQuestions);
      }
      // Focus the question input after a delay
      setTimeout(() => {
        const ref = questionInputRefs.current.get(focusQuestionIndex);
        if (ref) {
          ref.focus();
        }
      }, 600);
    }
  }, [focusQuestionIndex, currentDay?.reflectionQuestions]);

  useEffect(() => {
    if (!devotionalId || Number.isNaN(dayNumber)) return;

    setResumeContext({
      route: 'journal',
      devotionalId,
      dayNumber,
      devotionalTitle: currentDevotional?.title,
      dayTitle: currentDay?.title,
      touchedAt: new Date().toISOString(),
    });
  }, [devotionalId, dayNumber, currentDevotional?.title, currentDay?.title, setResumeContext]);

  useEffect(() => {
    // Only auto-focus main input if not coming from a focusQuestion nav
    if (focusQuestionIndex == null) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [focusQuestionIndex]);

  const saveEntry = useCallback((text: string) => {
    if (!text.trim() || !isMountedRef.current) return;

    if (savedEntryIdRef.current) {
      updateJournalEntry(savedEntryIdRef.current, text);
    } else {
      addJournalEntry({
        devotionalId,
        dayNumber,
        content: text,
      });
      const newEntry = getJournalEntry(devotionalId, dayNumber);
      if (newEntry) {
        savedEntryIdRef.current = newEntry.id;
      }
    }
  }, [devotionalId, dayNumber, addJournalEntry, updateJournalEntry, getJournalEntry]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (hasChangesRef.current && contentRef.current.trim()) {
        saveEntry(contentRef.current);
      }
    };
  }, [saveEntry]);

  useEffect(() => {
    if (!hasChanges || isSaving) return;

    const timer = setTimeout(() => {
      if (!isMountedRef.current) return;

      setIsSaving(true);
      saveEntry(content);

      if (isMountedRef.current) {
        setIsSaving(false);
        setHasChanges(false);
        setJustSaved(true);
        setTimeout(() => {
          if (isMountedRef.current) setJustSaved(false);
        }, 2000);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [content, hasChanges, isSaving, saveEntry]);

  const handleTextChange = (text: string) => {
    setContent(text);
    setHasChanges(true);
  };

  const handleSpeechTranscript = (transcript: string) => {
    if (!transcript.trim()) return;
    const separator = content.trim() ? ' ' : '';
    const newContent = content + separator + transcript;
    setContent(newContent);
    setHasChanges(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    saveEntry(content);
    AccessibilityInfo.announceForAccessibility('Journal entry saved');
    router.back();
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  // Save a question response to the store
  const handleQuestionResponseChange = useCallback(
    (index: number, question: string, response: string) => {
      setQuestionResponses((prev) => {
        const next = new Map(prev);
        next.set(index, response);
        return next;
      });

      // Ensure we have a saved entry to attach responses to
      if (!savedEntryIdRef.current) {
        // Create entry first if it doesn't exist
        if (!content.trim()) {
          // Use a placeholder so the entry exists
          addJournalEntry({
            devotionalId,
            dayNumber,
            content: '',
          });
          const newEntry = getJournalEntry(devotionalId, dayNumber);
          if (newEntry) {
            savedEntryIdRef.current = newEntry.id;
          }
        } else {
          saveEntry(content);
        }
      }

      // Debounce the store update
      if (savedEntryIdRef.current) {
        updateQuestionResponse(savedEntryIdRef.current, question, response);
      }
    },
    [content, devotionalId, dayNumber, addJournalEntry, getJournalEntry, saveEntry, updateQuestionResponse]
  );

  const handleToggleQuestion = useCallback(
    (index: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (expandedQuestionIndex === index) {
        Keyboard.dismiss();
        setExpandedQuestionIndex(null);
      } else {
        setExpandedQuestionIndex(index);
        setTimeout(() => {
          const ref = questionInputRefs.current.get(index);
          if (ref) {
            ref.focus();
          }
        }, 300);
      }
    },
    [expandedQuestionIndex]
  );

  // Build the combined list of all questions (reflection + AI-generated)
  const allQuestions = useMemo(() => {
    // If deeper prompts are set, use those (they may include reflection questions)
    if (deeperPrompts.length > 0) return deeperPrompts;
    return [];
  }, [deeperPrompts]);

  // Count answered questions
  const answeredCount = useMemo(() => {
    let count = 0;
    for (const [, response] of questionResponses) {
      if (response.trim().length > 0) count++;
    }
    // Also count from existing entry
    if (existingEntry?.questionResponses) {
      for (const qr of existingEntry.questionResponses) {
        const idx = allQuestions.findIndex((q) => q === qr.question);
        if (idx >= 0 && !questionResponses.has(idx) && qr.response.trim().length > 0) {
          count++;
        }
      }
    }
    return count;
  }, [questionResponses, existingEntry, allQuestions]);

  const getResponseForQuestion = useCallback(
    (index: number, question: string): string => {
      // Check local state first
      const local = questionResponses.get(index);
      if (local != null) return local;
      // Fall back to persisted entry
      if (existingEntry?.questionResponses) {
        const persisted = existingEntry.questionResponses.find((qr) => qr.question === question);
        if (persisted) return persisted.response;
      }
      return '';
    },
    [questionResponses, existingEntry]
  );

  const handleGoDeeper = async () => {
    if (loadingDeeper) return;

    if (!isPremium) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setShowPremiumSheet(true);
      return;
    }

    if (content.trim().length < 10) return;

    const online = await isOnline();
    if (!online) {
      setDeeperError(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Keyboard.dismiss();
    setLoadingDeeper(true);
    setDeeperError(false);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const systemPrompt = `${PERSONA_BRIEF}

WHAT YOU'RE DOING: Generate exactly 3 follow-up reflection prompts based on someone's journal entry about their devotional.

QUALITY:
- Each prompt MUST reference something specific from their entry — never generic
- Read their words: what emotion is underneath? What are they circling around but haven't named?

STRUCTURE (vary across these 3 approaches):
1. FEELING — explores the emotion beneath their words ("What does it feel like when..." / "Where do you feel that in your body?")
2. LIFE — connects the devotional insight to a concrete moment in their daily life
3. IMAGINATION — invites prayer or "what if" thinking ("If Jesus were sitting with you right now..." / "What would change if you believed this?")

RULES:
- 1-2 sentences each
- Never assume you know their situation — ask, don't tell
- Vary sentence structure and openings

RESPOND WITH ONLY A JSON ARRAY OF EXACTLY 3 STRINGS. No other text, no markdown wrapping.`;

      const userMessage = `Devotional: "${currentDevotional?.title ?? 'Devotional'}"
Day: "${currentDay?.title ?? `Day ${dayNumber}`}"
Scripture: ${currentDay?.scriptureReference ?? 'N/A'}

Their journal entry:
"${content}"`;

      const response = await fetch(`${BACKEND_URL}/api/generate/go-deeper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'grok-4-1-fast-non-reasoning',
          max_tokens: 400,
          temperature: 0.8,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        logger.error('[Go Deeper] Backend error:', response.status, errBody);
        throw new Error(`Backend ${response.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await response.json();
      logger.log('[Go Deeper] Backend response:', JSON.stringify(data).slice(0, 300));

      // Backend may return { content: [{ text: "..." }] } or direct array
      let parsed: string[];
      if (Array.isArray(data)) {
        parsed = data;
      } else {
        const text = data?.content?.[0]?.text ?? data?.text ?? (typeof data === 'string' ? data : null);
        if (!text) throw new Error('Empty response from backend');

        try {
          parsed = JSON.parse(text);
        } catch {
          const match = text.match(/\[[\s\S]*\]/);
          if (match) parsed = JSON.parse(match[0]);
          else throw new Error('Could not parse response');
        }
      }

      if (Array.isArray(parsed) && parsed.length > 0) {
        setDeeperPrompts(parsed.slice(0, 3));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      logger.error('Go Deeper error:', error);
      setDeeperError(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoadingDeeper(false);
    }
  };

  const showDeeperButton = content.trim().length >= 10 && deeperPrompts.length === 0 && focusQuestionIndex == null;

  return (
    <Pressable style={{ flex: 1, backgroundColor: colors.background }} onPress={Keyboard.dismiss}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
            <Pressable
              onPress={handleSkip}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close journal"
              accessibilityHint="Close without saving changes"
              style={{ padding: 8 }}
            >
              <XIcon size={22} color={colors.textMuted} weight="light" />
            </Pressable>

            <Text
              style={{
                fontFamily: FontFamily.mono,
                fontSize: 12,
                color: colors.textSubtle,
                letterSpacing: 1,
              }}
            >
              DAY {dayNumber}
            </Text>

            <Pressable
              onPress={handleDone}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Save journal entry"
              accessibilityHint="Saves your reflection and closes"
              accessibilityState={{ disabled: !content.trim() }}
              style={{ padding: 8 }}
            >
              <CheckIcon size={22} color={content.trim() ? colors.text : colors.textHint} weight="bold" />
            </Pressable>
          </View>

          {/* Content */}
          <ScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View entering={FadeIn.duration(400)}>
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 28,
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                What's stirring?
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: 15,
                  color: colors.textMuted,
                  marginBottom: currentDay?.scriptureReference ? 16 : 32,
                }}
              >
                Take a moment to reflect. This is just for you.
              </Text>

              {/* Scripture anchor — connects the blank page to today's content */}
              {currentDay && (
                <View
                  style={{
                    marginBottom: 32,
                    paddingLeft: 12,
                    borderLeftWidth: 2,
                    borderLeftColor: colors.accent + '40',
                    borderRadius: 1,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.bodyItalic,
                      fontSize: 14,
                      color: colors.textMuted,
                      lineHeight: 20,
                    }}
                  >
                    {currentDay.title}
                    {currentDay.scriptureReference ? ` — ${currentDay.scriptureReference}` : ''}
                  </Text>
                </View>
              )}
            </Animated.View>

            <Animated.View entering={FadeIn.duration(400).delay(200)}>
              <TextInput
                ref={inputRef}
                value={content}
                onChangeText={handleTextChange}
                placeholder={currentDay?.reflectionQuestions?.[0] ?? "Write your thoughts..."}
                placeholderTextColor={colors.textHint}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Journal entry"
                accessibilityHint="Write your reflection on today's reading"
                style={{
                  minHeight: 160,
                  fontFamily: FontFamily.mono,
                  fontSize: 16,
                  color: colors.text,
                  lineHeight: 26,
                  paddingTop: 0,
                }}
              />
            </Animated.View>

            {/* Voice input removed — keyboard mic is sufficient */}

            {/* Go Deeper button */}
            {showDeeperButton && (
              <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 24 }}>
                <Pressable
                  onPress={handleGoDeeper}
                  disabled={loadingDeeper}
                  accessibilityRole="button"
                  accessibilityLabel={isPremium ? "Go deeper" : "Go deeper, premium feature"}
                  accessibilityHint={isPremium ? "Get AI-generated reflection prompts based on your writing" : "Premium feature. Opens upgrade options"}
                  accessibilityState={{ disabled: loadingDeeper || !isPremium }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 14,
                    paddingHorizontal: 24,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.accent,
                    backgroundColor: 'transparent',
                    alignSelf: 'center',
                    opacity: loadingDeeper ? 0.6 : 0.9,
                  }}
                >
                  {loadingDeeper ? (
                    <>
                      <ActivityIndicator size="small" color={colors.accent} />
                      <Text
                        style={{
                          fontFamily: FontFamily.uiMedium,
                          fontSize: 14,
                          color: colors.accent,
                        }}
                      >
                        Reflecting...
                      </Text>
                    </>
                  ) : (
                    <>
                      {isPremium ? (
                        <SparkleIcon size={16} color={colors.accent} weight="light" />
                      ) : (
                        <LockIcon size={14} color={colors.accent} weight="light" />
                      )}
                      <Text
                        style={{
                          fontFamily: FontFamily.uiMedium,
                          fontSize: 14,
                          color: colors.accent,
                        }}
                      >
                        Go Deeper
                      </Text>
                    </>
                  )}
                </Pressable>
              </Animated.View>
            )}

            {/* Error state */}
            {deeperError && (
              <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 24, alignItems: 'center' }}>
                <Pressable onPress={handleGoDeeper}>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 13,
                      color: colors.textMuted,
                      textAlign: 'center',
                    }}
                  >
                    Couldn't generate prompts. Tap to try again.
                  </Text>
                </Pressable>
              </Animated.View>
            )}

            {/* Deeper prompts — now interactive with expandable responses */}
            {allQuestions.length > 0 && (
              <Animated.View entering={FadeInDown.duration(500)} style={{ marginTop: 32, marginBottom: 32 }}>
                <View
                  style={{
                    width: 24,
                    height: 1.5,
                    backgroundColor: colors.accent,
                    marginBottom: 20,
                    borderRadius: 1,
                  }}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.mono,
                      fontSize: 11,
                      color: colors.accent,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      opacity: 0.8,
                    }}
                  >
                    Go Deeper
                  </Text>
                  {allQuestions.length > 0 && (
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 12,
                        color: answeredCount === allQuestions.length ? colors.accent : colors.textSubtle,
                      }}
                      accessibilityLabel={`${answeredCount} of ${allQuestions.length} reflections complete`}
                    >
                      {answeredCount} of {allQuestions.length} complete
                    </Text>
                  )}
                </View>

                {allQuestions.map((prompt, index) => {
                  const isExpanded = expandedQuestionIndex === index;
                  const responseText = getResponseForQuestion(index, prompt);
                  const isAnswered = responseText.trim().length > 0;

                  return (
                    <Animated.View
                      key={`q-${index}`}
                      entering={FadeInDown.duration(400).delay(index * 100)}
                      style={{ marginBottom: 14 }}
                    >
                      {/* Question row — tappable to expand */}
                      <Pressable
                        onPress={() => handleToggleQuestion(index)}
                        accessibilityRole="button"
                        accessibilityLabel={`Reflection prompt ${index + 1}: ${prompt}`}
                        accessibilityHint={isExpanded ? 'Tap to collapse' : 'Tap to write a response'}
                        accessibilityState={{ expanded: isExpanded }}
                        style={{
                          opacity: 1,
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          paddingLeft: 14,
                          borderLeftWidth: 2,
                          borderLeftColor: isAnswered ? colors.accent : colors.border,
                          gap: 10,
                        }}
                      >
                        <View style={{ marginTop: 3 }}>
                          {isAnswered ? (
                            <CheckCircleIcon size={16} color={colors.accent} weight="fill" />
                          ) : isExpanded ? (
                            <CaretUpIcon size={14} color={colors.textSubtle} weight="light" />
                          ) : (
                            <CaretDownIcon size={14} color={colors.textSubtle} weight="light" />
                          )}
                        </View>
                        <Text
                          style={{
                            flex: 1,
                            fontFamily: FontFamily.bodyItalic,
                            fontSize: 15,
                            color: colors.text,
                            lineHeight: 24,
                          }}
                        >
                          {prompt}
                        </Text>
                      </Pressable>

                      {/* Expandable response area */}
                      {isExpanded && (
                        <Animated.View
                          entering={FadeInDown.duration(250)}
                          style={{
                            marginLeft: 14,
                            marginTop: 10,
                            paddingLeft: 14,
                            borderLeftWidth: 2,
                            borderLeftColor: 'transparent',
                          }}
                        >
                          <View
                            style={{
                              backgroundColor: colors.inputBackground,
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: colors.borderFocused,
                              padding: 14,
                            }}
                          >
                            <TextInput
                              ref={(ref) => {
                                questionInputRefs.current.set(index, ref);
                              }}
                              value={responseText}
                              onChangeText={(text) => handleQuestionResponseChange(index, prompt, text)}
                              placeholder="Write your response..."
                              placeholderTextColor={colors.textHint}
                              multiline
                              textAlignVertical="top"
                              accessibilityLabel={`Response to: ${prompt}`}
                              accessibilityHint="Write your reflection response"
                              style={{
                                minHeight: 80,
                                fontFamily: FontFamily.body,
                                fontSize: 15,
                                color: colors.text,
                                lineHeight: 24,
                                padding: 0,
                              }}
                            />
                          </View>
                        </Animated.View>
                      )}

                      {/* Show collapsed response preview if answered but not expanded */}
                      {!isExpanded && isAnswered && (
                        <Animated.View
                          entering={FadeIn.duration(200)}
                          style={{
                            marginLeft: 40,
                            marginTop: 6,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: FontFamily.body,
                              fontSize: 13,
                              color: colors.textMuted,
                              lineHeight: 20,
                            }}
                            numberOfLines={2}
                          >
                            {responseText}
                          </Text>
                        </Animated.View>
                      )}
                    </Animated.View>
                  );
                })}
              </Animated.View>
            )}
          </ScrollView>

          {/* Bottom hint — crossfade between states */}
          <Animated.View
            entering={FadeIn.duration(400).delay(400)}
            style={{
              paddingHorizontal: 24,
              paddingBottom: 24,
              alignItems: 'center',
            }}
          >
            <Animated.Text
              key={hasChanges ? 'saving' : justSaved ? 'saved' : 'idle'}
              entering={FadeIn.duration(300)}
              exiting={FadeOut.duration(200)}
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 13,
                color: justSaved ? colors.accent : colors.textHint,
                textAlign: 'center',
              }}
            >
              {hasChanges ? 'Saving...' : justSaved ? 'Saved' : 'Your response is saved automatically'}
            </Animated.Text>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <PremiumFeatureSheet
        visible={showPremiumSheet}
        onClose={() => setShowPremiumSheet(false)}
        feature="journal"
      />
    </Pressable>
  );
}
