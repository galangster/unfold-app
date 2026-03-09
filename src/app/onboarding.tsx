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
  LayoutAnimation,
  Keyboard,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  FadeIn,
  FadeOut,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, XIcon, HandIcon, FingerprintIcon, MoonIcon, CompassIcon, HeartIcon, EyeIcon, FireIcon, SparkleIcon, CloudRainIcon, ScalesIcon, CrosshairIcon, BookOpenIcon, UsersIcon, MusicNotesIcon, CrownIcon, LeafIcon, ChatCircleIcon, CalendarIcon, MagicWandIcon, SmileyIcon, GiftIcon, BinocularsIcon, CloudIcon, ShieldIcon } from 'phosphor-react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple, signInAnonymously } from '@/lib/appleAuth';
import { logger } from '@/lib/logger';
import { Analytics, AnalyticsEvents } from '@/lib/analytics';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { INPUT_LIMITS } from '@/lib/validation';
import { TypewriterText } from '@/components/TypewriterText';
import { CompanionOrb } from '@/components/CompanionOrb';
import { AdaptiveQuestionFlow } from '@/components/AdaptiveQuestionFlow';
import { useUnfoldStore, UserProfile, BIBLE_TRANSLATIONS, BibleTranslation, ThemeCategory, DevotionalType } from '@/lib/store';
import { generateAdaptiveQuestion } from '@/lib/devotional-service';
import { THEME_CATEGORIES, DEVOTIONAL_TYPES, BIBLICAL_CHARACTERS, BIBLE_BOOKS_FOR_STUDY, ThemeCategoryInfo, DevotionalTypeInfo, getThemeById, getDevotionalTypeById } from '@/constants/devotional-types';
import {
  pickRandomVariation,
  getRandomDurationSubtext,
  getRandomReadingSubtext,
} from '@/constants/onboarding-questions';

// Types with subject selection
const TYPES_WITH_SUBJECT_SELECTION = ['book_study', 'character_study'];

// Quippy biblical loading phrases for the adaptive question generation
const LOADING_QUIPS = [
  'Contemplating...',
  'Pondering...',
  'Seeking wisdom...',
  'Listening...',
  'In quietness...',
  'Stillness...',
  'Reflecting...',
  'Waiting...',
  'Be still...',
  'Resting...',
  'Considering...',
  'Meditating...',
  'Attending...',
  'Pausing...',
  'Dwelling...',
];

const getRandomLoadingQuip = () => LOADING_QUIPS[Math.floor(Math.random() * LOADING_QUIPS.length)];

// ThemePill component - defined at module scope to avoid nested component definition
interface ThemePillProps {
  theme: {
    id: ThemeCategory;
    name: string;
    description: string;
    scriptureFocus: string[];
    toneGuidance: string;
    icon: React.ReactNode;
  };
  isSelected: boolean;
  onPress: () => void;
  selectionOrder?: number;
  colors: {
    buttonBackgroundPressed: string;
    inputBackground: string;
    borderFocused: string;
    border: string;
    text: string;
    textMuted: string;
    accent: string;
    background: string;
  };
}

function ThemePill({ theme, isSelected, onPress, selectionOrder, colors }: ThemePillProps) {
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
        {selectionOrder !== undefined && (
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: colors.accent,
              justifyContent: 'center',
              alignItems: 'center',
              marginLeft: 4,
            }}
          >
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 11, color: colors.background }}>
              {selectionOrder}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// Icon map for themes and types
const iconMap: Record<string, React.ReactNode> = {
  // Themes
  trust: <FingerprintIcon size={18} color="#9A7B3C" weight="regular" />,
  courage: <FireIcon size={18} color="#9A7B3C" weight="regular" />,
  joy: <SmileyIcon size={18} color="#9A7B3C" weight="regular" />,
  lament: <CloudRainIcon size={18} color="#9A7B3C" weight="regular" />,
  discipline: <CrosshairIcon size={18} color="#9A7B3C" weight="regular" />,
  identity: <FingerprintIcon size={18} color="#9A7B3C" weight="regular" />,
  purpose: <CompassIcon size={18} color="#9A7B3C" weight="regular" />,
  healing: <HeartIcon size={18} color="#9A7B3C" weight="regular" />,
  gratitude: <GiftIcon size={18} color="#9A7B3C" weight="regular" />,
  hope: <SparkleIcon size={18} color="#9A7B3C" weight="regular" />,
  rest: <MoonIcon size={18} color="#9A7B3C" weight="regular" />,
  presence: <EyeIcon size={18} color="#9A7B3C" weight="regular" />,
  conviction: <ScalesIcon size={18} color="#9A7B3C" weight="regular" />,
  surrender: <HandIcon size={18} color="#9A7B3C" weight="regular" />,
  justice: <ScalesIcon size={18} color="#9A7B3C" weight="regular" />,
  wonder: <BinocularsIcon size={18} color="#9A7B3C" weight="regular" />,
  // Study types
  personal_journey: <CompassIcon size={20} color="#9A7B3C" weight="regular" />,
  book_study: <BookOpenIcon size={20} color="#9A7B3C" weight="regular" />,
  character_study: <UsersIcon size={20} color="#9A7B3C" weight="regular" />,
  psalm_journey: <MusicNotesIcon size={20} color="#9A7B3C" weight="regular" />,
  beatitudes: <CrownIcon size={20} color="#9A7B3C" weight="regular" />,
  fruit_of_spirit: <LeafIcon size={20} color="#9A7B3C" weight="regular" />,
  lords_prayer: <ChatCircleIcon size={20} color="#9A7B3C" weight="regular" />,
  names_of_god: <FireIcon size={20} color="#9A7B3C" weight="regular" />,
  seasons: <CalendarIcon size={20} color="#9A7B3C" weight="regular" />,
  parables: <ChatCircleIcon size={20} color="#9A7B3C" weight="regular" />,
};

