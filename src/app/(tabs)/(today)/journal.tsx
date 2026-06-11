import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { logger } from '@/lib/logger';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Keyboard,
  ScrollView,
  ActivityIndicator,
  AccessibilityInfo,
  StyleSheet,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter, useLocalSearchParams, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  interpolateColor,
  useReducedMotion,
} from 'react-native-reanimated';
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
  ArrowRightIcon,
  EyeIcon,
  HandsPrayingIcon,
  PencilSimpleIcon,
  PlusIcon,
} from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, JournalMode, SoapResponses } from '@/lib/store';
import { isOnline } from '@/lib/network-error-handler';
import { PERSONA_BRIEF } from '@/constants/persona';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { PRIMARY_BACKEND_URL, getAuthHeaders, sanitizeForPrompt } from '@/lib/api-config';
import { checkRateLimit, incrementRateLimit } from '@/lib/rate-limit';
import { VoiceInputBar } from '@/components/VoiceInputBar';
import { alpha } from '@/components/ui';
import { buildFreeWritePlaceholder } from '@/lib/journal-freewrite-placeholder';
import { buildInitialQuestionResponses, diffSoapWrites, resolveInitialJournalMode } from '@/lib/journal-entry-state';
import { useCreationGate } from '@/hooks/useCreationGate';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';

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

