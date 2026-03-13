import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { logger } from '@/lib/logger';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
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
import {
  XIcon,
  CheckIcon,
  SparkleIcon,
  LockIcon,
  CheckCircleIcon,
  CaretDownIcon,
  CaretUpIcon,
  BookOpenIcon,
  EyeIcon,
  HandsPrayingIcon,
  PencilSimpleIcon,
  PlusIcon,
  CheckCircleIcon as CheckCircleFillIcon,
} from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, JournalMode, SoapResponses } from '@/lib/store';
import { isOnline } from '@/lib/network-error-handler';
import { PERSONA_BRIEF } from '@/constants/persona';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || 'https://unfold-backend-production.up.railway.app';

const SOAP_SECTIONS: { key: keyof SoapResponses; letter: string; label: string; placeholder: string; icon: 'BookOpen' | 'Eye' | 'PencilSimple' | 'HandsPraying' }[] = [
  {
    key: 'scripture',
    letter: 'S',
    label: 'Scripture',
    placeholder: 'Write or paste the verse that stood out to you...',
    icon: 'BookOpen',
  },
  {
    key: 'observation',
    letter: 'O',
    label: 'Observation',
    placeholder: 'What does this passage say? What details do you notice?',
    icon: 'Eye',
  },
  {
    key: 'application',
    letter: 'A',
    label: 'Application',
    placeholder: 'How does this apply to your life right now?',
    icon: 'PencilSimple',
  },
  {
    key: 'prayer',
    letter: 'P',
    label: 'Prayer',
    placeholder: 'Write a prayer response to what you\'ve read...',
    icon: 'HandsPraying',
  },
];

