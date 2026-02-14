import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  AccessibilityInfo,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, ChevronDown, ArrowRight, Hand, Fingerprint, Moon, Compass, Heart, Sparkles, Wind, Mountain, Sun, Eye, Flame, Sparkle, CloudRain, Scale, Target, Stars, BookOpen, Users, Music, Crown, Leaf, MessageCircle, Calendar, Wheat, User, Wand2 } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { INPUT_LIMITS } from '@/lib/validation';
import { TypewriterText } from '@/components/TypewriterText';
import { useUnfoldStore, UserProfile, BIBLE_TRANSLATIONS, BibleTranslation, ThemeCategory, DevotionalType } from '@/lib/store';
import { generateAdaptiveQuestion } from '@/lib/devotional-service';
import { THEME_CATEGORIES, DEVOTIONAL_TYPES, BIBLICAL_CHARACTERS, BIBLE_BOOKS_FOR_STUDY, ThemeCategoryInfo, DevotionalTypeInfo } from '@/constants/devotional-types';
import {
  pickRandomVariation,
  getRandomDurationSubtext,
  getRandomReadingSubtext,
} from '@/constants/onboarding-questions';
import { Analytics, AnalyticsEvents } from '@/lib/analytics';

const ALL_STEPS = [
  { id: 'name', question: "What's your name?", subtext: 'Just your first name is perfect.', type: 'text' as const, placeholder: 'Your name', adaptive: false, skipIfHasValue: true, hasVariations: false },
  { id: 'bibleTranslation', question: 'Which Bible translation do you prefer?', subtext: "We'll use this translation for all scripture in your devotionals.", type: 'choice' as const, placeholder: '', adaptive: false, skipIfHasValue: true, hasVariations: false, options: BIBLE_TRANSLATIONS.map((t) => ({ value: t.value, label: t.label, description: t.description })) },
  { id: 'aboutMe', question: 'Tell me a little about yourself.', subtext: "Who you are, what you do, what matters to you. There's no wrong answer here.", type: 'multiline' as const, placeholder: "I'm a...", adaptive: true, skipIfHasValue: true, hasVariations: false },
  // EXPLORATION: Theme/topic selection (optional)
  { id: 'themeType', question: 'Is there something specific you want to explore?', subtext: 'Pick one that resonates, or skip to let us guide you.', type: 'themeType' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
  // SUBJECT SELECTION: After choosing a study type, pick the specific subject (book, character, etc.)
  { id: 'studySubject', question: 'Which would you like to study?', subtext: 'Pick one to journey through together.', type: 'studySubject' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false, conditionalOn: 'selectedType' },
  // DISCOVERY STEP 1: Opening - Where are you right now? (contextual based on study type)
  { id: 'currentSituation', question: "What's been on your heart lately?", subtext: "The thing that's there when the noise quiets down.", type: 'multiline' as const, placeholder: "Lately, I've been thinking about...", adaptive: true, skipIfHasValue: false, hasVariations: true },
  // DISCOVERY STEP 2: Going deeper - What's underneath? (contextual based on study type)
  { id: 'emotionalState', question: "And what's underneath that?", subtext: "There's usually something deeper. Take your time.", type: 'multiline' as const, placeholder: "When I sit with it, I realize...", adaptive: true, skipIfHasValue: false, hasVariations: true },
  // DISCOVERY STEP 3: The longing - What would breakthrough look like? (contextual based on study type)
  { id: 'spiritualSeeking', question: "What would feel like a breath of fresh air right now?", subtext: "If something could shift, what would you hope it would be?", type: 'multiline' as const, placeholder: "I think what I really need is...", adaptive: true, skipIfHasValue: false, hasVariations: true },
  { id: 'readingDuration', question: 'How long should each devotional be?', subtext: "We'll craft each day to fit your rhythm.", type: 'choice' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false, hasDynamicOptions: true, options: [{ value: 5, label: '5 minutes', description: 'A quick breath' }, { value: 15, label: '15 minutes', description: 'A thoughtful pause' }, { value: 30, label: '30 minutes', description: 'A deep dive' }] },
  { id: 'devotionalLength', question: 'How long would you like this journey to be?', subtext: 'You can always create another when this one ends.', type: 'choice' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false, hasDynamicOptions: true, options: [{ value: 3, label: '3 days', description: 'A glimpse' }, { value: 7, label: '7 days', description: 'A week' }, { value: 14, label: '14 days', description: 'Two weeks' }, { value: 30, label: '30 days', description: 'A month' }] },
  { id: 'reminderTime', question: 'When should we remind you?', subtext: "A gentle nudge to pause and reflect. You can change this anytime.", type: 'timeChoice' as const, placeholder: '', adaptive: false, skipIfHasValue: true, hasVariations: false, options: [{ value: '6:00 AM', label: 'Early morning', time: '6:00 AM' }, { value: '8:00 AM', label: 'Morning', time: '8:00 AM' }, { value: '12:00 PM', label: 'Midday', time: '12:00 PM' }, { value: '6:00 PM', label: 'Evening', time: '6:00 PM' }, { value: '9:00 PM', label: 'Night', time: '9:00 PM' }] },
];

type StepId = 'name' | 'bibleTranslation' | 'aboutMe' | 'themeType' | 'studySubject' | 'currentSituation' | 'emotionalState' | 'spiritualSeeking' | 'readingDuration' | 'devotionalLength' | 'reminderTime';

interface OnboardingData {
  name: string;
  bibleTranslation: BibleTranslation;
  aboutMe: string;
  themeType: boolean;
  studySubject: boolean;
  currentSituation: string;
  emotionalState: string;
  spiritualSeeking: string;
  readingDuration: 5 | 15 | 30;
  devotionalLength: 3 | 7 | 14 | 30;
  reminderTime: string;
  selectedThemes?: ThemeCategory[];
  selectedType?: DevotionalType;
  selectedStudySubject?: string;
  selectedMainOption?: 'theme' | 'type' | 'guided';
}

interface AdaptedStep {
  question: string;
  subtext: string;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { mode, theme: quickTheme } = useLocalSearchParams<{ mode?: 'quick' | 'full'; theme?: string }>();
  const { colors, isDark } = useTheme();
  const existingUser = useUnfoldStore((s) => s.user);
  const setUser = useUnfoldStore((s) => s.setUser);
  const updateUser = useUnfoldStore((s) => s.updateUser);

  const isQuickMode = mode === 'quick';

  // Types that require subject selection (book, character, etc.)
  const TYPES_WITH_SUBJECT_SELECTION: DevotionalType[] = ['book_study', 'character_study'];

  const [currentStepId, setCurrentStepId] = useState<StepId>('name');
  const [showInput, setShowInput] = useState(false);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [adaptedSteps, setAdaptedSteps] = useState<Record<string, AdaptedStep>>({});
  const [themeSelectionMode, setThemeSelectionMode] = useState<'none' | 'theme' | 'type'>('none');
  const [showListScrollHint, setShowListScrollHint] = useState(true);
  const [isQuickProcessing, setIsQuickProcessing] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const inputOpacity = useSharedValue(0);
  const inputTranslateY = useSharedValue(10);
  const listScrollY = useSharedValue(0);

  // Quick mode: Auto-complete and navigate to home
  useEffect(() => {
    if (isQuickMode && !isQuickProcessing) {
      setIsQuickProcessing(true);
      // Small delay for UX
      const timer = setTimeout(() => {
        completeQuickOnboarding();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isQuickMode]);

  const completeQuickOnboarding = async () => {
    const hour = new Date().getHours();
    const defaultTheme = quickTheme || (hour >= 5 && hour < 12 ? 'purpose' : hour >= 18 || hour < 5 ? 'peace' : 'growth');

    // Update user with quick settings
    if (existingUser) {
      updateUser({
        hasCompletedOnboarding: true,
        name: existingUser.name || 'Friend',
        readingDuration: 15,
        devotionalLength: 7,
        bibleTranslation: 'NIV',
        reminderTime: '8:00 AM',
        selectedThemes: [defaultTheme as ThemeCategory],
      });
    }

    Analytics.logEvent(AnalyticsEvents.ONBOARDING_COMPLETED, { mode: 'quick' });

    // Navigate to home
    router.replace('/(main)/home');
  };

  // Theme selection scroll animation
  const listFadeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: showListScrollHint ? 1 : 1,
  }));

  const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    listScrollY.value = offsetY;
    if (offsetY > 20 && showListScrollHint) {
      setShowListScrollHint(false);
    }
  }, [showListScrollHint, listScrollY]);

  const [data, setData] = useState<OnboardingData>({
    name: existingUser?.name ?? '',
    bibleTranslation: existingUser?.bibleTranslation ?? 'NIV',
    aboutMe: existingUser?.aboutMe ?? '',
    themeType: false,
    studySubject: false,
    currentSituation: '',
    emotionalState: '',
    spiritualSeeking: '',
    readingDuration: 15,
    devotionalLength: 7,
    reminderTime: existingUser?.reminderTime ?? '8:00 AM',
    selectedThemes: [],
  });

  // Filter steps based on what we already know
  const STEPS = useMemo(() => {
    return ALL_STEPS.filter((step) => {
      // Skip study subject if user selected themes or guided mode (not a study type)
      if (step.id === 'studySubject') {
        // If they selected themes or guided, skip subject selection
        if (data.selectedMainOption === 'theme' || data.selectedMainOption === 'guided') {
          return false;
        }
        // If they selected a type that doesn't need subject selection, skip
        if (data.selectedType && !TYPES_WITH_SUBJECT_SELECTION.includes(data.selectedType)) {
          return false;
        }
      }

      if (step.skipIfHasValue) {
        const stepId = step.id as StepId;
        if (stepId === 'name' && existingUser?.name) return false;
        if (stepId === 'bibleTranslation' && existingUser?.bibleTranslation) return false;
        if (stepId === 'aboutMe' && existingUser?.aboutMe) return false;
        if (stepId === 'reminderTime' && existingUser?.reminderTime) return false;
      }
      return true;
    });
  }, [existingUser, data.selectedMainOption, data.selectedType]);

  // Find current step from filtered STEPS array
  const step = useMemo(() => STEPS.find((s) => s.id === currentStepId), [STEPS, currentStepId]);
  const baseStep = ALL_STEPS.find((s) => s.id === currentStepId);
  
  // Helper to get the index of current step in STEPS array
  const currentStepIndex = useMemo(() => STEPS.findIndex((s) => s.id === currentStepId), [STEPS, currentStepId]);
  const isLastStep = currentStepIndex === STEPS.length - 1;

  const getStepIds = () => STEPS.map((s) => s.id);

  // Get previous answers for adaptive question generation
  const getPreviousAnswers = () => {
    const stepIds = getStepIds();
    const answers: { question: string; answer: string }[] = [];
    
    if (data.selectedType) {
      const typeInfo = DEVOTIONAL_TYPES.find(t => t.id === data.selectedType);
      if (typeInfo) {
        if (data.selectedStudySubject) {
          if (data.selectedType === 'book_study') {
            const bookInfo = BIBLE_BOOKS_FOR_STUDY.find(b => b.name === data.selectedStudySubject);
            const bookDescription = bookInfo ? ` (${bookInfo.description})` : '';
            answers.push({
              question: 'What book of the Bible did you choose to study?',
              answer: `${data.selectedStudySubject}${bookDescription}`
            });
          } else if (data.selectedType === 'character_study') {
            const charInfo = BIBLICAL_CHARACTERS.find(c => c.name === data.selectedStudySubject);
            const charDescription = charInfo ? ` — ${charInfo.description}` : '';
            answers.push({
              question: 'Which biblical character did you choose to learn from?',
              answer: `${data.selectedStudySubject}${charDescription}`
            });
          } else {
            answers.push({ question: 'What type of devotional study did you choose?', answer: `${typeInfo.name}: ${data.selectedStudySubject} — ${typeInfo.description}` });
          }
        } else {
          answers.push({ question: 'What type of devotional study did you choose?', answer: `${typeInfo.name} — ${typeInfo.description}` });
        }
      }
    }
    if ((data.selectedThemes?.length ?? 0) > 0) {
      const themeNames = data.selectedThemes.map(id => THEME_CATEGORIES.find(t => t.id === id)?.name).filter(Boolean).join(', ');
      answers.push({ question: 'What themes are you drawn to?', answer: themeNames });
    }

    // Get answers from steps that come before the current step
    const currentIdx = STEPS.findIndex((s) => s.id === currentStepId);
    for (let i = 0; i < currentIdx; i++) {
      const stepId = STEPS[i].id as StepId;
      if (stepIds.includes(stepId)) {
        const value = data[stepId];
        if (typeof value === 'string' && value.trim()) answers.push({ question: STEPS[i].question, answer: value });
      }
    }
    return answers;
  };

  useEffect(() => {
    // Track onboarding start
    Analytics.logEvent(AnalyticsEvents.ONBOARDING_STARTED);
  }, []);

  useEffect(() => {
    const loadAdaptiveQuestion = async () => {
      if (!step) return;
      if (!step.adaptive || adaptedSteps[step.id]) return;
      const previousAnswers = getPreviousAnswers();
      if (previousAnswers.length === 0) return;
      setIsLoadingQuestion(true);

      const stepPosition = step.id === 'currentSituation' ? 'opening' as const
        : step.id === 'emotionalState' ? 'depth' as const
        : step.id === 'spiritualSeeking' ? 'longing' as const
        : undefined;

      try {
        const adapted = await generateAdaptiveQuestion(
          previousAnswers,
          { question: step.question, subtext: step.subtext },
          stepPosition
        );
        setAdaptedSteps((prev) => ({ ...prev, [step.id]: adapted }));
      } catch {
        console.log('Failed to adapt question, using default');
      } finally {
        setIsLoadingQuestion(false);
      }
    };
    loadAdaptiveQuestion();
  }, [currentStepId, step]);

  useEffect(() => {
    setAdaptedSteps({});
  }, [data.selectedType, data.selectedStudySubject, data.selectedThemes]);

  useEffect(() => {
    setShowInput(false);
    setShowListScrollHint(true);
    inputOpacity.value = withTiming(0, { duration: 0 });
    inputTranslateY.value = withTiming(10, { duration: 0 });
  }, [currentStepId]);

  const handleTypewriterComplete = () => {
    setTimeout(() => {
      setShowInput(true);
      inputOpacity.value = withTiming(1, { duration: 300 });
      inputTranslateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) });
      if (step?.type === 'text' || step?.type === 'multiline') {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }, 400);
  };

  const inputAnimatedStyle = useAnimatedStyle(() => ({
    opacity: inputOpacity.value,
    transform: [{ translateY: inputTranslateY.value }],
  }));

  // Helper to advance to the next step
  const advanceToNextStep = useCallback(() => {
    const currentIdx = STEPS.findIndex((s) => s.id === currentStepId);
    if (currentIdx < STEPS.length - 1) {
      const nextStepId = STEPS[currentIdx + 1].id as StepId;
      setCurrentStepId(nextStepId);
    } else {
      // Final step - create user and devotional
      const userData: UserProfile = {
        name: data.name,
        bibleTranslation: data.bibleTranslation,
        aboutMe: data.aboutMe,
        currentSituation: data.currentSituation,
        emotionalState: data.emotionalState,
        spiritualSeeking: data.spiritualSeeking,
        readingDuration: data.readingDuration,
        devotionalLength: data.devotionalLength,
        reminderTime: data.reminderTime,
        isPremium: false,
        hasCompletedOnboarding: true,
        hasCompletedStyleOnboarding: false,
        fontSize: 'medium',
        writingStyle: { tone: 'warm', depth: 'balanced', faithBackground: 'growing' },
        themeMode: 'system',
        accentTheme: 'gold',
        readingFont: 'source-serif',
        // Auth fields - initialize as null, will be set when user signs in
        authUserId: null,
        authProvider: null,
        authEmail: null,
        authDisplayName: null,
        hasSeenSignInPrompt: false,
        signInPromptCount: 0,
        // Streak fields
        streakCount: 0,
        longestStreak: 0,
        lastReadDate: null,
        streakFreezes: 0,
        weekendAmnesty: true,
      };

      if (existingUser) {
        updateUser(userData);
      } else {
        setUser(userData);
      }

      // Navigate to generating screen with user context
      const params: Record<string, string> = {};
      if ((data.selectedThemes?.length ?? 0) > 0) {
        params.themes = data.selectedThemes.join(',');
      }
      if (data.selectedType) {
        params.devotionalType = data.selectedType;
      }
      if (data.selectedStudySubject) {
        params.studySubject = data.selectedStudySubject;
      }

      // Track onboarding completion
      Analytics.logEvent(AnalyticsEvents.ONBOARDING_COMPLETED, {
        devotional_length: data.devotionalLength,
        reading_duration: data.readingDuration,
        has_selected_theme: (data.selectedThemes?.length ?? 0) > 0,
        has_selected_type: !!data.selectedType,
      });

      router.push({
        pathname: '/generating',
        params,
      });
    }
  }, [STEPS, currentStepId, data, existingUser, router, setUser, updateUser]);

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Handle theme type selection sub-modes
    if (baseStep?.type === 'themeType') {
      if (themeSelectionMode === 'none' && data.selectedMainOption) {
        // User selected main option, now enter sub-mode or advance for guided
        if (data.selectedMainOption === 'theme') {
          setThemeSelectionMode('theme');
          return;
        } else if (data.selectedMainOption === 'type') {
          setThemeSelectionMode('type');
          return;
        } else if (data.selectedMainOption === 'guided') {
          // Guided mode - clear selections and advance immediately
          setData((prev) => ({ ...prev, selectedThemes: [], selectedType: undefined, selectedStudySubject: undefined }));
          advanceToNextStep();
          return;
        }
      } else if (themeSelectionMode !== 'none') {
        // In sub-mode, selection was made - advance to next step
        // Note: we keep themeSelectionSubMode so back button returns to this sub-mode
        advanceToNextStep();
        return;
      }
    }

    // Default: advance to next step
    advanceToNextStep();
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // If in theme sub-mode, go back to main selection (but stay on same step)
    if (themeSelectionMode !== 'none') {
      setThemeSelectionMode('none');
      return;
    }

    // If on main selection screen with a selection, clear it
    if (baseStep?.type === 'themeType' && themeSelectionMode === 'none' && data.selectedMainOption) {
      setData((prev) => ({ ...prev, selectedMainOption: undefined }));
      return;
    }

    // Find current index and navigate to previous step by ID
    const currentIdx = STEPS.findIndex((s) => s.id === currentStepId);
    if (currentIdx > 0) {
      const prevStepId = STEPS[currentIdx - 1].id as StepId;
      setCurrentStepId(prevStepId);
    } else {
      router.back();
    }
  };

  const updateData = (key: StepId, value: string | number) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const canProceed = () => {
    if (!baseStep) return false;
    const stepId = baseStep.id as StepId;
    const value = data[stepId];
    if (baseStep.type === 'text') return typeof value === 'string' && value.trim().length > 0;
    if (baseStep.type === 'multiline') return typeof value === 'string' && value.trim().length > 10;
    if (baseStep.type === 'themeType') {
      if (themeSelectionMode === 'none') {
        return !!data.selectedMainOption;
      }
      if (themeSelectionMode === 'theme') return (data.selectedThemes?.length ?? 0) > 0 && (data.selectedThemes?.length ?? 0) <= 3;
      if (themeSelectionMode === 'type') return !!data.selectedType;
      return false;
    }
    if (baseStep.type === 'studySubject') {
      return !!data.selectedStudySubject;
    }
    return true;
  };

  // Theme pill component with improved press handling
  const ThemePill = ({ theme, isSelected, onPress, selectionOrder }: { theme: { id: ThemeCategory; name: string; description: string; scriptureFocus: string[]; toneGuidance: string; icon: React.ReactNode }; isSelected: boolean; onPress: () => void; selectionOrder?: number }) => {
    const [isPressed, setIsPressed] = useState(false);
    
    return (
      <Pressable
        onPress={onPress}
        onPressIn={() => setIsPressed(true)}
        onPressOut={() => setIsPressed(false)}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 20,
            backgroundColor: isSelected ? colors.buttonBackgroundPressed : isPressed ? colors.buttonBackgroundPressed : colors.inputBackground,
            borderWidth: 1.5,
            borderColor: isSelected ? colors.borderFocused : isPressed ? colors.borderFocused : colors.border,
            gap: 8,
          }}
        >
          {theme.icon}
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: 14,
              color: isSelected ? colors.text : colors.textMuted,
            }}
          >
            {theme.name}
          </Text>
          {selectionOrder && (
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: colors.accent,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.mono,
                  fontSize: 10,
                  color: colors.background,
                }}
              >
                {selectionOrder}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  const renderInput = () => {
    if (!baseStep) return null;
    const stepId = baseStep.id as StepId;

    if (baseStep.type === 'text') {
      return (
        <TextInput
          ref={inputRef}
          value={data[stepId] as string}
          onChangeText={(text) => updateData(stepId, text)}
          placeholder={baseStep.placeholder}
          placeholderTextColor={colors.textHint}
          style={{
            fontFamily: FontFamily.mono,
            fontSize: 18,
            color: colors.text,
            backgroundColor: colors.inputBackground,
            paddingHorizontal: 20,
            paddingVertical: 18,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          autoCapitalize="words"
          returnKeyType="done"
          maxLength={INPUT_LIMITS.NAME.max}
          onSubmitEditing={() => canProceed() && handleNext()}
        />
      );
    }

    if (baseStep.type === 'multiline') {
      const inputLength = (data[stepId] as string)?.length ?? 0;
      const isDiscoveryStep = ['currentSituation', 'emotionalState', 'spiritualSeeking'].includes(stepId);
      const showNudge = isDiscoveryStep && inputLength > 0 && inputLength < 80;

      return (
        <View>
          <View className="relative">
            <TextInput
              ref={inputRef}
              value={data[stepId] as string}
              onChangeText={(text) => updateData(stepId, text)}
              placeholder={baseStep.placeholder}
              placeholderTextColor={colors.textHint}
              multiline
              textAlignVertical="top"
              maxLength={INPUT_LIMITS.LONG_TEXT.max}
              style={{
                fontFamily: FontFamily.mono,
                fontSize: 16,
                color: colors.text,
                backgroundColor: colors.inputBackground,
                paddingHorizontal: 20,
                paddingTop: 18,
                paddingBottom: 64,
                paddingRight: 20,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                minHeight: 160,
                lineHeight: 24,
              }}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 16,
                right: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {showNudge && (
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 12,
                    color: colors.textSubtle,
                  }}
                >
                  Keep going…
                </Text>
              )}
              <Text
                style={{
                  fontFamily: FontFamily.mono,
                  fontSize: 12,
                  color: colors.textSubtle,
                }}
              >
                {inputLength}/{INPUT_LIMITS.LONG_TEXT.max}
              </Text>
            </View>
          </View>
        </View>
      );
    }

    if (baseStep.type === 'themeType') {
      const iconMap: Record<string, React.ReactNode> = {
        // Theme icons (small, muted)
        trust: <Hand size={16} color={colors.textMuted} />,
        identity: <Fingerprint size={16} color={colors.textMuted} />,
        rest: <Moon size={16} color={colors.textMuted} />,
        presence: <Eye size={16} color={colors.textMuted} />,
        healing: <Heart size={16} color={colors.textMuted} />,
        joy: <Sparkle size={16} color={colors.textMuted} />,
        gratitude: <Sparkles size={16} color={colors.textMuted} />,
        lament: <CloudRain size={16} color={colors.textMuted} />,
        hope: <Sun size={16} color={colors.textMuted} />,
        purpose: <Compass size={16} color={colors.textMuted} />,
        courage: <Mountain size={16} color={colors.textMuted} />,
        conviction: <Flame size={16} color={colors.textMuted} />,
        surrender: <Wind size={16} color={colors.textMuted} />,
        discipline: <Target size={16} color={colors.textMuted} />,
        justice: <Scale size={16} color={colors.textMuted} />,
        wonder: <Stars size={16} color={colors.textMuted} />,
        // Study type icons (larger, accent color)
        personal: <User size={20} color={colors.accent} />,
        book_study: <BookOpen size={20} color={colors.accent} />,
        character_study: <Users size={20} color={colors.accent} />,
        psalm_journey: <Music size={20} color={colors.accent} />,
        beatitudes: <Crown size={20} color={colors.accent} />,
        fruit_of_spirit: <Leaf size={20} color={colors.accent} />,
        lords_prayer: <MessageCircle size={20} color={colors.accent} />,
        names_of_god: <Flame size={20} color={colors.accent} />,
        seasons: <Calendar size={20} color={colors.accent} />,
        parables: <MessageCircle size={20} color={colors.accent} />,
      };

      if (themeSelectionMode === 'none') {
        const selectedMode = data.selectedMainOption;
        
        return (
          <View style={{ gap: 16 }}>
            {/* Theme/Topic option */}
            <Pressable
              onPress={() => { 
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
                setData((prev) => ({ 
                  ...prev, 
                  selectedMainOption: 'theme',
                  selectedThemes: [],
                  selectedType: undefined,
                  selectedStudySubject: undefined,
                }));
              }}
            >
              {({ pressed }) => {
                const isSelected = selectedMode === 'theme';
                const showPressed = isSelected || (!selectedMode && pressed);
                return (
                  <View style={{
                    backgroundColor: showPressed ? colors.buttonBackgroundPressed : colors.inputBackground,
                    paddingHorizontal: 24,
                    paddingVertical: 24,
                    borderRadius: 20,
                    borderWidth: 2,
                    borderColor: isSelected ? colors.borderFocused : colors.border,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                      <View style={{
                        width: 48, height: 48, borderRadius: 14,
                        backgroundColor: isDark ? 'rgba(200, 165, 92, 0.12)' : 'rgba(154, 123, 60, 0.08)',
                        justifyContent: 'center', alignItems: 'center',
                      }}>
                        <Heart size={22} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 17, color: colors.text, letterSpacing: -0.2 }}>A theme or topic</Text>
                        <Text style={{ fontFamily: FontFamily.body, fontSize: 14, color: colors.textMuted, marginTop: 6, lineHeight: 20 }}>
                          Trust, courage, joy, lament, discipline...
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }}
            </Pressable>

            {/* Study Type option */}
            <Pressable
              onPress={() => { 
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
                setData((prev) => ({ 
                  ...prev, 
                  selectedMainOption: 'type',
                  selectedThemes: [],
                  selectedType: undefined,
                  selectedStudySubject: undefined,
                }));
              }}
            >
              {({ pressed }) => {
                const isSelected = selectedMode === 'type';
                const showPressed = isSelected || (!selectedMode && pressed);
                return (
                  <View style={{
                    backgroundColor: showPressed ? colors.buttonBackgroundPressed : colors.inputBackground,
                    paddingHorizontal: 24,
                    paddingVertical: 24,
                    borderRadius: 20,
                    borderWidth: 2,
                    borderColor: isSelected ? colors.borderFocused : colors.border,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                      <View style={{
                        width: 48, height: 48, borderRadius: 14,
                        backgroundColor: isDark ? 'rgba(200, 165, 92, 0.12)' : 'rgba(154, 123, 60, 0.08)',
                        justifyContent: 'center', alignItems: 'center',
                      }}>
                        <BookOpen size={22} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 17, color: colors.text, letterSpacing: -0.2 }}>A style of study</Text>
                        <Text style={{ fontFamily: FontFamily.body, fontSize: 14, color: colors.textMuted, marginTop: 6, lineHeight: 20 }}>
                          Book study, character study, psalms, parables...
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }}
            </Pressable>

            {/* Just guide me option */}
            <Pressable
              onPress={() => { 
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
                setData((prev) => ({ 
                  ...prev, 
                  selectedMainOption: 'guided',
                  selectedThemes: [],
                  selectedType: undefined,
                  selectedStudySubject: undefined,
                }));
              }}
            >
              {({ pressed }) => {
                const isSelected = selectedMode === 'guided';
                const showPressed = isSelected || (!selectedMode && pressed);
                return (
                  <View style={{
                    backgroundColor: showPressed ? colors.buttonBackgroundPressed : colors.inputBackground,
                    paddingHorizontal: 24,
                    paddingVertical: 24,
                    borderRadius: 20,
                    borderWidth: 2,
                    borderColor: isSelected ? colors.borderFocused : colors.border,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                      <View style={{
                        width: 48, height: 48, borderRadius: 14,
                        backgroundColor: isDark ? 'rgba(200, 165, 92, 0.12)' : 'rgba(154, 123, 60, 0.08)',
                        justifyContent: 'center', alignItems: 'center',
                      }}>
                        <Wand2 size={22} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 17, color: colors.text, letterSpacing: -0.2 }}>Just guide me</Text>
                        <Text style={{ fontFamily: FontFamily.body, fontSize: 14, color: colors.textMuted, marginTop: 6, lineHeight: 20 }}>
                          We'll craft something based on what you share
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }}
            </Pressable>
          </View>
        );
      }

      if (themeSelectionMode === 'theme') {
        // Group themes by category for better organization
        const themeGroups: Record<string, ThemeCategory[]> = {
          'Inner Life': ['trust', 'identity', 'rest', 'presence'],
          'Heart & Emotion': ['healing', 'joy', 'gratitude', 'lament', 'hope'],
          'Growth & Action': ['purpose', 'courage', 'conviction', 'surrender', 'discipline', 'justice', 'wonder'],
        };

        return (
          <View style={{ flex: 1 }}>
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 13,
                  color: (data.selectedThemes?.length ?? 0) >= 3 ? colors.accent : colors.textMuted,
                }}
              >
                {(data.selectedThemes?.length ?? 0) >= 3 
                  ? 'Maximum 3 themes selected'
                  : `Select up to 3 themes (${data.selectedThemes?.length ?? 0}/3)`}
              </Text>
            </View>
            
            <ScrollView
              ref={scrollViewRef}
              showsVerticalScrollIndicator={false}
              onScroll={handleListScroll}
              scrollEventThrottle={16}
            >
              <View style={{ paddingBottom: 200, gap: 24 }}>
                {Object.entries(themeGroups).map(([groupName, themeIds]) => (
                  <View key={groupName} style={{ gap: 12 }}>
                    <Text
                      style={{
                        fontFamily: FontFamily.mono,
                        fontSize: 11,
                        color: colors.textSubtle,
                        letterSpacing: 0.8,
                        textTransform: 'uppercase',
                      }}
                    >
                      {groupName}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {themeIds.map((themeId) => {
                        const theme = THEME_CATEGORIES.find((t) => t.id === themeId);
                        if (!theme) return null;
                        const isSelected = data.selectedThemes?.includes(themeId) ?? false;
                        const selectionOrder = isSelected 
                          ? (data.selectedThemes?.indexOf(themeId) ?? -1) + 1 
                          : undefined;
                        const isMaxedOut = (data.selectedThemes?.length ?? 0) >= 3 && !isSelected;

                        return (
                          <ThemePill
                            key={themeId}
                            theme={{
                              id: theme.id,
                              name: theme.name,
                              description: theme.description,
                              scriptureFocus: theme.scriptureFocus,
                              toneGuidance: theme.toneGuidance,
                              icon: iconMap[themeId] as React.ReactNode,
                            }}
                            isSelected={isSelected}
                            onPress={() => {
                              if (isMaxedOut) return;
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setData((prev) => {
                                const currentThemes = prev.selectedThemes ?? [];
                                if (currentThemes.includes(themeId)) {
                                  return { ...prev, selectedThemes: currentThemes.filter((t) => t !== themeId) };
                                }
                                if (currentThemes.length >= 3) return prev;
                                return { ...prev, selectedThemes: [...currentThemes, themeId] };
                              });
                            }}
                            selectionOrder={selectionOrder}
                          />
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>

            {showListScrollHint && (
              <Animated.View
                entering={FadeIn}
                exiting={FadeOut}
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 60,
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  paddingBottom: 8,
                }}
              >
                <LinearGradient
                  colors={[
                    isDark ? 'rgba(0,0,0,0)' : 'rgba(250,248,245,0)',
                    colors.background
                  ]}
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 60,
                  }}
                />
                <View
                  style={{
                    width: 32,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: colors.border,
                  }}
                />
              </Animated.View>
            )}
          </View>
        );
      }

      if (themeSelectionMode === 'type') {
        return (
          <View style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} onScroll={handleListScroll} scrollEventThrottle={16}>
              <View style={{ gap: 10, paddingBottom: 200 }}>
                {DEVOTIONAL_TYPES.map((type) => {
                  const isSelected = data.selectedType === type.id;
                  const Icon = iconMap[type.id] || <BookOpen size={20} color={colors.textMuted} />;
                  const needsSubject = TYPES_WITH_SUBJECT_SELECTION.includes(type.id);
                  
                  return (
                    <Pressable
                      key={type.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        const newType = isSelected ? undefined : type.id;
                        setData((prev) => ({
                          ...prev,
                          selectedType: newType,
                          selectedStudySubject: undefined,
                        }));
                        
                        // Auto-advance if type doesn't need subject selection
                        if (newType && !needsSubject) {
                          // Note: we keep themeSelectionSubMode so back button returns to type selection
                          // Small delay to let state update before advancing
                          setTimeout(() => {
                            const currentIdx = STEPS.findIndex((s) => s.id === currentStepId);
                            if (currentIdx < STEPS.length - 1) {
                              const nextStepId = STEPS[currentIdx + 1].id as StepId;
                              setCurrentStepId(nextStepId);
                            }
                          }, 150);
                        }
                      }}
                    >
                      {({ pressed }) => {
                        const showPressed = isSelected || pressed;
                        return (
                          <View style={{
                            backgroundColor: showPressed ? colors.buttonBackgroundPressed : colors.inputBackground,
                            paddingHorizontal: 18,
                            paddingVertical: 16,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: isSelected ? colors.borderFocused : colors.border,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                          }}>
                            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: isDark ? 'rgba(200, 165, 92, 0.12)' : 'rgba(154, 123, 60, 0.08)', justifyContent: 'center', alignItems: 'center' }}>
                              {Icon}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 15, color: colors.text }}>{type.name}</Text>
                              <Text style={{ fontFamily: FontFamily.body, fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 }}>{type.description}</Text>
                            </View>
                          </View>
                        );
                      }}
                    </Pressable>
                  );
                })}

                <View
                  style={{
                    marginTop: 24,
                    padding: 16,
                    backgroundColor: colors.inputBackground,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: 0.7,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Crown size={18} color={colors.textMuted} />
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.textMuted }}>More study types coming soon</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        );
      }

      return null;
    }

    if (baseStep.type === 'studySubject') {
      const getSubjectList = () => {
        if (data.selectedType === 'book_study') {
          return BIBLE_BOOKS_FOR_STUDY.map(book => ({
            id: book.name,
            name: book.name,
            description: book.description,
          }));
        }
        if (data.selectedType === 'character_study') {
          return BIBLICAL_CHARACTERS.map(char => ({
            id: char.name,
            name: char.name,
            description: char.description,
          }));
        }
        return [];
      };

      const subjects = getSubjectList();
      const isBookStudy = data.selectedType === 'book_study';

      return (
        <View style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false} onScroll={handleListScroll} scrollEventThrottle={16}>
            <View style={{ gap: 10, paddingBottom: 200 }}>
              {subjects.map((subject) => {
                const isSelected = data.selectedStudySubject === subject.id;
                return (
                  <Pressable
                    key={subject.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setData((prev) => ({
                        ...prev,
                        selectedStudySubject: isSelected ? undefined : subject.id,
                      }));
                    }}
                  >
                    {({ pressed }) => {
                      const showPressed = isSelected || pressed;
                      return (
                        <View style={{
                          backgroundColor: showPressed ? colors.buttonBackgroundPressed : colors.inputBackground,
                          paddingHorizontal: 18,
                          paddingVertical: 16,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: isSelected ? colors.borderFocused : colors.border,
                        }}
                        >
                          <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 15, color: colors.text }}>{subject.name}</Text>
                          <Text style={{ fontFamily: FontFamily.body, fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 }}>{subject.description}</Text>
                        </View>
                      );
                    }}
                  </Pressable>
                );
              })}
              
              {isBookStudy && (
                <View
                  style={{
                    marginTop: 24,
                    padding: 16,
                    backgroundColor: colors.inputBackground,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: 0.7,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <BookOpen size={18} color={colors.textMuted} />
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.textMuted }}>More book studies coming soon</Text>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      );
    }

    if (baseStep.type === 'choice' || baseStep.type === 'timeChoice') {
      const dynamicDescs = {} as Record<string | number, string>;
      return (
        <View className="space-y-3">
          {baseStep.options?.map((option: { value: string | number; label: string; description?: string; time?: string }) => {
            const isSelected = data[stepId] === option.value;
            const displayDescription = dynamicDescs?.[option.value] ?? option.description;
            return (
              <Pressable
                key={String(option.value)}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateData(stepId, option.value); }}
              >
                {({ pressed }) => {
                  const showPressed = isSelected || pressed;
                  return (
                    <View style={{
                      backgroundColor: showPressed ? colors.buttonBackgroundPressed : colors.inputBackground,
                      paddingHorizontal: 20,
                      paddingVertical: 18,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.borderFocused : colors.border,
                    }}
                    >
                      <View>
                        <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 16, color: colors.text }}>{option.label}</Text>
                        {displayDescription && <Text style={{ fontFamily: FontFamily.ui, fontSize: 14, color: colors.textMuted, marginTop: 2 }}>{displayDescription}</Text>}
                        {option.time && <Text style={{ fontFamily: FontFamily.mono, fontSize: 13, color: colors.textSubtle, marginTop: 2 }}>{option.time}</Text>}
                      </View>
                    </View>
                  );
                }}
              </Pressable>
            );
          })}
        </View>
      );
    }

    return null;
  };

  const breathingOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (isLoadingQuestion) {
      breathingOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    }
  }, [isLoadingQuestion]);

  const breathingStyle = useAnimatedStyle(() => ({ opacity: breathingOpacity.value }));

  if (isLoadingQuestion) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} edges={['top']}>
          <Animated.View style={breathingStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, marginHorizontal: 4 }} />
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, marginHorizontal: 4 }} />
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, marginHorizontal: 4 }} />
            </View>
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  // Quick mode loading UI
  if (isQuickMode && isQuickProcessing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} edges={['top']}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={{
            fontFamily: FontFamily.display,
            fontSize: 24,
            color: colors.text,
            marginTop: 24,
          }}>
            Creating your devotional...
          </Text>
          <Text style={{
            fontFamily: FontFamily.body,
            fontSize: 14,
            color: colors.textMuted,
            marginTop: 8,
          }}>
            Quick start • Almost there
          </Text>
        </SafeAreaView>
      </View>
    );
  }

  if (!step) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View className="flex-row items-center justify-between px-4 py-3">
            <Pressable onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: 8 }}>
              <ChevronLeft size={24} color={colors.textMuted} />
            </Pressable>
            
            <Pressable
              onPress={handleNext}
              disabled={!canProceed()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ padding: 8 }}
            >
              <Text style={{ 
                fontFamily: FontFamily.uiMedium, 
                fontSize: 14, 
                color: canProceed() ? colors.text : colors.textMuted 
              }}>
                {isLastStep ? 'Create' : 'Continue'}
              </Text>
            </Pressable>
          </View>

          {(baseStep?.type === 'themeType' && themeSelectionMode !== 'none') || baseStep?.type === 'studySubject' ? (
            <View className="flex-1 px-6" style={{ paddingTop: 40 }}>
              <View key={`${currentStepId}-${step.question}`}>
                <TypewriterText 
                  text={
                    baseStep?.type === 'themeType' && themeSelectionMode === 'theme' 
                      ? "What themes are on your heart?"
                      : baseStep?.type === 'themeType' && themeSelectionMode === 'type'
                      ? "What would you like to study?"
                      : step.question
                  } 
                  onComplete={handleTypewriterComplete} 
                  style={{ fontSize: 28, lineHeight: 38 }} 
                />
              </View>
              {showInput && (
                <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 12, marginBottom: 24 }}>
                  <Text style={{ fontFamily: FontFamily.body, fontSize: 16, color: colors.textMuted, lineHeight: 24 }}>
                    {baseStep?.type === 'themeType' && themeSelectionMode === 'theme'
                      ? "Select up to 3 themes that resonate with where you are."
                      : baseStep?.type === 'themeType' && themeSelectionMode === 'type'
                      ? "Choose a study style for your journey."
                      : step.subtext}
                  </Text>
                </Animated.View>
              )}
              {showInput && <Animated.View style={[inputAnimatedStyle, { flex: 1 }]}>{renderInput()}</Animated.View>}
            </View>
          ) : (
            <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingTop: 40, paddingBottom: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View key={`${currentStepId}-${step.question}`}>
                <TypewriterText text={step.question} onComplete={handleTypewriterComplete} style={{ fontSize: 28, lineHeight: 38 }} />
              </View>
              {showInput && (
                <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 12, marginBottom: 32 }}>
                  <Text style={{ fontFamily: FontFamily.body, fontSize: 16, color: colors.textMuted, lineHeight: 24 }}>{step.subtext}</Text>
                </Animated.View>
              )}
              {showInput && <Animated.View style={inputAnimatedStyle}>{renderInput()}</Animated.View>}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