/** Animated prayer circle — fills with accent color + checkmark when answered */
function AnimatedPrayerCircle({ isAnswered, accentColor, hintColor }: {
  isAnswered: boolean;
  accentColor: string;
  hintColor: string;
}) {
  const fillProgress = useSharedValue(isAnswered ? 1 : 0);
  const checkScale = useSharedValue(isAnswered ? 1 : 0);

  useEffect(() => {
    if (isAnswered) {
      fillProgress.value = withTiming(1, { duration: Duration.slow });
      checkScale.value = withDelay(100, withSpring(1, { damping: 25, stiffness: 300, mass: 0.5 }));
    } else {
      fillProgress.value = withTiming(0, { duration: Duration.normal });
      checkScale.value = withTiming(0, { duration: Duration.fast });
    }
  }, [isAnswered, fillProgress, checkScale]);

  const circleStyle = useAnimatedStyle(() => ({
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: fillProgress.value > 0.5 ? 0 : 1.5,
    borderColor: hintColor,
    backgroundColor: interpolateColor(fillProgress.value, [0, 1], ['transparent', accentColor]),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  return (
    <Animated.View style={circleStyle}>
      <Animated.View style={checkStyle}>
        <CheckIcon size={12} color="#fff" weight="bold" />
      </Animated.View>
    </Animated.View>
  );
}

export default function JournalScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
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
  const setDeeperQuestions = useUnfoldStore((s) => s.setDeeperQuestions);
  const setResumeContext = useUnfoldStore((s) => s.setResumeContext);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const premiumPolicy = usePremiumAccessPolicy();
  const isPremium = premiumPolicy === 'granted';
  const { gate, showExclusiveOffer, dismissOffer } = useCreationGate();
  // Subscribe to journalEntries for reactive updates (prayer toggles, etc.)
  const journalEntries = useUnfoldStore((s) => s.journalEntries);

  // Derive existingEntry from reactive journalEntries (not the stable getJournalEntry function)
  // so that prayer toggles and other updates trigger re-renders
  const existingEntry = useMemo(
    () => journalEntries.find((e) => e.devotionalId === devotionalId && e.dayNumber === dayNumber),
    [journalEntries, devotionalId, dayNumber],
  );

  // Get devotional context — MUST stay above the useState lazy initializers
  // below; they read currentDay during the first render (was a TDZ
  // use-before-declaration that silently produced undefined on Hermes).
  const currentDevotional = devotionals.find((d) => d.id === devotionalId);
  const currentDay = currentDevotional?.days.find((d) => d.dayNumber === dayNumber);

  const [content, setContent] = useState(existingEntry?.content ?? '');
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savedEntryIdRef = useRef<string | null>(existingEntry?.id ?? null);
  const isMountedRef = useRef(true);

  // Journal mode
  // Initialize mode from existing entry, or auto-suggest based on study method
  const [activeMode, setActiveMode] = useState<JournalMode>(() =>
    resolveInitialJournalMode(existingEntry, currentDay)
  );

  // SOAP state
  const [soapValues, setSoapValues] = useState<SoapResponses>(
    existingEntry?.soapResponses ?? { scripture: '', observation: '', application: '', prayer: '' }
  );
  const [expandedSoapSection, setExpandedSoapSection] = useState<keyof SoapResponses | null>(
    existingEntry?.soapResponses ? null : 'scripture'
  );
  const soapInputRefs = useRef<Map<string, TextInput | null>>(new Map());
  const soapSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soapValuesRef = useRef(soapValues);
  soapValuesRef.current = soapValues;
  const hasPendingSoapRef = useRef(false);
  const flushSoapSavesRef = useRef<() => void>(() => {});
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resync local state when the store entry changes (MMKV hydration, sync pull)
  // but only if no local edits are pending. This prevents the "disappear then reappear"
  // issue where local state gets stale while the store has the correct data.
  useEffect(() => {
    if (!existingEntry || hasChanges || hasPendingSoapRef.current) return;
    // Resync content if store has newer data
    if (existingEntry.content && existingEntry.content !== content) {
      setContent(existingEntry.content);
    }
    // Resync SOAP values
    if (existingEntry.soapResponses) {
      const storeVals = existingEntry.soapResponses;
      const localVals = soapValuesRef.current;
      const hasStoreDiff = (['scripture', 'observation', 'application', 'prayer'] as const).some(
        (k) => (storeVals[k] ?? '') !== (localVals[k] ?? '')
      );
      if (hasStoreDiff) {
        setSoapValues(storeVals);
      }
    }
    // Resync deeper prompts
    if (existingEntry.deeperQuestions?.length && !deeperPrompts.length) {
      setDeeperPrompts(existingEntry.deeperQuestions);
    }
    // Resync saved entry ID ref
    if (existingEntry.id && !savedEntryIdRef.current) {
      savedEntryIdRef.current = existingEntry.id;
    }
  }, [existingEntry]);

  // Prayer state
  const [newPrayerText, setNewPrayerText] = useState('');
  const [showPrayerInput, setShowPrayerInput] = useState(false);
  const prayerInputRef = useRef<TextInput>(null);

  // Go Deeper state — restore from persisted entry if available
  const [deeperPrompts, setDeeperPrompts] = useState<string[]>(
    () => existingEntry?.deeperQuestions ?? []
  );
  const [loadingDeeper, setLoadingDeeper] = useState(false);
  const [deeperError, setDeeperError] = useState(false);

  const [showPremiumSheet, setShowPremiumSheet] = useState(false);

  // Expandable question response state
  const [expandedQuestionIndex, setExpandedQuestionIndex] = useState<number | null>(null);
  const [questionResponses, setQuestionResponses] = useState<Map<number, string>>(() =>
    buildInitialQuestionResponses(existingEntry, currentDay)
  );
  const questionInputRefs = useRef<Map<number, TextInput | null>>(new Map());

  const inputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<any>(null);

  // Track refs for unmount save
  const contentRef = useRef(content);
  contentRef.current = content;
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;

  // Handle focusQuestion param from journal hub navigation
  useEffect(() => {
    if (focusQuestionIndex != null && currentDay?.reflectionQuestions?.length) {
      setExpandedQuestionIndex(focusQuestionIndex);
      if (deeperPrompts.length === 0 && currentDay.reflectionQuestions.length > 0) {
        setDeeperPrompts(currentDay.reflectionQuestions);
      }
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
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
      // NOTE: Do NOT set touchedAt here. touchedAt is only used by reveal.tsx
      // to trigger the auto-navigate effect in home index.tsx. Setting it here
      // causes the home screen to auto-push to reading while the user is in
      // the journal, stealing focus when the Journal tab closes.
    });
  }, [devotionalId, dayNumber, currentDevotional?.title, currentDay?.title, setResumeContext]);

  useEffect(() => {
    if (focusQuestionIndex == null && activeMode === 'freewrite') {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) inputRef.current?.focus();
      }, 300);
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
    if (savedEntryIdRef.current) {
      // Always persist to the existing entry — including empty text (user deleted content)
      updateJournalEntry(savedEntryIdRef.current, text);
    } else if (text.trim()) {
      // Only create a brand-new entry if there's actual content
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
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
      // Flush any pending SOAP saves before unmount — single owner:
      // flushSoapSavesRef always points at the latest flushSoapSaves.
      if (soapSaveTimerRef.current) clearTimeout(soapSaveTimerRef.current);
      flushSoapSavesRef.current();
      // Flush any pending freewrite changes on unmount
      if (hasChangesRef.current) {
        saveEntry(contentRef.current);
      }
      isMountedRef.current = false;
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
        if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
        justSavedTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) setJustSaved(false);
        }, 2000);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [content, hasChanges, isSaving, saveEntry]);

  const handleTextChange = (text: string) => {
    if (!gate()) return;
    setContent(text);
    setHasChanges(true);
  };

  const closeJournal = useCallback(() => {
    if (pathname === '/(tabs)/(journal)/entry') {
      router.replace('/(tabs)/(journal)');
      return;
    }
    router.back();
  }, [pathname, router]);

  const handleDone = () => {
    if (!gate()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (activeMode === 'freewrite') {
      saveEntry(content);
    } else if (activeMode === 'soap') {
      flushSoapSaves();
    }
    AccessibilityInfo.announceForAccessibility('Journal entry saved');
    closeJournal();
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeJournal();
  };

  // Mode switching
  const handleModeSwitch = useCallback((mode: JournalMode) => {
    if (mode === activeMode) return;
    if (!gate()) return;
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
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) inputRef.current?.focus();
      }, 300);
    }
  }, [activeMode, ensureEntry, updateJournalMode, expandedSoapSection, gate]);

  // SOAP handlers
  const handleSoapChange = useCallback((field: keyof SoapResponses, text: string) => {
    if (!gate()) return;
    setSoapValues((prev) => ({ ...prev, [field]: text }));
    hasPendingSoapRef.current = true;

    if (soapSaveTimerRef.current) clearTimeout(soapSaveTimerRef.current);
    soapSaveTimerRef.current = setTimeout(() => {
      // Route through flushSoapSaves so ALL pending fields (not just the last
      // one captured in this closure) are persisted (FAP-UI-1 / COR-6).
      flushSoapSavesRef.current();
    }, 800);
  }, [gate]);

  // Flush all pending SOAP values to the store immediately. Writes every
  // field that differs from the persisted entry — including cleared (empty)
  // fields — so deletions made inside the debounce window stick (COR-6).
  const flushSoapSaves = useCallback(() => {
    if (!hasPendingSoapRef.current) return;
    if (soapSaveTimerRef.current) clearTimeout(soapSaveTimerRef.current);
    const entryId = ensureEntry();
    if (entryId) {
      const persisted = getJournalEntry(devotionalId, dayNumber)?.soapResponses;
      for (const { field, value } of diffSoapWrites(soapValuesRef.current, persisted)) {
        updateSoapResponse(entryId, field, value);
      }
    }
    hasPendingSoapRef.current = false;
  }, [ensureEntry, updateSoapResponse, getJournalEntry, devotionalId, dayNumber]);
  flushSoapSavesRef.current = flushSoapSaves;

  const handleSoapSectionTap = useCallback((field: keyof SoapResponses) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (expandedSoapSection === field) {
      Keyboard.dismiss();
      setExpandedSoapSection(null);
    } else {
      setExpandedSoapSection(field);
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) soapInputRefs.current.get(field)?.focus();
      }, 350);
    }
  }, [expandedSoapSection]);

  // Prayer handlers
  const handleAddPrayer = useCallback(() => {
    if (!newPrayerText.trim()) return;
    if (!gate()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const entryId = ensureEntry();
    if (entryId) {
      addPrayerRequest(entryId, newPrayerText.trim());
    }
    setNewPrayerText('');
    setShowPrayerInput(false);
  }, [newPrayerText, ensureEntry, addPrayerRequest, gate]);

  const handleTogglePrayer = useCallback((prayerId: string) => {
    if (!gate()) return;
    const entryId = savedEntryIdRef.current ?? ensureEntry();
    if (!entryId) return;
    // Find current prayer state to determine direction
    const prayer = existingEntry?.prayerRequests?.find((p) => p.id === prayerId);
    const willBeAnswered = !prayer?.isAnswered;
    if (willBeAnswered) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    togglePrayerAnswered(entryId, prayerId);
  }, [togglePrayerAnswered, ensureEntry, existingEntry, gate]);

  // SOAP completion count
  const soapCompletedCount = useMemo(() => {
    return SOAP_SECTIONS.filter((s) => soapValues[s.key].trim().length > 0).length;
  }, [soapValues]);

  // Save a question response to the store
  const handleQuestionResponseChange = useCallback(
    (index: number, question: string, response: string) => {
      if (!gate()) return;
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
    [content, devotionalId, dayNumber, addJournalEntry, getJournalEntry, saveEntry, updateQuestionResponse, activeMode, gate]
  );

  const handleToggleQuestion = useCallback(
    (index: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (expandedQuestionIndex === index) {
        Keyboard.dismiss();
        setExpandedQuestionIndex(null);
      } else {
        setExpandedQuestionIndex(index);
        if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
        focusTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
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
    if (!gate()) return;

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

    // Rate limit check before network call
    try {
      const rateCheck = await checkRateLimit('go-deeper');
      if (!rateCheck.allowed) {
        logger.warn('[Go Deeper] Rate limit reached');
        setDeeperError(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
    } catch (rateLimitError) {
      // Fail open — don't block Go Deeper if rate limit storage fails
      logger.warn('[Go Deeper] Rate limit check failed, proceeding:', rateLimitError);
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

      const userMessage = `Devotional: "${sanitizeForPrompt(currentDevotional?.title ?? 'Devotional', 200)}"
Day: "${sanitizeForPrompt(currentDay?.title ?? `Day ${dayNumber}`, 200)}"
Scripture: ${sanitizeForPrompt(currentDay?.scriptureReference ?? 'N/A', 200)}

Their journal entry:
"${sanitizeForPrompt(content, 2000)}"`;

      const response = await fetch(`${PRIMARY_BACKEND_URL}/api/generate/go-deeper`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
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
          if (match) {
            try {
              parsed = JSON.parse(match[0]);
            } catch (innerErr) {
              if (__DEV__) logger.warn('[Go Deeper] Fallback JSON parse failed:', innerErr);
              throw new Error('Could not parse response (fallback failed)');
            }
          } else {
            throw new Error('Could not parse response');
          }
        }
      }

      if (Array.isArray(parsed) && parsed.length > 0) {
        await incrementRateLimit('go-deeper');
        const prompts = parsed.slice(0, 3);
        setDeeperPrompts(prompts);

        // Persist to store so questions survive navigation
        if (!savedEntryIdRef.current) {
          addJournalEntry({ devotionalId, dayNumber, content: content || '', journalMode: activeMode });
          const newEntry = getJournalEntry(devotionalId, dayNumber);
          if (newEntry) savedEntryIdRef.current = newEntry.id;
        }
        if (savedEntryIdRef.current) {
          setDeeperQuestions(savedEntryIdRef.current, prompts);
        }

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
    <TouchableOpacity activeOpacity={1} style={[jStyles.flex1, { backgroundColor: colors.background }]} onPress={Keyboard.dismiss}>
      <SafeAreaView style={jStyles.flex1} edges={['top']}>
          {/* Header */}
          <View style={jStyles.headerRow}>
            <TouchableOpacity
              onPress={handleSkip}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Close journal"
              style={jStyles.headerButton}
            >
              <XIcon size={22} color={colors.textMuted} weight="light" />
            </TouchableOpacity>

            <Text style={[jStyles.dayLabel, { color: colors.textSubtle }]}>
              DAY {dayNumber}
            </Text>

            <TouchableOpacity
              onPress={handleDone}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Save journal entry"
              style={jStyles.headerButton}
            >
              <CheckIcon size={22} color={content.trim() || soapCompletedCount > 0 ? colors.text : colors.textHint} weight="bold" />
            </TouchableOpacity>
          </View>

          {/* Mode Selector */}
          <View style={jStyles.modeSelector}>
            {([
              { mode: 'freewrite' as JournalMode, label: 'Free Write' },
              { mode: 'soap' as JournalMode, label: 'SOAP' },
            ]).map(({ mode, label }) => (
              <TouchableOpacity
                key={mode}
                onPress={() => handleModeSwitch(mode)}
                activeOpacity={0.7}
                style={[jStyles.modeTab, { borderBottomColor: activeMode === mode ? colors.accent : 'transparent' }]}
              >
                <Text
                  style={[
                    jStyles.modeTabText,
                    {
                      fontFamily: activeMode === mode ? FontFamily.uiMedium : FontFamily.ui,
                      color: activeMode === mode ? colors.text : colors.textSubtle,
                    },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          <KeyboardAwareScrollView
            ref={scrollViewRef}
            style={jStyles.flex1}
            contentContainerStyle={jStyles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            bottomOffset={20}
            extraKeyboardSpace={120}
          >
            {/* Scripture anchor — tappable link back to today's reading */}
            {currentDay && (
              <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}>
                <TouchableOpacity
                  activeOpacity={0.6}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: '/(tabs)/(today)/reading',
                      params: { dayNumber: String(dayNumber) },
                    });
                  }}
                  style={[jStyles.scriptureAnchor, { borderLeftColor: alpha(colors.accent, 0.25) }]}
                  accessibilityLabel={`Return to reading: ${currentDay.title}`}
                  accessibilityRole="link"
                >
                  <Text style={[jStyles.scriptureAnchorText, { color: colors.textMuted }]}>
                    {currentDay.title}
                    {currentDay.scriptureReference ? ` — ${currentDay.scriptureReference}` : ''}
                  </Text>
                  <ArrowRightIcon size={14} color={colors.textMuted} weight="light" style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* ===== FREE WRITE MODE ===== */}
            {activeMode === 'freewrite' && (
              <>
                <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}>
                  <Text style={[jStyles.freewriteTitle, { color: colors.text }]}>
                    What's stirring?
                  </Text>
                  <Text style={[jStyles.freewriteSubtitle, { color: colors.textMuted }]}>
                    Take a moment to reflect. This is just for you.
                  </Text>
                </Animated.View>

                <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(200).easing(Ease.out)}>
                  <TextInput
                    ref={inputRef}
                    value={content}
                    onChangeText={handleTextChange}
                    placeholder={buildFreeWritePlaceholder({ reflectionQuestions: currentDay?.reflectionQuestions })}
                    placeholderTextColor={colors.textHint}
                    multiline
                    textAlignVertical="top"
                    accessibilityLabel="Journal entry"
                    style={[jStyles.freewriteInput, { color: colors.text }]}
                  />
                  <VoiceInputBar value={content} onChangeText={handleTextChange} />
                </Animated.View>

                {/* Go Deeper button */}
                {showDeeperButton && (
                  <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).easing(Ease.out)} style={jStyles.deeperButtonWrapper}>
                    <TouchableOpacity
                      onPress={handleGoDeeper}
                      disabled={loadingDeeper}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={isPremium ? "Go deeper" : "Go deeper, premium feature"}
                      style={[jStyles.deeperButton, { borderColor: colors.accent, opacity: loadingDeeper ? 0.6 : 0.9 }]}
                    >
                      {loadingDeeper ? (
                        <>
                          <ActivityIndicator size="small" color={colors.accent} />
                          <Text style={[jStyles.deeperButtonText, { color: colors.accent }]}>
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
                            style={[jStyles.deeperButtonText, { color: colors.accent }]}
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
                  <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).easing(Ease.out)} style={jStyles.errorWrapper}>
                    <TouchableOpacity onPress={handleGoDeeper} activeOpacity={0.6}>
                      <Text style={[jStyles.errorText, { color: colors.textMuted }]}>
                        Couldn't generate prompts. Tap to try again.
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>
                )}

                {/* Deeper prompts */}
                {allQuestions.length > 0 && (
                  <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).easing(Ease.out)} style={jStyles.deeperPromptsSection}>
                    <View style={[jStyles.deeperAccentLine, { backgroundColor: colors.accent }]} />
                    <View style={jStyles.deeperHeaderRow}>
                      <Text style={[jStyles.deeperLabel, { color: colors.accent }]}>
                        Go Deeper
                      </Text>
                      {allQuestions.length > 0 && (
                        <Text style={[jStyles.deeperProgress, { color: answeredCount === allQuestions.length ? colors.accent : colors.textSubtle }]}>
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
                          entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).delay(index * 100).easing(Ease.out)}
                          style={jStyles.questionItem}
                        >
                          <TouchableOpacity
                            onPress={() => handleToggleQuestion(index)}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={`Reflection prompt ${index + 1}: ${prompt}`}
                            accessibilityState={{ expanded: isExpanded }}
                            style={[jStyles.questionRow, { borderLeftColor: isAnswered ? colors.accent : colors.border }]}
                          >
                            <View style={jStyles.questionIconWrapper}>
                              {isAnswered ? (
                                <CheckCircleIcon size={16} color={colors.accent} weight="fill" />
                              ) : isExpanded ? (
                                <CaretUpIcon size={14} color={colors.textSubtle} weight="light" />
                              ) : (
                                <CaretDownIcon size={14} color={colors.textSubtle} weight="light" />
                              )}
                            </View>
                            <Text style={[jStyles.questionText, { color: colors.text }]}>
                              {prompt}
                            </Text>
                          </TouchableOpacity>

                          {isExpanded && (
                            <Animated.View
                              entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).easing(Ease.out)}
                              style={jStyles.questionInputWrapper}
                            >
                              <View style={[jStyles.questionInputCard, { backgroundColor: colors.inputBackground, borderColor: colors.borderFocused }]}>
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
                                  style={[jStyles.questionTextInput, { color: colors.text, paddingBottom: 40 }]}
                                />
                                <VoiceInputBar
                                  inline
                                  value={responseText}
                                  onChangeText={(text) => handleQuestionResponseChange(index, prompt, text)}
                                />
                              </View>
                            </Animated.View>
                          )}

                          {!isExpanded && isAnswered && (
                            <TouchableOpacity
                              activeOpacity={0.6}
                              onPress={() => handleToggleQuestion(index)}
                              accessibilityRole="button"
                              accessibilityLabel={`Edit your response to prompt ${index + 1}`}
                              accessibilityHint="Tap to edit your response"
                            >
                              <Animated.View
                                entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
                                style={jStyles.questionPreview}
                              >
                                <Text style={[jStyles.questionPreviewText, { color: colors.textMuted }]} numberOfLines={2}>
                                  {responseText}
                                </Text>
                              </Animated.View>
                            </TouchableOpacity>
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
              <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}>
                <Text style={[jStyles.soapTitle, { color: colors.text }]}>
                  SOAP Journal
                </Text>
                <Text style={[jStyles.soapSubtitle, { color: colors.textMuted }]}>
                  Scripture, Observation, Application, Prayer
                </Text>

                {/* SOAP progress */}
                <View style={jStyles.soapProgressRow}>
                  {SOAP_SECTIONS.map((section) => (
                    <View
                      key={section.key}
                      style={[jStyles.soapProgressBar, { backgroundColor: soapValues[section.key].trim() ? colors.accent : colors.border }]}
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
                      entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).delay(idx * 80).easing(Ease.out)}
                      style={{ marginBottom: isExpanded ? 20 : 12 }}
                    >
                      <TouchableOpacity
                        onPress={() => handleSoapSectionTap(section.key)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`${section.label} section`}
                        accessibilityState={{ expanded: isExpanded }}
                        style={[
                          jStyles.soapSectionButton,
                          {
                            backgroundColor: isExpanded
                              ? alpha(colors.accent, 0.04)
                              : hasContent
                              ? alpha(colors.accent, 0.02)
                              : 'transparent',
                            borderColor: isExpanded
                              ? alpha(colors.accent, 0.19)
                              : hasContent
                              ? alpha(colors.accent, 0.08)
                              : alpha(colors.border, 0.38),
                          },
                        ]}
                      >
                        {/* Letter badge */}
                        <View style={[jStyles.soapLetterBadge, { backgroundColor: hasContent ? colors.accent : alpha(colors.border, 0.50) }]}>
                          <Text style={[jStyles.soapLetterText, { color: hasContent ? '#fff' : colors.textSubtle }]}>
                            {section.letter}
                          </Text>
                        </View>

                        <SoapIcon name={section.icon} size={16} color={hasContent ? colors.accent : colors.textSubtle} />

                        <Text style={[jStyles.soapSectionLabel, { color: colors.text }]}>
                          {section.label}
                        </Text>

                        {hasContent && !isExpanded && (
                          <CheckCircleIcon size={16} color={colors.accent} weight="fill" />
                        )}
                      </TouchableOpacity>

                      {/* Expanded input */}
                      {isExpanded && (
                        <Animated.View
                          entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).easing(Ease.out)}
                          style={jStyles.soapExpandedWrapper}
                        >
                          <View style={[jStyles.soapInputCard, { backgroundColor: colors.inputBackground, borderColor: alpha(colors.accent, 0.19) }]}>
                            <TextInput
                              ref={(ref) => { soapInputRefs.current.set(section.key, ref); }}
                              value={soapValues[section.key]}
                              onChangeText={(text) => handleSoapChange(section.key, text)}
                              placeholder={section.placeholder}
                              placeholderTextColor={colors.textHint}
                              multiline
                              textAlignVertical="top"
                              accessibilityLabel={`${section.label} journal entry`}
                              style={[jStyles.soapTextInput, { color: colors.text, paddingBottom: 40 }]}
                            />
                            <VoiceInputBar
                              inline
                              value={soapValues[section.key]}
                              onChangeText={(text) => handleSoapChange(section.key, text)}
                            />
                          </View>
                          <Text style={[jStyles.autoSavedLabel, { color: colors.textHint }]}>
                            Auto-saved
                          </Text>
                        </Animated.View>
                      )}

                      {/* Collapsed preview */}
                      {!isExpanded && hasContent && (
                        <Text style={[jStyles.soapPreview, { color: colors.textMuted }]} numberOfLines={2}>
                          {soapValues[section.key]}
                        </Text>
                      )}
                    </Animated.View>
                  );
                })}

                {/* SOAP completion message */}
                {soapCompletedCount === 4 && (
                  <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={jStyles.soapCompleteWrapper}>
                    <Text style={[jStyles.soapCompleteText, { color: colors.accent }]}>
                      Beautiful reflection. All sections complete.
                    </Text>
                  </Animated.View>
                )}
              </Animated.View>
            )}

            {/* ===== PRAYER REQUESTS SECTION ===== */}
            <Animated.View
              entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(400).easing(Ease.out)}
              style={{ marginTop: activeMode === 'soap' ? 32 : allQuestions.length > 0 ? 0 : 40 }}
            >
              {/* Divider */}
              <View style={jStyles.prayerDivider}>
                <View style={[jStyles.prayerDividerLine, { backgroundColor: colors.textMuted }]} />
                <HandsPrayingIcon size={14} color={colors.accent} weight="light" style={jStyles.prayerDividerIcon} />
                <Text style={[jStyles.prayerDividerLabel, { color: colors.accent }]}>
                  Prayer Requests
                </Text>
                <View style={[jStyles.prayerDividerLineRight, { backgroundColor: colors.textMuted }]} />
              </View>

              {/* Existing prayer requests */}
              {prayerRequests.map((prayer) => (
                <Animated.View
                  key={prayer.id}
                  entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).easing(Ease.out)}
                  style={jStyles.prayerItemWrapper}
                >
                  <TouchableOpacity
                    onPress={() => handleTogglePrayer(prayer.id)}
                    activeOpacity={0.6}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    style={[
                      jStyles.prayerItemButton,
                      {
                        backgroundColor: prayer.isAnswered ? alpha(colors.accent, 0.05) : 'transparent',
                        borderColor: prayer.isAnswered ? alpha(colors.accent, 0.19) : alpha(colors.border, 0.38),
                      },
                    ]}
                  >
                    <AnimatedPrayerCircle
                      isAnswered={prayer.isAnswered}
                      accentColor={colors.accent}
                      hintColor={colors.textHint}
                    />
                    <Text
                      style={[
                        jStyles.prayerText,
                        {
                          color: prayer.isAnswered ? colors.textMuted : colors.text,
                          textDecorationLine: prayer.isAnswered ? 'line-through' : 'none',
                        },
                      ]}
                    >
                      {prayer.text}
                    </Text>
                    {prayer.isAnswered && (
                      <Text style={[jStyles.prayerAnsweredLabel, { color: colors.accent }]}>
                        Answered
                      </Text>
                    )}
                  </TouchableOpacity>
                </Animated.View>
              ))}

              {/* Add prayer input */}
              {showPrayerInput ? (
                <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={jStyles.prayerInputMargin}>
                  <View style={[jStyles.prayerInputCard, { backgroundColor: colors.inputBackground, borderColor: alpha(colors.accent, 0.19) }]}>
                    <TextInput
                      ref={prayerInputRef}
                      value={newPrayerText}
                      onChangeText={setNewPrayerText}
                      placeholder="What would you like to pray for?"
                      placeholderTextColor={colors.textHint}
                      multiline
                      textAlignVertical="top"
                      autoFocus
                      style={[jStyles.prayerTextInput, { color: colors.text, paddingBottom: 40 }]}
                      onSubmitEditing={handleAddPrayer}
                      blurOnSubmit
                    />
                    <VoiceInputBar inline value={newPrayerText} onChangeText={setNewPrayerText} />
                  </View>
                  {/* Action buttons below input */}
                  <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 10 }}>
                    <TouchableOpacity
                      onPress={() => { setShowPrayerInput(false); setNewPrayerText(''); }}
                      activeOpacity={0.6}
                      hitSlop={8}
                    >
                      <Text style={[jStyles.prayerCancelText, { color: colors.textSubtle }]}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleAddPrayer}
                      activeOpacity={0.6}
                      disabled={!newPrayerText.trim()}
                      hitSlop={8}
                      style={{
                        backgroundColor: newPrayerText.trim() ? colors.accent : alpha(colors.accent, 0.25),
                        paddingHorizontal: Spacing['5'],
                        paddingVertical: Spacing['2'],
                        borderRadius: Radius.lg,
                        opacity: newPrayerText.trim() ? 1 : 0.5,
                      }}
                      accessibilityLabel="Add prayer"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !newPrayerText.trim() }}
                    >
                      <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: '#fff' }}>
                        Add Prayer
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    if (!gate()) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowPrayerInput(true);
                  }}
                  activeOpacity={0.6}
                  style={jStyles.addPrayerButton}
                >
                  <PlusIcon size={14} color={colors.textSubtle} weight="light" />
                  <Text style={[jStyles.addPrayerText, { color: colors.textSubtle }]}>
                    Add a prayer request
                  </Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          </KeyboardAwareScrollView>

          {/* Bottom hint — crossfade between states */}
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(400).easing(Ease.out)}
            style={jStyles.bottomHint}
          >
            <Animated.Text
              key={hasChanges ? 'saving' : justSaved ? 'saved' : 'idle'}
              entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).easing(Ease.out)}
              exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
              style={[jStyles.bottomHintText, { color: justSaved ? colors.accent : colors.textHint }]}
            >
              {hasChanges ? 'Saving...' : justSaved ? 'Saved' : 'Your response is saved automatically'}
            </Animated.Text>
          </Animated.View>
      </SafeAreaView>

      <PremiumFeatureSheet
        visible={showPremiumSheet}
        onClose={() => setShowPremiumSheet(false)}
        feature="journal"
      />
      <ExclusiveOfferSheet visible={showExclusiveOffer} onDismiss={dismissOffer} context="churned" />
    </TouchableOpacity>
  );
}