function SoapIcon({ name, size, color }: { name: string; size: number; color: string }) {
  switch (name) {
    case 'BookOpen': return <BookOpenIcon size={size} color={color} weight="light" />;
    case 'Eye': return <EyeIcon size={size} color={color} weight="light" />;
    case 'PencilSimple': return <PencilSimpleIcon size={size} color={color} weight="light" />;
    case 'HandsPraying': return <HandsPrayingIcon size={size} color={color} weight="light" />;
    default: return null;
  }
}

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
  const updateJournalMode = useUnfoldStore((s) => s.updateJournalMode);
  const updateSoapResponse = useUnfoldStore((s) => s.updateSoapResponse);
  const addPrayerRequest = useUnfoldStore((s) => s.addPrayerRequest);
  const togglePrayerAnswered = useUnfoldStore((s) => s.togglePrayerAnswered);
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

  // Journal mode
  const [activeMode, setActiveMode] = useState<JournalMode>(existingEntry?.journalMode ?? 'freewrite');

  // SOAP state
  const [soapValues, setSoapValues] = useState<SoapResponses>(
    existingEntry?.soapResponses ?? { scripture: '', observation: '', application: '', prayer: '' }
  );
  const [expandedSoapSection, setExpandedSoapSection] = useState<keyof SoapResponses | null>(
    existingEntry?.soapResponses ? null : 'scripture'
  );
  const soapInputRefs = useRef<Map<string, TextInput | null>>(new Map());
  const soapSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prayer state
  const [newPrayerText, setNewPrayerText] = useState('');
  const [showPrayerInput, setShowPrayerInput] = useState(false);
  const prayerInputRef = useRef<TextInput>(null);

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

  // Auto-suggest journal mode based on study method (only for new entries)
  useEffect(() => {
    if (existingEntry) return; // Don't override existing entry's mode
    const method = currentDay?.studyMethod;
    if (method === 'soap_journal') {
      setActiveMode('soap');
    }
    // guided mode already the default for reflection questions flow
  }, [currentDay?.studyMethod, existingEntry]);

  // Initialize question responses from existing entry
  useEffect(() => {
    if (existingEntry?.questionResponses) {
      const initial = new Map<number, string>();
      for (const qr of existingEntry.questionResponses) {
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
  }, [existingEntry?.id]);

  // Handle focusQuestion param from journal hub navigation
  useEffect(() => {
    if (focusQuestionIndex != null && currentDay?.reflectionQuestions?.length) {
      setExpandedQuestionIndex(focusQuestionIndex);
      if (deeperPrompts.length === 0 && currentDay.reflectionQuestions.length > 0) {
        setDeeperPrompts(currentDay.reflectionQuestions);
      }
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
    if (focusQuestionIndex == null && activeMode === 'freewrite') {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [focusQuestionIndex, activeMode]);

  // Ensure an entry exists (for SOAP/prayer saves)
  const ensureEntry = useCallback((): string | null => {
    if (savedEntryIdRef.current) return savedEntryIdRef.current;

    addJournalEntry({ devotionalId, dayNumber, content: '', journalMode: activeMode });
    const entry = getJournalEntry(devotionalId, dayNumber);
    if (entry) {
      savedEntryIdRef.current = entry.id;
      return entry.id;
    }
    return null;
  }, [devotionalId, dayNumber, addJournalEntry, getJournalEntry, activeMode]);

  const saveEntry = useCallback((text: string) => {
    if (!text.trim() || !isMountedRef.current) return;

    if (savedEntryIdRef.current) {
      updateJournalEntry(savedEntryIdRef.current, text);
    } else {
      addJournalEntry({
        devotionalId,
        dayNumber,
        content: text,
        journalMode: activeMode,
      });
      const newEntry = getJournalEntry(devotionalId, dayNumber);
      if (newEntry) {
        savedEntryIdRef.current = newEntry.id;
      }
    }
  }, [devotionalId, dayNumber, addJournalEntry, updateJournalEntry, getJournalEntry, activeMode]);

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

  const handleDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (activeMode === 'freewrite') {
      saveEntry(content);
    }
    AccessibilityInfo.announceForAccessibility('Journal entry saved');
    router.back();
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  // Mode switching
  const handleModeSwitch = useCallback((mode: JournalMode) => {
    if (mode === activeMode) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveMode(mode);
    Keyboard.dismiss();

    const entryId = ensureEntry();
    if (entryId) {
      updateJournalMode(entryId, mode);
    }

    if (mode === 'soap' && !expandedSoapSection) {
      setExpandedSoapSection('scripture');
    }
    if (mode === 'freewrite') {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [activeMode, ensureEntry, updateJournalMode, expandedSoapSection]);

  // SOAP handlers
  const handleSoapChange = useCallback((field: keyof SoapResponses, text: string) => {
    setSoapValues((prev) => ({ ...prev, [field]: text }));

    if (soapSaveTimerRef.current) clearTimeout(soapSaveTimerRef.current);
    soapSaveTimerRef.current = setTimeout(() => {
      const entryId = ensureEntry();
      if (entryId) {
        updateSoapResponse(entryId, field, text);
      }
    }, 800);
  }, [ensureEntry, updateSoapResponse]);

  const handleSoapSectionTap = useCallback((field: keyof SoapResponses) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (expandedSoapSection === field) {
      Keyboard.dismiss();
      setExpandedSoapSection(null);
    } else {
      setExpandedSoapSection(field);
      setTimeout(() => {
        soapInputRefs.current.get(field)?.focus();
      }, 350);
    }
  }, [expandedSoapSection]);

  // Prayer handlers
  const handleAddPrayer = useCallback(() => {
    if (!newPrayerText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const entryId = ensureEntry();
    if (entryId) {
      addPrayerRequest(entryId, newPrayerText.trim());
    }
    setNewPrayerText('');
    setShowPrayerInput(false);
  }, [newPrayerText, ensureEntry, addPrayerRequest]);

  const handleTogglePrayer = useCallback((prayerId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const entryId = savedEntryIdRef.current;
    if (entryId) {
      togglePrayerAnswered(entryId, prayerId);
    }
  }, [togglePrayerAnswered]);

  // SOAP completion count
  const soapCompletedCount = useMemo(() => {
    return SOAP_SECTIONS.filter((s) => soapValues[s.key].trim().length > 0).length;
  }, [soapValues]);

  // Save a question response to the store
  const handleQuestionResponseChange = useCallback(
    (index: number, question: string, response: string) => {
      setQuestionResponses((prev) => {
        const next = new Map(prev);
        next.set(index, response);
        return next;
      });

      if (!savedEntryIdRef.current) {
        if (!content.trim()) {
          addJournalEntry({ devotionalId, dayNumber, content: '', journalMode: activeMode });
          const newEntry = getJournalEntry(devotionalId, dayNumber);
          if (newEntry) {
            savedEntryIdRef.current = newEntry.id;
          }
        } else {
          saveEntry(content);
        }
      }

      if (savedEntryIdRef.current) {
        updateQuestionResponse(savedEntryIdRef.current, question, response);
      }
    },
    [content, devotionalId, dayNumber, addJournalEntry, getJournalEntry, saveEntry, updateQuestionResponse, activeMode]
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

  const allQuestions = useMemo(() => {
    if (deeperPrompts.length > 0) return deeperPrompts;
    return [];
  }, [deeperPrompts]);

  const answeredCount = useMemo(() => {
    let count = 0;
    for (const [, response] of questionResponses) {
      if (response.trim().length > 0) count++;
    }
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
      const local = questionResponses.get(index);
      if (local != null) return local;
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

  const showDeeperButton = activeMode === 'freewrite' && content.trim().length >= 10 && deeperPrompts.length === 0 && focusQuestionIndex == null;

  // Prayer requests from existing entry
  const prayerRequests = existingEntry?.prayerRequests ?? [];

  return (
    <TouchableOpacity activeOpacity={1} style={{ flex: 1, backgroundColor: colors.background }} onPress={Keyboard.dismiss}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
            <TouchableOpacity
              onPress={handleSkip}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Close journal"
              style={{ padding: 8 }}
            >
              <XIcon size={22} color={colors.textMuted} weight="light" />
            </TouchableOpacity>

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

            <TouchableOpacity
              onPress={handleDone}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Save journal entry"
              style={{ padding: 8 }}
            >
              <CheckIcon size={22} color={content.trim() || soapCompletedCount > 0 ? colors.text : colors.textHint} weight="bold" />
            </TouchableOpacity>
          </View>

          {/* Mode Selector */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 24, marginBottom: 8, gap: 0 }}>
            {([
              { mode: 'freewrite' as JournalMode, label: 'Free Write' },
              { mode: 'soap' as JournalMode, label: 'SOAP' },
            ]).map(({ mode, label }) => (
              <TouchableOpacity
                key={mode}
                onPress={() => handleModeSwitch(mode)}
                activeOpacity={0.7}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderBottomWidth: 2,
                  borderBottomColor: activeMode === mode ? colors.accent : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontFamily: activeMode === mode ? FontFamily.uiMedium : FontFamily.ui,
                    fontSize: 13,
                    color: activeMode === mode ? colors.text : colors.textSubtle,
                    letterSpacing: 0.3,
                  }}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          <ScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Scripture anchor — connects the blank page to today's content */}
            {currentDay && (
              <Animated.View entering={FadeIn.duration(400)}>
                <View
                  style={{
                    marginBottom: 24,
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
              </Animated.View>
            )}

            {/* ===== FREE WRITE MODE ===== */}
            {activeMode === 'freewrite' && (
              <>
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
                      marginBottom: 32,
                    }}
                  >
                    Take a moment to reflect. This is just for you.
                  </Text>
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

                {/* Go Deeper button */}
                {showDeeperButton && (
                  <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 24 }}>
                    <TouchableOpacity
                      onPress={handleGoDeeper}
                      disabled={loadingDeeper}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={isPremium ? "Go deeper" : "Go deeper, premium feature"}
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
                    </TouchableOpacity>
                  </Animated.View>
                )}

                {/* Error state */}
                {deeperError && (
                  <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 24, alignItems: 'center' }}>
                    <TouchableOpacity onPress={handleGoDeeper} activeOpacity={0.6}>
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
                    </TouchableOpacity>
                  </Animated.View>
                )}

                {/* Deeper prompts */}
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
                          <TouchableOpacity
                            onPress={() => handleToggleQuestion(index)}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={`Reflection prompt ${index + 1}: ${prompt}`}
                            accessibilityState={{ expanded: isExpanded }}
                            style={{
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
                          </TouchableOpacity>

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

                          {!isExpanded && isAnswered && (
                            <Animated.View
                              entering={FadeIn.duration(200)}
                              style={{ marginLeft: 40, marginTop: 6 }}
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
              </>
            )}

            {/* ===== SOAP MODE ===== */}
            {activeMode === 'soap' && (
              <Animated.View entering={FadeIn.duration(400)}>
                <Text
                  style={{
                    fontFamily: FontFamily.display,
                    fontSize: 28,
                    color: colors.text,
                    marginBottom: 4,
                  }}
                >
                  SOAP Journal
                </Text>
                <Text
                  style={{
                    fontFamily: FontFamily.body,
                    fontSize: 14,
                    color: colors.textMuted,
                    marginBottom: 8,
                  }}
                >
                  Scripture, Observation, Application, Prayer
                </Text>

                {/* SOAP progress */}
                <View style={{ flexDirection: 'row', gap: 4, marginBottom: 28 }}>
                  {SOAP_SECTIONS.map((section) => (
                    <View
                      key={section.key}
                      style={{
                        flex: 1,
                        height: 3,
                        borderRadius: 1.5,
                        backgroundColor: soapValues[section.key].trim()
                          ? colors.accent
                          : colors.border,
                      }}
                    />
                  ))}
                </View>

                {/* SOAP Sections */}
                {SOAP_SECTIONS.map((section, idx) => {
                  const isExpanded = expandedSoapSection === section.key;
                  const hasContent = soapValues[section.key].trim().length > 0;

                  return (
                    <Animated.View
                      key={section.key}
                      entering={FadeInDown.duration(400).delay(idx * 80)}
                      style={{ marginBottom: isExpanded ? 20 : 12 }}
                    >
                      <TouchableOpacity
                        onPress={() => handleSoapSectionTap(section.key)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`${section.label} section`}
                        accessibilityState={{ expanded: isExpanded }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 12,
                          paddingHorizontal: 14,
                          borderRadius: 12,
                          backgroundColor: isExpanded
                            ? colors.accent + '0A'
                            : hasContent
                            ? colors.accent + '06'
                            : 'transparent',
                          borderWidth: 1,
                          borderColor: isExpanded
                            ? colors.accent + '30'
                            : hasContent
                            ? colors.accent + '15'
                            : colors.border + '60',
                        }}
                      >
                        {/* Letter badge */}
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            backgroundColor: hasContent ? colors.accent : colors.border + '80',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 12,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: FontFamily.uiMedium,
                              fontSize: 14,
                              color: hasContent ? '#fff' : colors.textSubtle,
                            }}
                          >
                            {section.letter}
                          </Text>
                        </View>

                        <SoapIcon name={section.icon} size={16} color={hasContent ? colors.accent : colors.textSubtle} />

                        <Text
                          style={{
                            flex: 1,
                            fontFamily: FontFamily.uiMedium,
                            fontSize: 15,
                            color: colors.text,
                            marginLeft: 10,
                          }}
                        >
                          {section.label}
                        </Text>

                        {hasContent && !isExpanded && (
                          <CheckCircleIcon size={16} color={colors.accent} weight="fill" />
                        )}
                      </TouchableOpacity>

                      {/* Expanded input */}
                      {isExpanded && (
                        <Animated.View
                          entering={FadeInDown.duration(250)}
                          style={{ marginTop: 10, paddingHorizontal: 4 }}
                        >
                          <View
                            style={{
                              backgroundColor: colors.inputBackground,
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: colors.accent + '30',
                              padding: 14,
                            }}
                          >
                            <TextInput
                              ref={(ref) => { soapInputRefs.current.set(section.key, ref); }}
                              value={soapValues[section.key]}
                              onChangeText={(text) => handleSoapChange(section.key, text)}
                              placeholder={section.placeholder}
                              placeholderTextColor={colors.textHint}
                              multiline
                              textAlignVertical="top"
                              accessibilityLabel={`${section.label} journal entry`}
                              style={{
                                minHeight: 100,
                                fontFamily: FontFamily.body,
                                fontSize: 15,
                                color: colors.text,
                                lineHeight: 24,
                                padding: 0,
                              }}
                            />
                          </View>
                          <Text
                            style={{
                              fontFamily: FontFamily.ui,
                              fontSize: 11,
                              color: colors.textHint,
                              marginTop: 6,
                              textAlign: 'right',
                            }}
                          >
                            Auto-saved
                          </Text>
                        </Animated.View>
                      )}

                      {/* Collapsed preview */}
                      {!isExpanded && hasContent && (
                        <Text
                          style={{
                            fontFamily: FontFamily.body,
                            fontSize: 13,
                            color: colors.textMuted,
                            lineHeight: 19,
                            marginTop: 6,
                            marginLeft: 54,
                            marginRight: 8,
                          }}
                          numberOfLines={2}
                        >
                          {soapValues[section.key]}
                        </Text>
                      )}
                    </Animated.View>
                  );
                })}

                {/* SOAP completion message */}
                {soapCompletedCount === 4 && (
                  <Animated.View
                    entering={FadeIn.duration(400)}
                    style={{ alignItems: 'center', marginTop: 16 }}
                  >
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 13,
                        color: colors.accent,
                      }}
                    >
                      Beautiful reflection. All sections complete.
                    </Text>
                  </Animated.View>
                )}
              </Animated.View>
            )}

            {/* ===== PRAYER REQUESTS SECTION ===== */}
            <Animated.View
              entering={FadeIn.duration(400).delay(400)}
              style={{ marginTop: activeMode === 'soap' ? 32 : allQuestions.length > 0 ? 0 : 40 }}
            >
              {/* Divider */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 20,
                }}
              >
                <View style={{ flex: 1, height: 0.5, backgroundColor: colors.textMuted, opacity: 0.15 }} />
                <HandsPrayingIcon size={14} color={colors.accent} weight="light" style={{ marginHorizontal: 12 }} />
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 10,
                    color: colors.accent,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    opacity: 0.75,
                  }}
                >
                  Prayer Requests
                </Text>
                <View style={{ flex: 1, height: 0.5, backgroundColor: colors.textMuted, opacity: 0.15, marginLeft: 12 }} />
              </View>

              {/* Existing prayer requests */}
              {prayerRequests.map((prayer) => (
                <Animated.View
                  key={prayer.id}
                  entering={FadeIn.duration(300)}
                  style={{ marginBottom: 10 }}
                >
                  <TouchableOpacity
                    onPress={() => handleTogglePrayer(prayer.id)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 10,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      backgroundColor: prayer.isAnswered ? colors.accent + '08' : 'transparent',
                      borderWidth: 1,
                      borderColor: prayer.isAnswered ? colors.accent + '20' : colors.border + '40',
                    }}
                  >
                    <View style={{ marginTop: 2 }}>
                      {prayer.isAnswered ? (
                        <CheckCircleFillIcon size={18} color={colors.accent} weight="fill" />
                      ) : (
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            borderWidth: 1.5,
                            borderColor: colors.textHint,
                          }}
                        />
                      )}
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: FontFamily.body,
                        fontSize: 14,
                        color: prayer.isAnswered ? colors.textMuted : colors.text,
                        lineHeight: 21,
                        textDecorationLine: prayer.isAnswered ? 'line-through' : 'none',
                      }}
                    >
                      {prayer.text}
                    </Text>
                    {prayer.isAnswered && (
                      <Text
                        style={{
                          fontFamily: FontFamily.ui,
                          fontSize: 10,
                          color: colors.accent,
                          letterSpacing: 0.5,
                          marginTop: 3,
                        }}
                      >
                        Answered
                      </Text>
                    )}
                  </TouchableOpacity>
                </Animated.View>
              ))}

              {/* Add prayer input */}
              {showPrayerInput ? (
                <Animated.View entering={FadeInDown.duration(250)} style={{ marginTop: 4 }}>
                  <View
                    style={{
                      backgroundColor: colors.inputBackground,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.accent + '30',
                      padding: 12,
                      flexDirection: 'row',
                      alignItems: 'flex-end',
                      gap: 10,
                    }}
                  >
                    <TextInput
                      ref={prayerInputRef}
                      value={newPrayerText}
                      onChangeText={setNewPrayerText}
                      placeholder="What would you like to pray for?"
                      placeholderTextColor={colors.textHint}
                      multiline
                      textAlignVertical="top"
                      autoFocus
                      style={{
                        flex: 1,
                        minHeight: 44,
                        fontFamily: FontFamily.body,
                        fontSize: 14,
                        color: colors.text,
                        lineHeight: 21,
                        padding: 0,
                      }}
                    />
                    <TouchableOpacity
                      onPress={handleAddPrayer}
                      activeOpacity={0.6}
                      disabled={!newPrayerText.trim()}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: newPrayerText.trim() ? colors.accent : colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CheckIcon size={16} color={newPrayerText.trim() ? '#fff' : colors.textHint} weight="bold" />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    onPress={() => { setShowPrayerInput(false); setNewPrayerText(''); }}
                    activeOpacity={0.6}
                    style={{ alignSelf: 'center', marginTop: 8 }}
                  >
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 12,
                        color: colors.textSubtle,
                      }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowPrayerInput(true);
                  }}
                  activeOpacity={0.6}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 12,
                    marginTop: 4,
                  }}
                >
                  <PlusIcon size={14} color={colors.textSubtle} weight="light" />
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 13,
                      color: colors.textSubtle,
                    }}
                  >
                    Add a prayer request
                  </Text>
                </TouchableOpacity>
              )}
            </Animated.View>
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
    </TouchableOpacity>
  );
}
