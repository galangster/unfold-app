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
import { ChevronLeft, ChevronDown, ArrowRight, Hand, Fingerprint, Moon, Compass, Heart, Sparkles, Wind, Mountain, Sun, Eye, Flame, Sparkle, CloudRain, Scale, Target, Stars, BookOpen, Users, Music, Crown, Leaf, MessageCircle, Calendar, Wheat, User, Wand2, Smile, Gift, Telescope } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { INPUT_LIMITS } from '@/lib/validation';
import { TypewriterText } from '@/components/TypewriterText';
import { SpeechToTextButton } from '@/components/SpeechToTextButton';
import { AdaptiveQuestionFlow } from '@/components/AdaptiveQuestionFlow';
import { useUnfoldStore, UserProfile, BIBLE_TRANSLATIONS, BibleTranslation, ThemeCategory, DevotionalType } from '@/lib/store';
import { generateAdaptiveQuestion } from '@/lib/devotional-service';
import { THEME_CATEGORIES, DEVOTIONAL_TYPES, BIBLICAL_CHARACTERS, BIBLE_BOOKS_FOR_STUDY, ThemeCategoryInfo, DevotionalTypeInfo } from '@/constants/devotional-types';
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
  trust: <Fingerprint size={18} color="#9A7B3C" />,
  courage: <Flame size={18} color="#9A7B3C" />,
  joy: <Smile size={18} color="#9A7B3C" />,
  lament: <CloudRain size={18} color="#9A7B3C" />,
  discipline: <Target size={18} color="#9A7B3C" />,
  identity: <Fingerprint size={18} color="#9A7B3C" />,
  purpose: <Compass size={18} color="#9A7B3C" />,
  healing: <Heart size={18} color="#9A7B3C" />,
  gratitude: <Gift size={18} color="#9A7B3C" />,
  hope: <Sparkle size={18} color="#9A7B3C" />,
  rest: <Moon size={18} color="#9A7B3C" />,
  presence: <Eye size={18} color="#9A7B3C" />,
  conviction: <Scale size={18} color="#9A7B3C" />,
  surrender: <Hand size={18} color="#9A7B3C" />,
  justice: <Scale size={18} color="#9A7B3C" />,
  wonder: <Telescope size={18} color="#9A7B3C" />,
  // Study types
  personal_journey: <Compass size={20} color="#9A7B3C" />,
  book_study: <BookOpen size={20} color="#9A7B3C" />,
  character_study: <Users size={20} color="#9A7B3C" />,
  psalm_journey: <Music size={20} color="#9A7B3C" />,
  beatitudes: <Crown size={20} color="#9A7B3C" />,
  fruit_of_spirit: <Leaf size={20} color="#9A7B3C" />,
  lords_prayer: <MessageCircle size={20} color="#9A7B3C" />,
  names_of_god: <Flame size={20} color="#9A7B3C" />,
  seasons: <Calendar size={20} color="#9A7B3C" />,
  parables: <MessageCircle size={20} color="#9A7B3C" />,
};