const ALL_STEPS = [
  { id: 'name', question: "What's your name?", subtext: 'Just your first name is perfect.', type: 'text' as const, placeholder: 'Your name', adaptive: false, skipIfHasValue: true, hasVariations: false },
  { id: 'aboutMe', question: 'Tell me about\u00A0yourself.', subtext: "The more you share, the more personal your devotionals become. Your story stays on your device \u2014 we never train AI on your\u00A0private\u00A0writing.", type: 'multiline' as const, placeholder: "I'm a dad, an entrepreneur, and lately I've been wrestling with...", adaptive: false, skipIfHasValue: true, hasVariations: false },
  // EXPLORATION: Theme/topic selection (optional)
  { id: 'themeType', question: 'Is there something specific you want\u00A0to\u00A0explore?', subtext: 'Pick one that resonates, or skip to let us\u00A0guide\u00A0you.', type: 'themeType' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
  // SUBJECT SELECTION: After choosing a study type, pick the specific subject (book, character, etc.)
  { id: 'studySubject', question: 'Which would you like to study?', subtext: 'Pick one to journey through together.', type: 'studySubject' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false, conditionalOn: 'selectedType' },
  // DISCOVERY STEP 1: Opening - Where are you right now? (contextual based on study type)
  { id: 'currentSituation', question: "What's been on your\u00A0heart\u00A0lately?", subtext: "The thing that's there when the noise\u00A0quiets\u00A0down.", type: 'multiline' as const, placeholder: "Lately, I've been thinking about...", adaptive: true, skipIfHasValue: false, hasVariations: true },
  // DISCOVERY STEP 2: Going deeper - What's underneath? (contextual based on study type)
  { id: 'emotionalState', question: "And what's underneath\u00A0that?", subtext: "There's usually something deeper. Take\u00A0your\u00A0time.", type: 'multiline' as const, placeholder: "When I sit with it, I realize...", adaptive: true, skipIfHasValue: false, hasVariations: true },
  // DISCOVERY STEP 3: The longing - What would breakthrough look like? (contextual based on study type)
  { id: 'spiritualSeeking', question: "What would feel like a breath of fresh air\u00A0right\u00A0now?", subtext: "If something could shift, what would you hope it\u00A0would\u00A0be?", type: 'multiline' as const, placeholder: "I think what I really need is...", adaptive: true, skipIfHasValue: false, hasVariations: true },
  { id: 'readingDuration', question: 'How long should each devotional be?', subtext: "We'll craft each day to fit your rhythm.", type: 'choice' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false, hasDynamicOptions: true, options: [{ value: 5, label: '5 minutes', description: 'A quick breath' }, { value: 15, label: '15 minutes', description: 'A thoughtful pause' }, { value: 30, label: '30 minutes', description: 'A deep dive' }] },
  { id: 'devotionalLength', question: 'How long would you like this journey\u00A0to\u00A0be?', subtext: 'You can always create another when this\u00A0one\u00A0ends.', type: 'choice' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false, hasDynamicOptions: true, options: [{ value: 3, label: '3 days', description: 'Just a taste' }, { value: 7, label: '7 days', description: 'Enough to build a rhythm' }, { value: 14, label: '14 days', description: 'Room to go deep' }, { value: 30, label: '30 days', description: 'A real transformation' }] },
  { id: 'reminderTime', question: 'When should we\u00A0remind\u00A0you?', subtext: "A gentle nudge to pause and reflect. You can change\u00A0this\u00A0anytime.", type: 'timeChoice' as const, placeholder: '', adaptive: false, skipIfHasValue: true, hasVariations: false, options: [{ value: '6:00 AM', label: 'Early morning', time: '6:00 AM' }, { value: '8:00 AM', label: 'Morning', time: '8:00 AM' }, { value: '12:00 PM', label: 'Midday', time: '12:00 PM' }, { value: '6:00 PM', label: 'Evening', time: '6:00 PM' }, { value: '9:00 PM', label: 'Night', time: '9:00 PM' }] },
  // MIRROR-BACK: Reflect the user's answers back and ask for commitment
  { id: 'mirrorBack', question: "Here's what I\u00A0heard.", subtext: 'Before we build this, I want to make sure I got\u00A0it\u00A0right.', type: 'mirrorBack' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
  // COMPANION INTRO: Introduce the companion orb
  { id: 'companionIntro', question: 'Meet your\u00A0companion.', subtext: 'Every day, it learns more about you. The longer you stay, the more personal\u00A0it\u00A0gets.', type: 'companionIntro' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
  // SIGN-IN: Optional Apple Sign In before generating
  { id: 'signIn', question: 'One last\u00A0thing.', subtext: 'Keep your journey safe across all\u00A0your\u00A0devices.', type: 'signIn' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
];

type StepId = 'name' | 'aboutMe' | 'themeType' | 'studySubject' | 'currentSituation' | 'emotionalState' | 'spiritualSeeking' | 'readingDuration' | 'devotionalLength' | 'reminderTime' | 'mirrorBack' | 'companionIntro' | 'signIn';

// Discovery chips — tappable quick-select options for the 3 discovery questions
// Each chip is a feeling/situation that seeds context without requiring typing
const DISCOVERY_CHIPS: Record<string, string[]> = {
  currentSituation: [
    'Anxious', 'Grateful', 'Searching', 'Tired', 'Hopeful',
    'Overwhelmed', 'Growing', 'Waiting', 'Restless', 'At peace',
    'In transition', 'Grieving',
  ],
  emotionalState: [
    'Fear', 'Loneliness', 'Doubt', 'Grief', 'Anger',
    'Shame', 'Restlessness', 'Yearning', 'Emptiness',
    'Burnout', 'Confusion', 'Numbness',
  ],
  spiritualSeeking: [
    'Peace', 'Clarity', 'Direction', 'Healing', 'Purpose',
    'Forgiveness', 'Strength', 'Rest', 'Joy', 'Community',
    'Patience', 'Hope',
  ],
};

interface OnboardingData {
  name: string;
  bibleTranslation: BibleTranslation;
  aboutMe: string;
  selectedMainOption?: 'theme' | 'type' | 'guided';
  selectedThemes: ThemeCategory[];
  selectedType?: DevotionalType;
  selectedStudySubject?: string;
  currentSituation: string;
  emotionalState: string;
  spiritualSeeking: string;
  readingDuration: 5 | 15 | 30;
  devotionalLength: 3 | 7 | 14 | 30;
  reminderTime: string;
  mirrorBackCommitted: boolean;
}

// Progress indicator component
function ProgressIndicator({ currentStepIndex, totalSteps, colors }: { currentStepIndex: number; totalSteps: number; colors: any }) {
  // Intentionally hidden for a calmer, less "step-counted" onboarding feel.
  void currentStepIndex;
  void totalSteps;
  void colors;
  return null;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const existingUser = useUnfoldStore((s) => s.user);
  const setUser = useUnfoldStore((s) => s.setUser);
  const updateUser = useUnfoldStore((s) => s.updateUser);
  
  // Track which step we're on (from filtered list)
  const [currentStepId, setCurrentStepId] = useState<StepId>('name');

  // Sign-in step state
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isAppleAvailable, setIsAppleAvailable] = useState(true);
  const [signInError, setSignInError] = useState<string | null>(null);
  
  // Track if user is in theme sub-selection mode
  const [themeSelectionMode, setThemeSelectionMode] = useState<'none' | 'theme' | 'type'>('none');
  
  // Track if we're preparing for discovery (generating adaptive questions)
  const [isPreparingDiscovery, setIsPreparingDiscovery] = useState(false);
  const [preparingQuip, setPreparingQuip] = useState('Contemplating...');
  
  // Adaptive question states
  const [adaptedSteps, setAdaptedSteps] = useState<Record<string, { question: string; subtext: string }>>({});
  const [isLoadingAdaptive, setIsLoadingAdaptive] = useState(false);
  const ripple1 = useSharedValue(0);
  const ripple2 = useSharedValue(0);
  const ripple3 = useSharedValue(0);
  
  // Discovery chips — multi-select state per step
  const [selectedChips, setSelectedChips] = useState<Record<string, string[]>>({
    currentSituation: [],
    emotionalState: [],
    spiritualSeeking: [],
  });

  // Track whether the user has already seen the paywall during onboarding
  const hasSeenPaywallRef = useRef(false);
  // Track the step to resume after paywall dismissal
  const postPaywallStepRef = useRef<StepId | null>(null);

  // Transition state for animations
  const isTransitioningRef = useRef(false);
  
  // Form data
  const [data, setData] = useState<OnboardingData>({
    name: existingUser?.name || '',
    bibleTranslation: existingUser?.bibleTranslation || 'WEB',
    aboutMe: existingUser?.aboutMe || '',
    selectedMainOption: undefined,
    selectedThemes: [],
    selectedType: undefined,
    selectedStudySubject: undefined,
    currentSituation: '',
    emotionalState: '',
    spiritualSeeking: '',
    readingDuration: 15,
    devotionalLength: 7,
    reminderTime: '8:00 AM',
    mirrorBackCommitted: false,
  });
  
  // UI animation states
  const [showInput, setShowInput] = useState(false);
  const [showListScrollHint, setShowListScrollHint] = useState(true);
  const inputOpacity = useSharedValue(0);
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Animated styles
  const inputAnimatedStyle = useAnimatedStyle(() => ({
    opacity: inputOpacity.value,
  }));

  // Check Apple Sign In availability on mount
  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setIsAppleAvailable);
  }, []);

  const ripple1Style = useAnimatedStyle(() => ({
    opacity: Math.max(0, 0.35 - ripple1.value * 0.35),
    transform: [{ scale: 0.35 + ripple1.value * 1.5 }],
  }));

  const ripple2Style = useAnimatedStyle(() => ({
    opacity: Math.max(0, 0.3 - ripple2.value * 0.3),
    transform: [{ scale: 0.35 + ripple2.value * 1.5 }],
  }));

  const ripple3Style = useAnimatedStyle(() => ({
    opacity: Math.max(0, 0.25 - ripple3.value * 0.25),
    transform: [{ scale: 0.35 + ripple3.value * 1.5 }],
  }));

  useEffect(() => {
    if (!isLoadingAdaptive) {
      ripple1.value = 0;
      ripple2.value = 0;
      ripple3.value = 0;
      return;
    }

    ripple1.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    ripple2.value = withDelay(
      550,
      withRepeat(withTiming(1, { duration: 1700, easing: Easing.out(Easing.ease) }), -1, false)
    );
    ripple3.value = withDelay(
      1100,
      withRepeat(withTiming(1, { duration: 1700, easing: Easing.out(Easing.ease) }), -1, false)
    );
  }, [isLoadingAdaptive, ripple1, ripple2, ripple3]);
  
  // Keyboard height tracking for scroll adjustment
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  // Filter steps based on what we already know
  const STEPS = useMemo(() => {
    const filtered = ALL_STEPS.filter((step) => {
      // Skip study subject if user selected themes or guided mode (not a study type)
      if (step.id === 'studySubject') {
        // If they selected themes or guided, skip subject selection
        if (data.selectedMainOption === 'theme' || data.selectedMainOption === 'guided') {
          return false;
        }
        // If they selected "type" mode but haven't picked a specific type yet, skip
        if (data.selectedMainOption === 'type' && !data.selectedType) {
          return false;
        }
        // If they selected a type that doesn't need subject selection, skip
        if (data.selectedType && !TYPES_WITH_SUBJECT_SELECTION.includes(data.selectedType)) {
          return false;
        }
      }
      
      // Skip sign-in if user is already authenticated with Apple
      if (step.id === 'signIn' && existingUser?.authProvider === 'apple') {
        return false;
      }

      if (step.skipIfHasValue) {
        const stepId = step.id as StepId;
        if (stepId === 'name' && existingUser?.name) return false;
        if (stepId === 'aboutMe' && existingUser?.aboutMe) return false;
        if (stepId === 'reminderTime' && existingUser?.reminderTime) return false;
      }
      return true;
    });
    
    return filtered;
  }, [existingUser, data.selectedMainOption, data.selectedType]);
  
  // Find current step from filtered STEPS array
  const step = useMemo(() => STEPS.find((s) => s.id === currentStepId), [STEPS, currentStepId]);
  const baseStep = ALL_STEPS.find((s) => s.id === currentStepId);
  
  // Helper to get the index of current step in STEPS array
  const currentStepIndex = useMemo(() => {
    return STEPS.findIndex((s) => s.id === currentStepId);
  }, [STEPS, currentStepId]);
  const isLastStep = currentStepIndex === STEPS.length - 1;

  useEffect(() => {
    if (step || STEPS.length === 0) return;

    // Don't auto-advance if we're in a theme/type sub-mode selection (wait for user to complete selection)
    if (baseStep?.type === 'themeType' && themeSelectionMode !== 'none') {
      return;
    }

    const allOrder = ALL_STEPS.map((s) => s.id);
    const currentOrder = allOrder.indexOf(currentStepId);
    const fallback =
      STEPS.find((s) => allOrder.indexOf(s.id) > currentOrder) ||
      STEPS[STEPS.length - 1] ||
      STEPS[0];

    if (fallback?.id && fallback.id !== currentStepId) {
      setCurrentStepId(fallback.id as StepId);
    }
  }, [step, STEPS, currentStepId, themeSelectionMode, baseStep?.type]);

  const getStepIds = () => STEPS.map((s) => s.id);
  
  // Get display text for current step (adaptive or default)
  const getStepQuestion = () => {
    if (!step) return '';
    const adapted = adaptedSteps[step.id];
    return adapted?.question ?? step.question;
  };

  const getStepSubtext = () => {
    if (!step) return '';
    const adapted = adaptedSteps[step.id];
    return adapted?.subtext ?? step.subtext;
  };
  
  // Check if current step can proceed
  const canProceed = () => {
    if (!step) return false;
    
    // For themeType step
    if (baseStep?.type === 'themeType') {
      if (themeSelectionMode === 'none') {
        return !!data.selectedMainOption;
      }
      if (themeSelectionMode === 'theme') {
        return data.selectedThemes.length > 0;
      }
      if (themeSelectionMode === 'type') {
        return !!data.selectedType;
      }
    }
    
    // For studySubject step
    if (baseStep?.type === 'studySubject') {
      return !!data.selectedStudySubject;
    }
    
    // For text/multiline inputs
    if (step.type === 'text' || step.type === 'multiline') {
      const value = data[step.id as keyof OnboardingData];
      // Discovery steps can proceed with chips OR typed text
      const chips = selectedChips[step.id] ?? [];
      if (chips.length > 0) return true;
      if (typeof value === 'string') {
        return value.trim().length > 0;
      }
    }
    
    // For choice inputs
    if (step.type === 'choice' || step.type === 'timeChoice') {
      const value = data[step.id as keyof OnboardingData];
      return value !== undefined && value !== '';
    }

    // Mirror-back and companion intro always allow proceeding
    if (step.type === 'mirrorBack' || step.type === 'companionIntro') {
      return true;
    }

    // Sign-in step — handled by its own buttons, hide Continue from header
    if (step.type === 'signIn') {
      return false;
    }

    return true;
  };
  
  // Handle typewriter animation complete
  const handleTypewriterComplete = () => {
    setShowInput(true);
    inputOpacity.value = withTiming(1, { duration: 300 });
  };

  // Complete onboarding and navigate to generating screen
  const completeOnboarding = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Persist ALL collected data to the store
    const userUpdates: Partial<UserProfile> = {
      name: data.name,
      aboutMe: data.aboutMe,
      currentSituation: data.currentSituation,
      emotionalState: data.emotionalState,
      spiritualSeeking: data.spiritualSeeking,
      readingDuration: data.readingDuration,
      devotionalLength: data.devotionalLength,
      reminderTime: data.reminderTime,
      bibleTranslation: data.bibleTranslation as BibleTranslation,
      hasCompletedOnboarding: true,
      ...(data.selectedThemes.length > 0 ? { selectedTheme: data.selectedThemes[0] } : {}),
      ...(data.selectedType ? { selectedType: data.selectedType } : {}),
      ...(data.selectedStudySubject ? { selectedStudySubject: data.selectedStudySubject } : {}),
    };

    if (existingUser) {
      updateUser(userUpdates);
    } else {
      setUser({
        name: data.name,
        aboutMe: data.aboutMe,
        personaTraits: [],
        currentSituation: data.currentSituation,
        emotionalState: data.emotionalState,
        spiritualSeeking: data.spiritualSeeking,
        readingDuration: data.readingDuration,
        devotionalLength: data.devotionalLength,
        reminderTime: data.reminderTime,
        hasCompletedOnboarding: true,
        hasCompletedStyleOnboarding: false,
        isPremium: false,
        fontSize: 'medium',
        writingStyle: { tone: 'warm', depth: 'balanced', faithBackground: 'growing' },
        bibleTranslation: data.bibleTranslation as BibleTranslation,
        themeMode: 'dark',
        accentTheme: 'gold',
        readingFont: 'source-serif',
        preferredVoice: '694f9389-aac1-45b6-b726-9d9369183238',
        ...(data.selectedThemes.length > 0 ? { selectedTheme: data.selectedThemes[0] } : {}),
        ...(data.selectedType ? { selectedType: data.selectedType } : {}),
        ...(data.selectedStudySubject ? { selectedStudySubject: data.selectedStudySubject } : {}),
      });
    }

    // Paywall was shown early (after name step) — go straight to generating
    router.replace('/generating');
  }, [router, data, existingUser, updateUser, setUser]);

  // Handle Apple Sign In during onboarding
  const handleOnboardingAppleSignIn = useCallback(async () => {
    if (isSigningIn) return;

    setIsSigningIn(true);
    setSignInError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Analytics.logEvent(AnalyticsEvents.SIGN_IN_APPLE_TAPPED);

    try {
      const result = await signInWithApple();

      if (result.success && result.user) {
        Analytics.logEvent(AnalyticsEvents.SIGN_IN_SUCCESS, { auth_provider: 'apple' });
        Analytics.setUserId(result.user.uid);
        Analytics.setUserProperty('auth_provider', 'apple');

        updateUser({
          authUserId: result.user.uid,
          authProvider: 'apple',
          authEmail: result.user.email,
          authDisplayName: result.user.displayName,
          hasSeenSignInPrompt: true,
        });

        logger.log('[Onboarding] Successfully signed in with Apple', { userId: result.user.uid });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Proceed to complete onboarding
        completeOnboarding();
      } else if (result.isCancelled) {
        logger.log('[Onboarding] User cancelled Apple Sign In');
        // Stay on step, user can retry or skip
      } else {
        Analytics.logEvent(AnalyticsEvents.SIGN_IN_ERROR, {
          auth_provider: 'apple',
          error_type: result.error || 'unknown',
        });
        logger.error('[Onboarding] Apple Sign In failed', { error: result.error });

        let friendlyError = 'Unable to sign in. Please try again.';
        if (result.error?.includes('network')) {
          friendlyError = 'Network error. Check your connection and try again.';
        } else if (result.error?.includes('credential') || result.error?.includes('already')) {
          friendlyError = 'This Apple account is already linked to another user.';
        } else if (result.error?.includes('unavailable') || result.error?.includes('digest')) {
          friendlyError = 'Apple Sign In requires a real device. Try skipping for now.';
        }
        setSignInError(friendlyError);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('[Onboarding] Unexpected Apple Sign In error', { error: msg });

      if (msg.includes('digest') || msg.includes('subtle')) {
        setSignInError('Apple Sign In requires a real device. Try skipping for now.');
      } else {
        setSignInError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSigningIn(false);
    }
  }, [isSigningIn, updateUser, completeOnboarding]);

  // Handle skipping sign-in during onboarding
  const handleSkipSignIn = useCallback(async () => {
    if (isSigningIn) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Analytics.logEvent(AnalyticsEvents.SIGN_IN_SKIPPED);

    updateUser({
      hasSeenSignInPrompt: true,
      signInPromptCount: (existingUser?.signInPromptCount ?? 0) + 1,
    });

    logger.log('[Onboarding] User skipped sign-in during onboarding');

    // Proceed to complete onboarding
    completeOnboarding();
  }, [isSigningIn, updateUser, existingUser?.signInPromptCount, completeOnboarding]);

  // Advance to next step
  const advanceToNextStep = useCallback(() => {
    const currentIdx = STEPS.findIndex((s) => s.id === currentStepId);
    if (currentIdx >= STEPS.length - 1) {
      // Last step — complete onboarding
      completeOnboarding();
      return;
    }

    // Show paywall early — after the name step, before anything else
    if (currentStepId === 'name' && !hasSeenPaywallRef.current) {
      hasSeenPaywallRef.current = true;
      postPaywallStepRef.current = STEPS[currentIdx + 1].id as StepId;
      router.push({ pathname: '/paywall', params: { source: 'onboarding_early' } });
      return;
    }

    const nextStepId = STEPS[currentIdx + 1].id as StepId;

    LayoutAnimation.configureNext({
      duration: 200,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });

    setCurrentStepId(nextStepId);
    setShowInput(false);
    setShowListScrollHint(true);
    inputOpacity.value = 0;
  }, [STEPS, currentStepId, inputOpacity, completeOnboarding, router]);

  // Handle next button press
  const handleNext = () => {
    // Prevent double-clicks during transitions
    if (isTransitioningRef.current) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Handle theme type selection sub-modes
    if (baseStep?.type === 'themeType') {
      if (themeSelectionMode === 'none' && data.selectedMainOption) {
        // User selected main option, now enter sub-mode or advance for guided
        if (data.selectedMainOption === 'theme') {
          LayoutAnimation.configureNext({
            duration: 200,
            create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
            update: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
          });
          setThemeSelectionMode('theme');
          return;
        } else if (data.selectedMainOption === 'type') {
          LayoutAnimation.configureNext({
            duration: 200,
            create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
            update: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
          });
          setThemeSelectionMode('type');
          return;
        } else if (data.selectedMainOption === 'guided') {
          // Guided mode - show preparation screen then advance to discovery
          startDiscoveryPreparation('guided');
          return;
        }
      } else if (themeSelectionMode !== 'none') {
        // In sub-mode with selection made
        if (themeSelectionMode === 'theme' && data.selectedThemes.length > 0) {
          startDiscoveryPreparation('theme');
          return;
        } else if (themeSelectionMode === 'type' && data.selectedType) {
          // Check if we need subject selection
          const needsSubject = TYPES_WITH_SUBJECT_SELECTION.includes(data.selectedType);
          if (needsSubject && !data.selectedStudySubject) {
            // Need to select subject first
            advanceToNextStep();
            return;
          }
          startDiscoveryPreparation('type');
          return;
        }
      }
    }

    // If on subject-selection step, prepare discovery before moving on
    if (baseStep?.type === 'studySubject' && data.selectedStudySubject) {
      startDiscoveryPreparation('type');
      return;
    }

    // Default: advance to next step
    // BUT: Never advance if we're in a themeType sub-mode (safety guard)
    if (baseStep?.type === 'themeType' && themeSelectionMode !== 'none') {
      return;
    }

    // Merge discovery chips into the text value before advancing
    const discoveryStepIds = ['currentSituation', 'emotionalState', 'spiritualSeeking'];
    if (discoveryStepIds.includes(currentStepId)) {
      const chips = selectedChips[currentStepId] ?? [];
      if (chips.length > 0) {
        const currentText = (data[currentStepId as keyof OnboardingData] as string || '').trim();
        const chipPrefix = chips.join(', ');
        // Merge: "Anxious, Searching — I've been thinking about..."
        const merged = currentText
          ? `${chipPrefix} — ${currentText}`
          : chipPrefix;
        setData((prev) => ({ ...prev, [currentStepId]: merged }));
      }
    }

    // Dismiss keyboard first to prevent layout shift during animation
    Keyboard.dismiss();

    // If leaving an adaptive discovery step, generate the next adaptive question
    const adaptiveNextMap: Record<string, string> = {
      currentSituation: 'emotionalState',
      emotionalState: 'spiritualSeeking',
    };
    const nextAdaptiveStepId = adaptiveNextMap[currentStepId];
    if (nextAdaptiveStepId && baseStep?.adaptive) {
      // Fire-and-forget: generate adaptive question in background while advancing
      // The question will be ready by the time the typewriter finishes on the next step
      generateNextAdaptiveQuestion(nextAdaptiveStepId);
    }

    // Small delay to let keyboard fully dismiss before animating
    isTransitioningRef.current = true;
    setShowInput(false);
    setShowListScrollHint(true);
    inputOpacity.value = 0;

    setTimeout(() => {
      advanceToNextStep();
      // Reset transitioning flag after animation duration
      setTimeout(() => { isTransitioningRef.current = false; }, 250);
    }, 50);
  };

  // Handle back button
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
      
      // Dismiss keyboard first to prevent layout shift
      Keyboard.dismiss();
      
      LayoutAnimation.configureNext({
        duration: 200,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });
      
      setCurrentStepId(prevStepId);
      setShowInput(false);
      inputOpacity.value = 0;
    }
  };

  // Prepare discovery by generating adaptive questions
  const startDiscoveryPreparation = async (selectionType: 'theme' | 'type' | 'guided') => {
    setIsPreparingDiscovery(true);
    setPreparingQuip(getRandomLoadingQuip());

    // Rotate through quips
    const quipInterval = setInterval(() => {
      setPreparingQuip(getRandomLoadingQuip());
    }, 2000);

    try {
      // Pre-seed first discovery question based on selection type
      const firstQuestion: { question: string; subtext: string } = selectionType === 'theme' ? {
        question: `What does "${data.selectedThemes[0]}" look like in your life right now?`,
        subtext: "The honest, unfiltered reality of where you are.",
      } : selectionType === 'type' ? {
        question: `As you begin this ${data.selectedType?.replace('_', ' ')}, what's on your heart?`,
        subtext: "The thing that's there when the noise quiets down.",
      } : {
        question: "What's been on your heart lately?",
        subtext: "The thing that's there when the noise quiets down.",
      };

      // Set the first adaptive question immediately
      setAdaptedSteps((prev) => ({ ...prev, currentSituation: firstQuestion }));
    } finally {
      clearInterval(quipInterval);
      setIsPreparingDiscovery(false);

      // Advance to discovery
      LayoutAnimation.configureNext({
        duration: 300,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });

      // Reset theme selection mode before advancing
      setThemeSelectionMode('none');
      setCurrentStepId('currentSituation');
    }
  };

  // Generate AI adaptive question for the next discovery step
  const generateNextAdaptiveQuestion = async (nextStepId: string) => {
    // Collect previous Q&A from all answered discovery steps
    const discoverySteps = ['currentSituation', 'emotionalState', 'spiritualSeeking'];
    const previousAnswers: { question: string; answer: string }[] = [];

    for (const stepId of discoverySteps) {
      if (stepId === nextStepId) break; // Stop before the next step
      const answer = data[stepId as keyof OnboardingData];
      if (typeof answer === 'string' && answer.trim()) {
        const adapted = adaptedSteps[stepId];
        const baseStepDef = STEPS.find((s) => s.id === stepId);
        previousAnswers.push({
          question: adapted?.question ?? baseStepDef?.question ?? '',
          answer: answer.trim(),
        });
      }
    }

    if (previousAnswers.length === 0) return; // No context to adapt from

    // Determine step position for the prompt
    const positionMap: Record<string, 'opening' | 'depth' | 'longing'> = {
      currentSituation: 'opening',
      emotionalState: 'depth',
      spiritualSeeking: 'longing',
    };
    const stepPosition = positionMap[nextStepId] ?? 'depth';

    // Get fallback from STEPS definition
    const nextStepDef = STEPS.find((s) => s.id === nextStepId);
    const fallbackQuestion = {
      question: nextStepDef?.question ?? "Tell me more about that.",
      subtext: nextStepDef?.subtext ?? "Take your time.",
    };

    setIsLoadingAdaptive(true);
    try {
      const result = await generateAdaptiveQuestion(previousAnswers, fallbackQuestion, stepPosition);
      setAdaptedSteps((prev) => ({
        ...prev,
        [nextStepId]: { question: result.question, subtext: result.subtext },
      }));
    } catch {
      // Falls back to default step question (adaptedSteps won't have an entry)
    } finally {
      setIsLoadingAdaptive(false);
    }
  };

  // Handle list scroll to show/hide scroll hint
  const handleListScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isScrolledToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 20;
    if (isScrolledToBottom && showListScrollHint) {
      setShowListScrollHint(false);
    }
  };

  // Get adaptive source indicator for dev mode
  const getAdaptiveSource = () => {
    if (!step?.adaptive) return null;
    const adapted = adaptedSteps[step.id];
    if (!adapted) return 'fallback';
    return 'ai';
  };
  
  // Check if step is auto-advance (no Continue button needed)
  const isAutoAdvanceStep = (step: { type?: string } | null | undefined) => {
    if (!step) return false;
    return step.type === 'themeType' || step.type === 'studySubject';
  };

  // Render input based on step type
  const renderInput = () => {
    if (!step) return null;

    if (baseStep?.type === 'themeType') {
      // Handle theme type selection
      if (themeSelectionMode === 'none') {
        const selectedMode = data.selectedMainOption;
        
        return (
          <View style={{ gap: 0 }}>
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
                setThemeSelectionMode('theme');
              }}
            >
              {({ pressed }) => (
              <View style={{
                paddingVertical: 28,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                opacity: pressed ? 0.6 : 1,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                  <View style={{
                    width: 56, height: 56, borderRadius: 16,
                    backgroundColor: isDark ? 'rgba(200, 165, 92, 0.15)' : 'rgba(154, 123, 60, 0.1)',
                    justifyContent: 'center', alignItems: 'center',
                  }}>
                    <HeartIcon size={26} color={colors.accent} weight="light" />
                  </View>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 20, color: colors.text, letterSpacing: -0.3 }}>A theme or topic</Text>
                    <Text style={{ fontFamily: FontFamily.body, fontSize: 15, color: colors.textMuted, marginTop: 8, lineHeight: 22 }}>
                      Trust, courage, joy, lament, discipline...
                    </Text>
                  </View>
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ fontFamily: FontFamily.mono, fontSize: 18, color: colors.accent }}>→</Text>
                  </View>
                </View>
              </View>
              )}
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
                setThemeSelectionMode('type');
              }}
            >
              {({ pressed }) => (
              <View style={{
                paddingVertical: 28,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                opacity: pressed ? 0.6 : 1,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                  <View style={{
                    width: 56, height: 56, borderRadius: 16,
                    backgroundColor: isDark ? 'rgba(200, 165, 92, 0.15)' : 'rgba(154, 123, 60, 0.1)',
                    justifyContent: 'center', alignItems: 'center',
                  }}>
                    <BookOpenIcon size={26} color={colors.accent} weight="light" />
                  </View>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 20, color: colors.text, letterSpacing: -0.3 }}>A style of study</Text>
                    <Text style={{ fontFamily: FontFamily.body, fontSize: 15, color: colors.textMuted, marginTop: 8, lineHeight: 22 }}>
                      Book study, character study, psalms, parables...
                    </Text>
                  </View>
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ fontFamily: FontFamily.mono, fontSize: 18, color: colors.accent }}>→</Text>
                  </View>
                </View>
              </View>
              )}
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
                setThemeSelectionMode('none');
                startDiscoveryPreparation('guided');
              }}
            >
              {({ pressed }) => (
              <View style={{ paddingVertical: 28, opacity: pressed ? 0.6 : 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                  <View style={{
                    width: 56, height: 56, borderRadius: 16,
                    backgroundColor: isDark ? 'rgba(200, 165, 92, 0.15)' : 'rgba(154, 123, 60, 0.1)',
                    justifyContent: 'center', alignItems: 'center',
                  }}>
                    <MagicWandIcon size={26} color={colors.accent} weight="light" />
                  </View>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 20, color: colors.text, letterSpacing: -0.3 }}>Just guide me</Text>
                    <Text style={{ fontFamily: FontFamily.body, fontSize: 15, color: colors.textMuted, marginTop: 8, lineHeight: 22 }}>
                      We'll craft something based on what you share
                    </Text>
                  </View>
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ fontFamily: FontFamily.mono, fontSize: 18, color: colors.accent }}>→</Text>
                  </View>
                </View>
              </View>
              )}
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
                  color: data.selectedThemes.length >= 3 ? colors.accent : colors.textMuted,
                }}
              >
                {data.selectedThemes.length >= 3 
                  ? 'Maximum 3 themes selected'
                  : `Select up to 3 themes (${data.selectedThemes.length}/3)`}
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
                        const isSelected = data.selectedThemes.includes(themeId);
                        const selectionOrder = isSelected 
                          ? data.selectedThemes.indexOf(themeId) + 1 
                          : undefined;
                        const isMaxedOut = data.selectedThemes.length >= 3 && !isSelected;

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
                                if (prev.selectedThemes.includes(themeId)) {
                                  return { ...prev, selectedThemes: prev.selectedThemes.filter((t) => t !== themeId) };
                                }
                                if (prev.selectedThemes.length >= 3) return prev;
                                return { ...prev, selectedThemes: [...prev.selectedThemes, themeId] };
                              });
                            }}
                            selectionOrder={selectionOrder}
                            colors={colors}
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
                  const Icon = iconMap[type.id] || <BookOpenIcon size={20} color={colors.textMuted} weight="regular" />;
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
                    <CrownIcon size={18} color={colors.textMuted} weight="light" />
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

    if (baseStep?.type === 'studySubject') {
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
                          paddingVertical: 14,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: isSelected ? colors.borderFocused : colors.border,
                        }}>
                          <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 16, color: colors.text }}>{subject.name}</Text>
                          <Text style={{ fontFamily: FontFamily.body, fontSize: 13, color: colors.textMuted, marginTop: 3, lineHeight: 18 }}>{subject.description}</Text>
                        </View>
                      );
                    }}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      );
    }

    // Standard input types
    if (step.type === 'text') {
      return (
        <View style={{ marginTop: 8 }}>
          <TextInput
            value={data.name}
            onChangeText={(text) => setData((prev) => ({ ...prev, name: text }))}
            placeholder={step.placeholder}
            placeholderTextColor={colors.textMuted}
            style={{
              fontFamily: FontFamily.body,
              fontSize: 18,
              color: colors.text,
              paddingVertical: 16,
              paddingHorizontal: 20,
              backgroundColor: colors.inputBackground,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            autoFocus
            maxLength={INPUT_LIMITS.NAME.max}
          />
        </View>
      );
    }

    if (step.type === 'multiline') {
      const chips = DISCOVERY_CHIPS[step.id];
      const isDiscoveryStep = !!chips;
      const currentChips = selectedChips[step.id] ?? [];

      return (
        <View style={{ flex: 1 }}>
          {/* Discovery chips — quick-select feelings/situations */}
          {isDiscoveryStep && (
            <View style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 16,
            }}>
              {chips.map((chip) => {
                const isChipSelected = currentChips.includes(chip);
                return (
                  <Pressable
                    key={chip}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedChips((prev) => {
                        const current = prev[step.id] ?? [];
                        const updated = current.includes(chip)
                          ? current.filter((c) => c !== chip)
                          : [...current, chip];
                        return { ...prev, [step.id]: updated };
                      });
                    }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor: isChipSelected ? colors.accent + '18' : colors.inputBackground,
                      borderWidth: 1,
                      borderColor: isChipSelected ? colors.accent + '50' : colors.border,
                    }}
                  >
                    {({ pressed }) => (
                      <Text style={{
                        fontFamily: isChipSelected ? FontFamily.uiMedium : FontFamily.ui,
                        fontSize: 14,
                        color: isChipSelected ? colors.accent : colors.textMuted,
                        opacity: pressed ? 0.7 : 1,
                      }}>
                        {chip}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Text input — primary for aboutMe, optional elaboration for discovery */}
          <View style={{
            flex: isDiscoveryStep ? undefined : 1,
            backgroundColor: colors.inputBackground,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 20,
            minHeight: isDiscoveryStep ? 100 : 200,
          }}>
            <TextInput
              value={data[step.id as keyof OnboardingData] as string}
              onChangeText={(text) => setData((prev) => ({ ...prev, [step.id]: text }))}
              placeholder={isDiscoveryStep && currentChips.length > 0
                ? 'Want to share more? (optional)'
                : step.placeholder}
              placeholderTextColor={colors.textMuted}
              style={{
                flex: isDiscoveryStep ? undefined : 1,
                fontFamily: FontFamily.body,
                fontSize: 17,
                color: colors.text,
                lineHeight: 26,
                textAlignVertical: 'top',
                minHeight: isDiscoveryStep ? 60 : undefined,
              }}
              multiline
              autoFocus={!isDiscoveryStep}
              maxLength={INPUT_LIMITS.LONG_TEXT.max}
            />
          </View>
        </View>
      );
    }

    if (step.type === 'choice' || step.type === 'timeChoice') {
      const options = step.hasDynamicOptions && step.id === 'readingDuration'
        ? step.options
        : step.hasDynamicOptions && step.id === 'devotionalLength'
          ? step.options
          : step.options || [];

      return (
        <View style={{ gap: 12, marginTop: 8 }}>
          {options.map((option) => {
            const isSelected = data[step.id as keyof OnboardingData] === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setData((prev) => ({ ...prev, [step.id]: option.value }));
                  // Auto-advance after a brief delay so user sees their selection
                  setTimeout(() => {
                    Keyboard.dismiss();
                    setShowInput(false);
                    inputOpacity.value = 0;
                    setTimeout(() => advanceToNextStep(), 50);
                  }, 300);
                }}
              >
                {({ pressed }) => {
                  return (
                    <View style={{
                      backgroundColor: pressed ? colors.buttonBackgroundPressed : colors.inputBackground,
                      paddingHorizontal: 20,
                      paddingVertical: 18,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: colors.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <View>
                        <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 16, color: colors.text }}>{option.label}</Text>
                        {'description' in option && option.description && (
                          <Text style={{ fontFamily: FontFamily.body, fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{option.description}</Text>
                        )}
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

    // Mirror-back step: reflect user's answers and commitment button
    if (step.type === 'mirrorBack') {
      // Build the mirror-back text from user data
      const themeName = data.selectedThemes.length > 0
        ? getThemeById(data.selectedThemes[0])?.name ?? ''
        : data.selectedType
          ? getDevotionalTypeById(data.selectedType)?.name ?? ''
          : '';

      const emotionalSnippet = data.emotionalState
        ? data.emotionalState.split(/[.!?]/)[0].trim().toLowerCase()
        : data.currentSituation
          ? data.currentSituation.split(/[.!?]/)[0].trim().toLowerCase()
          : '';

      const seekingSnippet = data.spiritualSeeking
        ? data.spiritualSeeking.split(/[.!?]/)[0].trim().toLowerCase()
        : '';

      return (
        <View style={{ gap: 24, marginTop: 8 }}>
          {/* Mirror-back reflection */}
          <View style={{
            backgroundColor: colors.inputBackground,
            borderRadius: 20,
            padding: 24,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
            <Text style={{
              fontFamily: FontFamily.displayItalic,
              fontSize: 17,
              color: colors.text,
              lineHeight: 28,
            }}>
              {emotionalSnippet && seekingSnippet
                ? `You said you're ${emotionalSnippet}. ${themeName ? `You picked "${themeName}" because that's where you actually are.` : ''} And what you're looking for — ${seekingSnippet}. That tells me something about what you need right now.`
                : emotionalSnippet
                  ? `You said you're ${emotionalSnippet}. ${themeName ? `"${themeName}" — that's not a random pick. That's where you are.` : ''} I hear you.`
                  : `${themeName ? `"${themeName}" — ` : ''}you chose this for a reason. Let's build something for exactly where you are.`
              }
            </Text>
          </View>

          {/* Commitment button */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setData((prev) => ({ ...prev, mirrorBackCommitted: true }));
              // Auto-advance after commitment
              setTimeout(() => {
                setShowInput(false);
                inputOpacity.value = 0;
                setTimeout(() => advanceToNextStep(), 50);
              }, 400);
            }}
          >
            {({ pressed }) => (
              <View style={{
                backgroundColor: pressed ? colors.accent : colors.accent,
                opacity: pressed ? 0.85 : 1,
                paddingVertical: 18,
                paddingHorizontal: 24,
                borderRadius: 16,
                alignItems: 'center',
              }}>
                <Text style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 16,
                  color: '#FFFFFF',
                }}>
                  Build my devotional
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      );
    }

    // Companion intro step: introduce the companion orb
    if (step.type === 'companionIntro') {
      return (
        <View style={{ alignItems: 'center', gap: 32, marginTop: 24 }}>
          {/* Large companion orb — the star of the show */}
          <Animated.View
            entering={FadeIn.delay(200).duration(800)}
            style={{ marginBottom: 8 }}
          >
            <CompanionOrb accentColor={colors.accent} size={96} isActive showBadge={false} />
          </Animated.View>

          {/* Description */}
          <View style={{ gap: 16, paddingHorizontal: 8 }}>
            <Animated.Text
              entering={FadeIn.delay(500).duration(600)}
              style={{
                fontFamily: FontFamily.body,
                fontSize: 16,
                color: colors.text,
                lineHeight: 26,
                textAlign: 'center',
              }}
            >
              This is your companion. It checks in with you, remembers what you share, and shapes each day around where you are.
            </Animated.Text>

            <Animated.Text
              entering={FadeIn.delay(800).duration(600)}
              style={{
                fontFamily: FontFamily.body,
                fontSize: 16,
                color: colors.textMuted,
                lineHeight: 26,
                textAlign: 'center',
              }}
            >
              The more you use Unfold, the more it understands you. Day 30 feels completely different from Day 1.
            </Animated.Text>
          </View>

          {/* Feature hints */}
          <Animated.View
            entering={FadeIn.delay(1100).duration(600)}
            style={{ gap: 12, width: '100%', paddingHorizontal: 4 }}
          >
            {[
              { text: 'Greets you based on your mood and time of day' },
              { text: 'Learns what resonates with you over time' },
              { text: 'Bridges yesterday into today, just for you' },
            ].map((item, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  backgroundColor: colors.accent + '08',
                  borderRadius: 12,
                }}
              >
                <View style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.accent,
                }} />
                <Text style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 14,
                  color: colors.text,
                  flex: 1,
                }}>
                  {item.text}
                </Text>
              </View>
            ))}
          </Animated.View>
        </View>
      );
    }

    // Sign-in step: optional Apple Sign In
    if (step.type === 'signIn') {
      const screenWidth = Dimensions.get('window').width;

      const benefits = [
        {
          icon: <CloudIcon size={20} color={colors.accent} weight="light" />,
          title: 'Sync across devices',
          description: 'Pick up where you left off on any device',
        },
        {
          icon: <ShieldIcon size={20} color={colors.accent} weight="light" />,
          title: 'Secure backup',
          description: 'Never lose your devotionals or journal',
        },
        {
          icon: <SparkleIcon size={20} color={colors.accent} weight="light" />,
          title: 'Personalized experience',
          description: 'Unlock features tailored to your journey',
        },
      ];

      return (
        <View style={{ gap: 32, marginTop: 8 }}>
          {/* Benefits list */}
          <View style={{ gap: 20, paddingHorizontal: 4 }}>
            {benefits.map((benefit, index) => (
              <Animated.View
                key={benefit.title}
                entering={FadeIn.delay(200 + index * 150).duration(500)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <View style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: colors.inputBackground,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {benefit.icon}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{
                    fontFamily: FontFamily.uiSemiBold,
                    fontSize: 15,
                    color: colors.text,
                    letterSpacing: -0.2,
                  }}>
                    {benefit.title}
                  </Text>
                  <Text style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 13,
                    color: colors.textMuted,
                    lineHeight: 18,
                  }}>
                    {benefit.description}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </View>

          {/* Error message */}
          {signInError && (
            <Animated.View
              entering={FadeIn.duration(300)}
              style={{
                backgroundColor: '#EF4444',
                borderRadius: 12,
                padding: 14,
              }}
            >
              <Text style={{
                color: '#FFFFFF',
                fontFamily: FontFamily.ui,
                fontSize: 14,
                textAlign: 'center',
                lineHeight: 20,
              }}>
                {signInError}
              </Text>
            </Animated.View>
          )}

          {/* Apple Sign In button */}
          <Animated.View entering={FadeIn.delay(650).duration(400)}>
            {isAppleAvailable ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={isDark
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={14}
                style={{ width: screenWidth - 48, height: 54 }}
                onPress={handleOnboardingAppleSignIn}
              />
            ) : (
              <Pressable
                onPress={handleOnboardingAppleSignIn}
                disabled={isSigningIn}
                style={{
                  width: screenWidth - 48,
                  height: 54,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.text,
                  opacity: isSigningIn ? 0.8 : 1,
                }}
              >
                <Text style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 16,
                  color: colors.background,
                }}>
                  {isSigningIn ? 'Signing in...' : 'Sign in with Apple'}
                </Text>
              </Pressable>
            )}
          </Animated.View>

          {/* Skip option */}
          <Animated.View entering={FadeIn.delay(800).duration(400)}>
            <Pressable
              onPress={handleSkipSignIn}
              disabled={isSigningIn}
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 12,
                opacity: isSigningIn ? 0.4 : 1,
              }}
            >
              <Text style={{
                fontFamily: FontFamily.ui,
                fontSize: 15,
                color: colors.textMuted,
              }}>
                Continue without signing in
              </Text>
            </Pressable>
          </Animated.View>

          {/* Privacy note */}
          <Animated.View entering={FadeIn.delay(900).duration(400)}>
            <Text style={{
              fontFamily: FontFamily.ui,
              fontSize: 12,
              color: colors.textSubtle,
              textAlign: 'center',
            }}>
              Your privacy matters. We never share your information.
            </Text>
          </Animated.View>

          {/* Loading overlay */}
          {isSigningIn && (
            <View style={{
              position: 'absolute',
              top: 0,
              left: -24,
              right: -24,
              bottom: -120,
              backgroundColor: colors.background + 'E6',
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 16,
            }}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={{
                marginTop: 16,
                fontFamily: FontFamily.uiMedium,
                fontSize: 15,
                color: colors.textMuted,
              }}>
                Signing in...
              </Text>
            </View>
          )}
        </View>
      );
    }

    return null;
  };

  // Loading state during discovery preparation
  if (isPreparingDiscovery) {
    return (
      <View style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' }}>
        <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, opacity: 0.6 }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, opacity: 0.3 }} />
          </View>
          <Text style={{
            fontFamily: FontFamily.ui,
            fontSize: 15,
            color: colors.textMuted,
            letterSpacing: 0.5,
            textAlign: 'center',
          }}>
            {preparingQuip}
          </Text>
        </SafeAreaView>
      </View>
    );
  }

  if (!step) {
    return (
      <View style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontFamily: FontFamily.body, fontSize: 14, color: colors.textMuted }}>Loading next question…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'height' : 'height'}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, minHeight: 52 }}>
            {currentStepIndex > 0 ? (
              <Pressable
                onPress={handleBack}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
              >
                <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.back();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
                accessibilityHint="Go back to the home screen"
                style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
              >
                <XIcon size={22} color={colors.textMuted} weight="light" />
              </Pressable>
            )}
            
            {/* Continue button - hide for choice/timeChoice steps (they auto-advance) */}
            {canProceed() && step.type !== 'choice' && step.type !== 'timeChoice' ? (
              <Pressable
                onPress={handleNext}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ height: 40, justifyContent: 'center', paddingHorizontal: 8 }}
              >
                <Text style={{ 
                  fontFamily: FontFamily.uiMedium, 
                  fontSize: 14, 
                  color: colors.text
                }}>
                  {isLastStep ? 'Create' : 'Continue'}
                </Text>
              </Pressable>
            ) : (
              <View style={{ width: 40, height: 40 }} />
            )}
          </View>

          {/* Progress indicator - always visible */}
          <ProgressIndicator 
            currentStepIndex={currentStepIndex} 
            totalSteps={STEPS.length} 
            colors={colors} 
          />

          <View key={`${currentStepId}-${JSON.stringify(adaptedSteps[currentStepId] || {})}`} style={{ flex: 1 }}>
            {(baseStep?.type === 'themeType' && themeSelectionMode !== 'none') || baseStep?.type === 'studySubject' ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 40 }}>
                  <View>
                    <TypewriterText 
                      text={
                        baseStep?.type === 'themeType' && themeSelectionMode === 'theme' 
                          ? "What themes are on your heart?"
                          : baseStep?.type === 'themeType' && themeSelectionMode === 'type'
                          ? "What would you like to study?"
                          : getStepQuestion()
                      } 
                      onComplete={handleTypewriterComplete} 
                      style={{ fontSize: 28, lineHeight: 36 }} 
                    />
                  </View>
                  {showInput && (
                    <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 12, marginBottom: 24 }}>
                      <Text style={{ fontFamily: FontFamily.body, fontSize: 16, color: colors.textMuted, lineHeight: 24 }}>
                        {baseStep?.type === 'themeType' && themeSelectionMode === 'theme'
                          ? "Select up to 3 themes that resonate with where you are."
                          : baseStep?.type === 'themeType' && themeSelectionMode === 'type'
                          ? "Choose a study style for your journey."
                          : getStepSubtext()}
                      </Text>
                    </Animated.View>
                  )}
                  {showInput && <Animated.View style={[inputAnimatedStyle, { flex: 1 }]}>{renderInput()}</Animated.View>}
                </View>
              </ScrollView>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 120 }}>
                  <View>
                    {isLoadingAdaptive && step?.adaptive ? (
                      <>
                        <View style={{
                          flex: 1,
                          minHeight: 420,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}>
                          <View style={{ width: 88, height: 88, justifyContent: 'center', alignItems: 'center' }}>
                            <Animated.View
                              style={[
                                {
                                  position: 'absolute',
                                  width: 88,
                                  height: 88,
                                  borderRadius: 44,
                                  borderWidth: 1,
                                  borderColor: colors.accent,
                                },
                                ripple1Style,
                              ]}
                            />
                            <Animated.View
                              style={[
                                {
                                  position: 'absolute',
                                  width: 88,
                                  height: 88,
                                  borderRadius: 44,
                                  borderWidth: 1,
                                  borderColor: colors.accent,
                                },
                                ripple2Style,
                              ]}
                            />
                            <Animated.View
                              style={[
                                {
                                  position: 'absolute',
                                  width: 88,
                                  height: 88,
                                  borderRadius: 44,
                                  borderWidth: 1,
                                  borderColor: colors.accent,
                                },
                                ripple3Style,
                              ]}
                            />
                            <View
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 7,
                                backgroundColor: colors.accent,
                                opacity: 0.9,
                              }}
                            />
                          </View>
                        </View>
                      </>
                    ) : (
                      <TypewriterText
                        text={getStepQuestion()}
                        onComplete={handleTypewriterComplete}
                        style={{ fontSize: 28, lineHeight: 36 }}
                      />
                    )}
                  </View>
                  {showInput && (
                    <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 12, marginBottom: 32 }}>
                      <Text style={{ fontFamily: FontFamily.body, fontSize: 16, color: colors.textMuted, lineHeight: 24 }}>{getStepSubtext()}</Text>
                    </Animated.View>
                  )}
                  {showInput && <Animated.View style={inputAnimatedStyle}>{renderInput()}</Animated.View>}
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