const jStyles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
  },
  headerButton: {
    padding: Spacing['2'],
  },
  dayLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.xs,
    letterSpacing: 1,
  },
  modeSelector: {
    flexDirection: 'row',
    paddingHorizontal: Spacing['6'],
    marginBottom: Spacing['2'],
    gap: 0,
  },
  modeTab: {
    paddingVertical: Spacing['2'],
    paddingHorizontal: Spacing['4'],
    borderBottomWidth: 2,
  },
  modeTabText: {
    fontSize: 13,
    letterSpacing: 0.3,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['6'],
    paddingBottom: 300,
  },
  scriptureAnchor: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing['6'],
    paddingLeft: Spacing['3'],
    borderLeftWidth: 2,
    borderRadius: 1,
  },
  scriptureAnchorText: {
    flex: 1,
    fontFamily: FontFamily.bodyItalic,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  freewriteTitle: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    marginBottom: Spacing['2'],
  },
  freewriteSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    marginBottom: Spacing['8'],
  },
  freewriteInput: {
    minHeight: 160,
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    lineHeight: 26,
    paddingTop: 0,
  },
  deeperButtonWrapper: {
    marginTop: Spacing['6'],
  },
  deeperButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    paddingVertical: 14,
    paddingHorizontal: Spacing['6'],
    borderRadius: Radius.md,
    borderWidth: 1,
    backgroundColor: 'transparent',
    alignSelf: 'center',
  },
  deeperButtonText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
  errorWrapper: {
    marginTop: Spacing['6'],
    alignItems: 'center',
  },
  errorText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
    textAlign: 'center',
  },
  deeperPromptsSection: {
    marginTop: Spacing['8'],
    marginBottom: Spacing['8'],
  },
  deeperAccentLine: {
    width: 24,
    height: 1.5,
    marginBottom: Spacing['5'],
    borderRadius: 1,
  },
  deeperHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing['4'],
  },
  deeperLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    opacity: 0.8,
  },
  deeperProgress: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  questionItem: {
    marginBottom: 14,
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 14,
    borderLeftWidth: 2,
    gap: 10,
  },
  questionIconWrapper: {
    marginTop: 3,
  },
  questionText: {
    flex: 1,
    fontFamily: FontFamily.bodyItalic,
    fontSize: 15,
    lineHeight: 24,
  },
  questionInputWrapper: {
    marginLeft: 14,
    marginTop: 10,
    paddingLeft: 14,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  questionInputCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: 14,
  },
  questionInputPromptHint: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  questionTextInput: {
    minHeight: 80,
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 24,
    padding: 0,
  },
  questionPreview: {
    marginLeft: Spacing['10'],
    marginTop: 6,
  },
  questionPreviewText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
  },
  soapTitle: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    marginBottom: 4,
  },
  soapSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    marginBottom: Spacing['2'],
  },
  soapProgressRow: {
    flexDirection: 'row',
    gap: Spacing['1'],
    marginBottom: Spacing['7'],
  },
  soapProgressBar: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
  },
  soapSectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing['3'],
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  soapLetterBadge: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing['3'],
  },
  soapLetterText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
  soapSectionLabel: {
    flex: 1,
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
    marginLeft: 10,
  },
  soapExpandedWrapper: {
    marginTop: 10,
    paddingHorizontal: 4,
  },
  soapInputCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: 14,
  },
  soapTextInput: {
    minHeight: 100,
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 24,
    padding: 0,
  },
  autoSavedLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    marginTop: 6,
    textAlign: 'right',
  },
  soapPreview: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    marginLeft: 54,
    marginRight: Spacing['2'],
  },
  soapCompleteWrapper: {
    alignItems: 'center',
    marginTop: Spacing['4'],
  },
  soapCompleteText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
  },
  prayerDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['5'],
  },
  prayerDividerLine: {
    flex: 1,
    height: 0.5,
    opacity: 0.15,
  },
  prayerDividerLineRight: {
    flex: 1,
    height: 0.5,
    opacity: 0.15,
    marginLeft: Spacing['3'],
  },
  prayerDividerIcon: {
    marginHorizontal: Spacing['3'],
  },
  prayerDividerLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    opacity: 0.75,
  },
  prayerItemWrapper: {
    marginBottom: 10,
  },
  prayerItemButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: Spacing['3'],
    borderRadius: 10,
    borderWidth: 1,
  },
  // prayerCheckWrapper and prayerEmptyCircle replaced by AnimatedPrayerCircle
  prayerText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  prayerAnsweredLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 10,
    letterSpacing: 0.5,
    marginTop: 3,
  },
  prayerInputMargin: {
    marginTop: 4,
  },
  prayerInputCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing['3'],
  },
  prayerTextInput: {
    flex: 1,
    minHeight: 44,
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 21,
    padding: 0,
  },
  prayerSubmitButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prayerCancelButton: {
    alignSelf: 'center',
    marginTop: Spacing['2'],
  },
  prayerCancelText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  addPrayerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['1.5'],
    paddingVertical: Spacing['3'],
    marginTop: Spacing['1'],
  },
  addPrayerText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
  },
  bottomHint: {
    paddingHorizontal: Spacing['6'],
    paddingBottom: Spacing['6'],
    alignItems: 'center',
  },
  bottomHintText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
    textAlign: 'center',
  },
});