const ALL_STEPS = [
  { id: 'name', question: "What's your name?", subtext: 'Just your first name is perfect.', type: 'text' as const, placeholder: 'Your name', adaptive: false, skipIfHasValue: true, hasVariations: false },
  { id: 'bibleTranslation', question: 'Which Bible translation do you prefer?', subtext: "We'll use this translation for all scripture in your devotionals.", type: 'choice' as const, placeholder: '', adaptive: false, skipIfHasValue: true, hasVariations: false, options: BIBLE_TRANSLATIONS.map((t) => ({ value: t.value, label: t.label, description: t.description })) },
  { id: 'aboutMe', question: 'Tell me about yourself.', subtext: "The more you share, the more personal your devotionals become. Your story, your struggles, what makes you come alive — it all shapes what we create for you.", type: 'multiline' as const, placeholder: "I'm a dad, an entrepreneur, and lately I've been wrestling with...", adaptive: false, skipIfHasValue: true, hasVariations: false },
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
  selectedMainOption?: 'theme' | 'type' | 'guided';
  selectedThemes: ThemeCategory[];
  selectedType?: DevotionalType;
  selectedStudySubject?: string;
  readingDuration: 5 | 15 | 30;
  devotionalLength: 3 | 7 | 14 | 30;
  reminderTime: string;
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
  const { setUser, updateUser, existingUser } = useUnfoldStore();
  
  // Track which step we're on (from filtered list)
  const [currentStepId, setCurrentStepId] = useState<StepId>('name');
  
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
  
  // Transition state for animations
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Form data
  const [data, setData] = useState<OnboardingData>({
    name: existingUser?.name || '',
    bibleTranslation: existingUser?.bibleTranslation || 'niv',
    aboutMe: existingUser?.aboutMe || '',
    selectedMainOption: undefined,
    selectedThemes: [],
    selectedType: undefined,
    selectedStudySubject: undefined,
    readingDuration: 15,
    devotionalLength: 7,
    reminderTime: '8:00 AM',
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
      // Skip reminderTime for non-premium users (push notifications are premium)
      if (step.id === 'reminderTime' && !existingUser?.isPremium) {
        return false;
      }
      
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
      
      if (step.skipIfHasValue) {
        const stepId = step.id as StepId;
        if (stepId === 'name' && existingUser?.name) return false;
        if (stepId === 'bibleTranslation' && existingUser?.bibleTranslation) return false;
        if (stepId === 'aboutMe' && existingUser?.aboutMe) return false;
        if (stepId === 'reminderTime' && existingUser?.reminderTime) return false;
      }
      return true;
    });
    
    console.log('[Onboarding] STEPS recomputed:', filtered.map(s => s.id), 
      '| selectedMainOption:', data.selectedMainOption, 
      '| selectedType:', data.selectedType);
    
    return filtered;
  }, [existingUser, data.selectedMainOption, data.selectedType]);
  
  // Find current step from filtered STEPS array
  const step = useMemo(() => STEPS.find((s) => s.id === currentStepId), [STEPS, currentStepId]);
  const baseStep = ALL_STEPS.find((s) => s.id === currentStepId);
  
  // Helper to get the index of current step in STEPS array
  const currentStepIndex = useMemo(() => {
    const idx = STEPS.findIndex((s) => s.id === currentStepId);
    console.log('[Onboarding] currentStepIndex computed:', idx, '| currentStepId:', currentStepId, '| STEPS:', STEPS.map(s => s.id));
    return idx;
  }, [STEPS, currentStepId]);
  const isLastStep = currentStepIndex === STEPS.length - 1;

  useEffect(() => {
    if (step || STEPS.length === 0) return;

    // Don't auto-advance if we're in a theme/type sub-mode selection (wait for user to complete selection)
    if (baseStep?.type === 'themeType' && themeSelectionMode !== 'none') {
      console.log('[Onboarding] Blocking auto-advance: in themeType sub-mode');
      return;
    }

    const allOrder = ALL_STEPS.map((s) => s.id);
    const currentOrder = allOrder.indexOf(currentStepId);
    const fallback =
      STEPS.find((s) => allOrder.indexOf(s.id) > currentOrder) ||
      STEPS[STEPS.length - 1] ||
      STEPS[0];

    if (fallback?.id && fallback.id !== currentStepId) {
      console.log('[Onboarding] Auto-advancing from', currentStepId, 'to', fallback.id);
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
      if (typeof value === 'string') {
        return value.trim().length > 0;
      }
    }
    
    // For choice inputs
    if (step.type === 'choice' || step.type === 'timeChoice') {
      const value = data[step.id as keyof OnboardingData];
      return value !== undefined && value !== '';
    }
    
    return true;
  };
  
  // Handle typewriter animation complete
  const handleTypewriterComplete = () => {
    setShowInput(true);
    inputOpacity.value = withTiming(1, { duration: 300 });
  };

  // Advance to next step
  const advanceToNextStep = useCallback(() => {
    const currentIdx = STEPS.findIndex((s) => s.id === currentStepId);
    if (currentIdx < STEPS.length - 1) {
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
    }
  }, [STEPS, currentStepId, inputOpacity]);

  // Handle next button press
  const handleNext = () => {
    // Prevent double-clicks during transitions
    if (isTransitioning) return;
    
    console.log('[Onboarding] handleNext called', {
      currentStepId,
      baseStepType: baseStep?.type,
      themeSelectionMode,
      selectedMainOption: data.selectedMainOption,
      selectedType: data.selectedType,
    });
    
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
      console.log('[Onboarding] Blocking default advance: in themeType sub-mode');
      return;
    }
    
    // Dismiss keyboard first to prevent layout shift during animation
    Keyboard.dismiss();
    
    // Small delay to let keyboard fully dismiss before animating
    setTimeout(() => {
      // Configure layout animation before state change
      LayoutAnimation.configureNext({
        duration: 200,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      }, () => {
        // Animation complete callback
        setIsTransitioning(false);
      });
      
      advanceToNextStep();
    }, 50);
    
    setIsTransitioning(true);
    setShowInput(false);
    setShowListScrollHint(true);
    inputOpacity.value = 0;
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
      // Get user answers for context
      const answers = {
        name: data.name,
        bibleTranslation: data.bibleTranslation,
        aboutMe: data.aboutMe,
        selectedThemes: data.selectedThemes,
        selectedType: data.selectedType,
        selectedStudySubject: data.selectedStudySubject,
      };
      
      // Get positions in discovery flow
      const discoverySteps = ['currentSituation', 'emotionalState', 'spiritualSeeking'];
      const stepPositions: Record<string, number> = {
        currentSituation: 1,
        emotionalState: 2,
        spiritualSeeking: 3,
      };
      
      // Pre-seed fallbacks based on selection type
      const seededAdapted: Record<string, { question: string; subtext: string }> = {
        currentSituation: selectionType === 'theme' ? {
          question: `What does "${data.selectedThemes[0]}" look like in your life right now?`,
          subtext: "The honest, unfiltered reality of where you are.",
        } : selectionType === 'type' ? {
          question: `As you begin this ${data.selectedType?.replace('_', ' ')}, what's on your heart?`,
          subtext: "The thing that's there when the noise quiets down.",
        } : {
          question: "What's been on your heart lately?",
          subtext: "The thing that's there when the noise quiets down.",
        },
        emotionalState: selectionType === 'guided' ? 'longing' : 'underneath',
        spiritualSeeking: selectionType === 'guided' ? 'longing' : 'breakthrough',
      };
      
      // No artificial delay here — move straight into discovery for faster feel.
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
            {/* Theme/Topic option - Editorial style, largest */}
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
              {({ pressed }) => {
                const isSelected = selectedMode === 'theme';
                const showPressed = isSelected || (!selectedMode && pressed);
                return (
                  <View style={{
                    paddingVertical: 28,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    backgroundColor: showPressed ? colors.buttonBackgroundPressed : 'transparent',
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                      <View style={{
                        width: 56, height: 56, borderRadius: 16,
                        backgroundColor: isDark ? 'rgba(200, 165, 92, 0.15)' : 'rgba(154, 123, 60, 0.1)',
                        justifyContent: 'center', alignItems: 'center',
                      }}>
                        <Heart size={26} color={colors.accent} />
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
                );
              }}
            </Pressable>

            {/* Study Type option - Medium prominence */}
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
              {({ pressed }) => {
                const isSelected = selectedMode === 'type';
                const showPressed = isSelected || (!selectedMode && pressed);
                return (
                  <View style={{
                    paddingVertical: 24,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    backgroundColor: showPressed ? colors.buttonBackgroundPressed : 'transparent',
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <BookOpen size={20} color={colors.accent} />
                          <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 17, color: colors.text, letterSpacing: -0.2 }}>A style of study</Text>
                        </View>
                        <Text style={{ fontFamily: FontFamily.body, fontSize: 14, color: colors.textMuted, marginTop: 6, lineHeight: 20, marginLeft: 32 }}>
                          Book study, character study, psalms, parables...
                        </Text>
                      </View>
                      <Text style={{ fontFamily: FontFamily.mono, fontSize: 16, color: colors.accent }}>→</Text>
                    </View>
                  </View>
                );
              }}
            </Pressable>

            {/* Just guide me option - Subtle, smallest */}
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
              {({ pressed }) => {
                const isSelected = selectedMode === 'guided';
                const showPressed = isSelected || (!selectedMode && pressed);
                return (
                  <View style={{
                    paddingVertical: 20,
                    backgroundColor: showPressed ? colors.buttonBackgroundPressed : 'transparent',
                    opacity: 0.8,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Wand2 size={18} color={colors.textMuted} />
                        <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.textMuted }}>
                          Just guide me
                        </Text>
                      </View>
                      <Text style={{ fontFamily: FontFamily.body, fontSize: 13, color: colors.textSubtle }}>
                        We'll craft something based on what you share
                      </Text>
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
            maxLength={INPUT_LIMITS.name}
          />
        </View>
      );
    }

    if (step.type === 'multiline') {
      return (
        <View style={{ flex: 1 }}>
          <View style={{
            flex: 1,
            backgroundColor: colors.inputBackground,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 20,
            minHeight: 200,
          }}>
            <TextInput
              value={data[step.id as keyof OnboardingData] as string}
              onChangeText={(text) => setData((prev) => ({ ...prev, [step.id]: text }))}
              placeholder={step.placeholder}
              placeholderTextColor={colors.textMuted}
              style={{
                flex: 1,
                fontFamily: FontFamily.body,
                fontSize: 17,
                color: colors.text,
                lineHeight: 26,
                textAlignVertical: 'top',
              }}
              multiline
              autoFocus
              maxLength={step.id === 'aboutMe' ? INPUT_LIMITS.aboutMe : INPUT_LIMITS.multiline}
            />
          </View>
          <View style={{ marginTop: 16 }}>
            <SpeechToTextButton 
              onTranscript={(text) => {
                setData((prev) => ({ ...prev, [step.id]: text }));
              }}
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

    return null;
  };

  // Loading state during discovery preparation
  if (isPreparingDiscovery) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
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
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontFamily: FontFamily.body, fontSize: 14, color: colors.textMuted }}>Loading next question…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'height' : 'height'}>
          <View className="flex-row items-center justify-between px-4 py-3" style={{ minHeight: 52 }}>
            {currentStepIndex > 0 ? (
              <Pressable
                onPress={handleBack}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
              >
                <ChevronLeft size={24} color={colors.textMuted} />
              </Pressable>
            ) : (
              <View style={{ width: 40, height: 40 }} />
            )}
            
            {/* Continue button - only show when can proceed */}
            {canProceed() ? (
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
              <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View className="flex-1 px-6" style={{ paddingTop: 40 }}>
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
              <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View className="flex-1 px-6" style={{ paddingTop: 40, paddingBottom: 120 }}>
                  <View>
                    {isLoadingAdaptive && step?.adaptive ? (
                      <>
                        <OnboardingEmbers count={16} />
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
                      {__DEV__ && step?.adaptive && getAdaptiveSource() && (
                        <Text style={{ marginTop: 8, fontFamily: FontFamily.ui, fontSize: 12, color: colors.textMuted }}>
                          AI source: {getAdaptiveSource()}
                        </Text>
                      )}
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
