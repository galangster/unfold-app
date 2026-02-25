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
import { useUnfoldStore, UserProfile, BIBLE_TRANSLATIONS, BibleTranslation, ThemeCategory, DevotionalType } from '@/lib/store';
import { generateAdaptiveQuestion } from '@/lib/devotional-service';
import { THEME_CATEGORIES, DEVOTIONAL_TYPES, BIBLICAL_CHARACTERS, BIBLE_BOOKS_FOR_STUDY, ThemeCategoryInfo, DevotionalTypeInfo } from '@/constants/devotional-types';
import {
  pickRandomVariation,
  getRandomDurationSubtext,
  getRandomReadingSubtext,
} from '@/constants/onboarding-questions';

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
}

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
  themeType: boolean;
  studySubject: boolean;
  currentSituation: string;
  emotionalState: string;
  spiritualSeeking: string;
  readingDuration: 5 | 15 | 30;
  devotionalLength: 3 | 7 | 14 | 30;
  reminderTime: string;
  selectedThemes: ThemeCategory[];
  selectedType?: DevotionalType;
  selectedStudySubject?: string;
  selectedMainOption?: 'theme' | 'type' | 'guided';
}

interface AdaptedStep {
  question: string;
  subtext: string;
  source?: 'backend' | 'fallback';
  backendUrl?: string;
}

// Progress indicator component with smooth animation
function ProgressIndicator({ 
  currentStepIndex, 
  totalSteps, 
  colors 
}: { 
  currentStepIndex: number; 
  totalSteps: number; 
  colors: any;
}) {
  const activeIndex = useSharedValue(currentStepIndex);
  
  useEffect(() => {
    activeIndex.value = withTiming(currentStepIndex, { 
      duration: 300, 
      easing: Easing.out(Easing.ease) 
    });
  }, [currentStepIndex]);

  return (
    <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 16 }}>
      <Text style={{ 
        fontFamily: FontFamily.ui, 
        fontSize: 13, 
        color: colors.textMuted,
        letterSpacing: 0.5 
      }}>
        Question {currentStepIndex + 1} of {totalSteps}
      </Text>
      <View style={{ 
        flexDirection: 'row', 
        marginTop: 8, 
        gap: 4 
      }}>
        {Array.from({ length: totalSteps }).map((_, idx) => (
          <ProgressDot 
            key={idx}
            index={idx}
            activeIndex={activeIndex}
            colors={colors}
          />
        ))}
      </View>
    </View>
  );
}

// Individual animated dot
function ProgressDot({ 
  index, 
  activeIndex, 
  colors 
}: { 
  index: number; 
  activeIndex: SharedValue<number>; 
  colors: any;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const isActive = index === Math.round(activeIndex.value);
    const isCompleted = index < activeIndex.value;
    
    return {
      width: withTiming(isActive ? 24 : 6, { duration: 300 }),
      backgroundColor: isCompleted || isActive ? colors.accent : colors.border,
    };
  });

  return (
    <Animated.View 
      style={[
        {
          height: 6,
          borderRadius: 3,
        },
        animatedStyle,
      ]}
    />
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const existingUser = useUnfoldStore((s) => s.user);
  const setUser = useUnfoldStore((s) => s.setUser);
  const updateUser = useUnfoldStore((s) => s.updateUser);

  // Types that require subject selection (book, character, etc.)
  const TYPES_WITH_SUBJECT_SELECTION: DevotionalType[] = ['book_study', 'character_study'];

  const [currentStepId, setCurrentStepId] = useState<StepId>('name');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [isLoadingAdaptive, setIsLoadingAdaptive] = useState(false);
  const [adaptedSteps, setAdaptedSteps] = useState<Record<string, AdaptedStep>>({});
  const [themeSelectionMode, setThemeSelectionMode] = useState<'none' | 'theme' | 'type'>('none');
  const [showListScrollHint, setShowListScrollHint] = useState(true);
  
  // NEW: Loading state for discovery preparation
  const [isPreparingDiscovery, setIsPreparingDiscovery] = useState(false);
  const [preparationMessage, setPreparationMessage] = useState('Getting everything ready for you...');

  const inputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const inputOpacity = useSharedValue(0);
  const inputTranslateY = useSharedValue(10);
  const listScrollY = useSharedValue(0);

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
  const currentStepIndex = useMemo(() => STEPS.findIndex((s) => s.id === currentStepId), [STEPS, currentStepId]);
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

  // Get previous answers for adaptive question generation
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

  const getAdaptiveSource = () => {
    if (!step?.adaptive) return null;
    return adaptedSteps[step.id]?.source ?? null;
  };

  const buildFallbackAdaptive = (stepId: string, base: { question: string; subtext: string }, previousAnswers: { question: string; answer: string }[]) => {
    const typeInfo = data.selectedType ? DEVOTIONAL_TYPES.find(t => t.id === data.selectedType) : null;
    const themeNames = data.selectedThemes.map(id => THEME_CATEGORIES.find(t => t.id === id)?.name).filter(Boolean) as string[];
    const lastAnswer = previousAnswers[previousAnswers.length - 1]?.answer || '';
    const firstAnswer = previousAnswers[0]?.answer || '';
    const secondAnswer = previousAnswers[1]?.answer || '';

    if (stepId === 'currentSituation') {
      // Opening question based on what they selected
      if (typeInfo) {
        const openers = [
          `So you're drawn to ${typeInfo.name.toLowerCase()} right now. What's making this feel important for you?`,
          `What led you to choose ${typeInfo.name.toLowerCase()}? What's happening in your life that made this stand out?`,
          `When you think about ${typeInfo.name.toLowerCase()}, what are you hoping to find or understand better?`,
        ];
        return {
          question: openers[Math.floor(Math.random() * openers.length)],
          subtext: "There's no right answer. Just share what's true for you right now.",
        };
      }
      if (themeNames.length > 0) {
        const openers = [
          `${themeNames[0]} resonates with you. What's stirring in you around that?`,
          `When you think about ${themeNames[0]}, what comes up? What are you sitting with?`,
          `What does ${themeNames[0]} mean for you in this season? What's the real story?`,
        ];
        return {
          question: openers[Math.floor(Math.random() * openers.length)],
          subtext: "Go with what feels most honest, even if it's messy or unclear.",
        };
      }
    }

    if (stepId === 'emotionalState') {
      // Build on the first answer about their current situation
      if (lastAnswer) {
        // Detect if their answer mentions specific emotional keywords
        const hasEmotion = /(struggle|hard|difficult|pain|hurt|lost|confused|anxious|worried|scared|angry|sad|lonely|overwhelmed|tired|exhausted)/i.test(lastAnswer);
        const hasHope = /(hope|want|desire|long|yearn|wish|dream|looking for|seeking|trying)/i.test(lastAnswer);
        const hasSpiritual = /(God|Jesus|Spirit|faith|pray|church|belief|doubt|question|wonder)/i.test(lastAnswer);
        
        if (hasEmotion) {
          return {
            question: "That sounds like a lot to carry. What do you wish someone understood about what you're going through?",
            subtext: "Sometimes naming it helps, even if nothing changes yet.",
          };
        }
        if (hasHope) {
          return {
            question: "I hear you wanting something to shift. If you could glimpse one small change, what would it be?",
            subtext: "Small is okay. Often the small things are the real things.",
          };
        }
        if (hasSpiritual) {
          return {
            question: "There's something real in what you shared. What's the conversation you wish you could have right now?",
            subtext: "With God, with yourself, with someone you trust — what would you say?",
          };
        }
        
        // Default emotional follow-ups that don't quote their text
        const followUps = [
          "What's underneath what you just shared? The part you might not usually say out loud?",
          "If you could name one thing you're really sitting with, what would it be?",
          "What feels most alive or most heavy for you right now?",
          "What's the thing you're carrying that you wish you didn't have to carry alone?",
        ];
        return {
          question: followUps[Math.floor(Math.random() * followUps.length)],
          subtext: "This is a safe place. You don't have to have it all figured out.",
        };
      }
      return {
        question: "Before we go further — what's really going on for you right now?",
        subtext: "The honest version, not the polished one.",
      };
    }

    if (stepId === 'spiritualSeeking') {
      // Final question about what they need
      if (previousAnswers.length >= 2) {
        return {
          question: "Given everything you've shared — what would actually help you right now?",
          subtext: "Not what you think you should want. What you actually need.",
        };
      }
      
      return {
        question: "If these devotionals could meet you in one real way, what would you want them to do?",
        subtext: "Comfort? Challenge? Clarify? Something else?",
      };
    }

    return base;
  };

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
    if (data.selectedThemes.length > 0) {
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
    const loadAdaptiveQuestion = async () => {
      if (!step) return;
      if (!step.adaptive || adaptedSteps[step.id]) return;
      const previousAnswers = getPreviousAnswers();
      if (previousAnswers.length === 0) return;

      // Show loading immediately
      setIsLoadingAdaptive(true);

      console.log('[Adaptive] Loading adaptive question for:', step.id);
      console.log('[Adaptive] Previous answers:', previousAnswers);

      const stepPosition = step.id === 'currentSituation' ? 'opening' as const
        : step.id === 'emotionalState' ? 'depth' as const
        : step.id === 'spiritualSeeking' ? 'longing' as const
        : undefined;

      const base = { question: step.question, subtext: step.subtext };

      try {
        // Use backend API (Haiku/Claude)
        console.log('[Adaptive] Calling backend API...');
        const adapted = await generateAdaptiveQuestion(
          previousAnswers,
          base,
          stepPosition
        );

        // Only use adapted if it's actually different from base
        const isDifferent = adapted.question?.trim().toLowerCase() !== base.question.trim().toLowerCase();
        
        console.log('[Adaptive] Backend response:', {
          question: adapted.question?.substring(0, 50),
          subtext: adapted.subtext?.substring(0, 30),
          source: adapted.source,
          backendUrl: adapted.backendUrl,
          isDifferent,
          length: adapted.question?.length
        });

        if (isDifferent && adapted.question?.length > 10) {
          console.log('[Adaptive] ✓ Using backend AI-generated question:', adapted);
          setAdaptedSteps((prev) => ({ ...prev, [step.id]: adapted }));
        } else {
          console.log('[Adaptive] Backend returned base or too short, using local fallback');
          const localFallback = buildFallbackAdaptive(step.id, base, previousAnswers);
          setAdaptedSteps((prev) => ({ ...prev, [step.id]: { ...localFallback, source: 'fallback' } }));
        }
      } catch (err) {
        console.log('[Adaptive] API failed, using local fallback:', err);
        const localFallback = buildFallbackAdaptive(step.id, base, previousAnswers);
        setAdaptedSteps((prev) => ({ ...prev, [step.id]: { ...localFallback, source: 'fallback' } }));
      } finally {
        setIsLoadingAdaptive(false);
      }
    };
    loadAdaptiveQuestion();
  }, [currentStepId, step]);

  useEffect(() => {
    setAdaptedSteps({});
  }, [data.selectedType, data.selectedStudySubject, data.selectedThemes]);

  // Clear adapted steps when previous answers change (so next question regenerates)
  useEffect(() => {
    // When currentSituation changes, clear emotionalState adaptation
    if (data.currentSituation) {
      setAdaptedSteps(prev => {
        const { emotionalState, spiritualSeeking, ...rest } = prev;
        return rest;
      });
    }
  }, [data.currentSituation]);

  useEffect(() => {
    // When emotionalState changes, clear spiritualSeeking adaptation
    if (data.emotionalState) {
      setAdaptedSteps(prev => {
        const { spiritualSeeking, ...rest } = prev;
        return rest;
      });
    }
  }, [data.emotionalState]);

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
      // Final step - show celebration before generating
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
        preferredVoice: '694f9389-aac1-45b6-b726-9d9369183238',
        // Streak defaults
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

      // Navigate to celebration screen instead of directly to generating
      router.push('/welcome-celebration');
    }
  }, [STEPS, currentStepId, data, existingUser, router, setUser, updateUser]);

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
    inputTranslateY.value = 10;
    
    return;
  };

  // NEW: Start discovery preparation with loading screen
  const startDiscoveryPreparation = async (selectionMode: 'guided' | 'theme' | 'type') => {
    setIsPreparingDiscovery(true);
    
    // Set appropriate message based on selection
    const messages = {
      guided: "Getting everything ready for you...",
      theme: "Crafting questions around what you chose...",
      type: "Preparing your study journey...",
    };
    setPreparationMessage(messages[selectionMode]);
    
    // Clear any previous adaptations
    setAdaptedSteps({});
    
    // Prepare answers for AI generation
    const answers = getPreviousAnswers();

    // Seed immediately with contextual local adaptations so user never sees generic defaults
    const discoverySteps = ['currentSituation', 'emotionalState', 'spiritualSeeking'] as const;
    const seededAdapted: Record<string, AdaptedStep> = {};
    discoverySteps.forEach((stepId) => {
      const base = ALL_STEPS.find((s) => s.id === stepId);
      if (base) seededAdapted[stepId] = buildFallbackAdaptive(stepId, { question: base.question, subtext: base.subtext }, answers);
    });
    setAdaptedSteps(seededAdapted);
    
    // Generate all three discovery questions in parallel
    const stepPositions: Record<string, 'opening' | 'depth' | 'longing'> = {
      currentSituation: 'opening',
      emotionalState: 'depth',
      spiritualSeeking: 'longing',
    };
    
    try {
      // Race AI generation against timeout (8 seconds max)
      const timeoutPromise = new Promise<
        { stepId: string; adapted: AdaptedStep | null }[]
      >((resolve) => setTimeout(() => resolve(discoverySteps.map((stepId) => ({ stepId, adapted: null }))), 8000));

      const adaptations = await Promise.race([
        Promise.all(
          discoverySteps.map(async (stepId) => {
            const baseStep = ALL_STEPS.find((s) => s.id === stepId);
            if (!baseStep) return { stepId, adapted: null };
            
            try {
              // Use backend API (Haiku/Claude)
              const adapted = await generateAdaptiveQuestion(
                answers,
                { question: baseStep.question, subtext: baseStep.subtext },
                stepPositions[stepId]
              );
              return { stepId, adapted };
            } catch (err) {
              console.log(`[DiscoveryPrep] Failed for ${stepId}:`, err);
              return { stepId, adapted: null };
            }
          })
        ),
        timeoutPromise,
      ]);

      // Merge AI results with seeded fallbacks
      adaptations.forEach(({ stepId, adapted }) => {
        if (adapted) {
          seededAdapted[stepId] = adapted;
        }
      });
      setAdaptedSteps({ ...seededAdapted });

      // Brief pause to show we did something
      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
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
      
      // Small delay to let keyboard settle before animating
      setTimeout(() => {
        // Configure layout animation before state change
        LayoutAnimation.configureNext({
          duration: 200,
          create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
          update: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
          delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        });
        
        setCurrentStepId(prevStepId);
      }, 50);
    }
    // On first step, do nothing (back button is hidden)
  };

  const updateData = (key: StepId, value: string | number) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const isAutoAdvanceStep = (step: { type?: string } | null | undefined) => {
    if (!step) return false;
    return step.type === 'choice' || step.type === 'timeChoice' || step.type === 'themeType';
  };

  const canProceed = () => {
    if (!baseStep) return false;
    const stepId = baseStep.id as StepId;
    const value = data[stepId];
    if (baseStep.type === 'text') return typeof value === 'string' && value.trim().length > 0;
    if (baseStep.type === 'multiline') return typeof value === 'string' && value.trim().length >= 3;
    if (baseStep.type === 'choice' || baseStep.type === 'timeChoice') {
      // For choice steps, ensure a value is selected (not undefined or empty string)
      return value !== undefined && value !== null && value !== '';
    }
    if (baseStep.type === 'themeType') {
      if (themeSelectionMode === 'none') {
        return !!data.selectedMainOption;
      }
      if (themeSelectionMode === 'theme') return data.selectedThemes.length > 0 && data.selectedThemes.length <= 3;
      if (themeSelectionMode === 'type') return !!data.selectedType;
      return false;
    }
    if (baseStep.type === 'studySubject') {
      return !!data.selectedStudySubject;
    }
    return true;
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
      const isAboutMeStep = stepId === 'aboutMe';
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
          
          {/* Speech-to-text for About Me step */}
          {isAboutMeStep && (
            <SpeechToTextButton
              onTranscription={(text) => {
                const currentText = (data[stepId] as string) || '';
                const newText = currentText + (currentText ? ' ' : '') + text;
                updateData(stepId, newText.slice(0, INPUT_LIMITS.LONG_TEXT.max));
              }}
              isActive={inputLength < INPUT_LIMITS.LONG_TEXT.max - 100}
            />
          )}
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
        joy: <Smile size={16} color={colors.textMuted} />,
        gratitude: <Gift size={16} color={colors.textMuted} />,
        lament: <CloudRain size={16} color={colors.textMuted} />,
        hope: <Sun size={16} color={colors.textMuted} />,
        purpose: <Compass size={16} color={colors.textMuted} />,
        courage: <Mountain size={16} color={colors.textMuted} />,
        conviction: <Flame size={16} color={colors.textMuted} />,
        surrender: <Wind size={16} color={colors.textMuted} />,
        discipline: <Target size={16} color={colors.textMuted} />,
        justice: <Scale size={16} color={colors.textMuted} />,
        wonder: <Telescope size={16} color={colors.textMuted} />,
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
                setThemeSelectionMode('theme');
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
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
                console.log('[Onboarding] Selected "A style of study", currentStepId:', currentStepId);
                setData((prev) => ({
                  ...prev,
                  selectedMainOption: 'type',
                  selectedThemes: [],
                  selectedType: undefined,
                  selectedStudySubject: undefined,
                }));
                setThemeSelectionMode('type');
                console.log('[Onboarding] Set themeSelectionMode to type');
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
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
                setThemeSelectionMode('none');
                startDiscoveryPreparation('guided');
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
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
                        // REMOVED: No auto-advance - all selections wait for Continue button
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
      // Generate dynamic subtexts for steps that have hasDynamicOptions
      const dynamicDescs = {} as Record<string | number, string>;
      
      if (baseStep.hasDynamicOptions) {
        if (stepId === 'readingDuration') {
          dynamicDescs[5] = getRandomReadingSubtext(5);
          dynamicDescs[15] = getRandomReadingSubtext(15);
          dynamicDescs[30] = getRandomReadingSubtext(30);
        } else if (stepId === 'devotionalLength') {
          dynamicDescs[3] = getRandomDurationSubtext(3);
          dynamicDescs[7] = getRandomDurationSubtext(7);
          dynamicDescs[14] = getRandomDurationSubtext(14);
          dynamicDescs[30] = getRandomDurationSubtext(30);
        }
      }
      return (
        <View className="space-y-3">
          {baseStep.options?.map((option: { value: string | number; label: string; description?: string; time?: string }) => {
            const isSelected = data[stepId] === option.value;
            const displayDescription = dynamicDescs?.[option.value] ?? option.description;
            return (
              <Pressable
                key={String(option.value)}
                onPress={() => { 
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
                  updateData(stepId, option.value);
                  // Auto-advance for single-choice questions after a short delay
                  setTimeout(() => {
                    handleNext();
                  }, 200);
                }}
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
    if (isLoadingAdaptive || isPreparingDiscovery) {
      breathingOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    }
  }, [isLoadingAdaptive, isPreparingDiscovery]);

  const breathingStyle = useAnimatedStyle(() => ({ opacity: breathingOpacity.value }));
  const preparingQuip = useMemo(() => getRandomLoadingQuip(), [isPreparingDiscovery]);

  // Full-screen loading removed - using inline loading instead
  // if (isLoadingAdaptive) {
  //   return (
  //     <View style={{ flex: 1, backgroundColor: colors.background }}>
  //       <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} edges={['top']}>
  //         <Animated.View style={breathingStyle}>
  //           <View style={{ flexDirection: 'row', alignItems: 'center' }}>
  //             <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, marginHorizontal: 4 }} />
  //             <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, marginHorizontal: 4 }} />
  //             <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, marginHorizontal: 4 }} />
  //           </View>
  //         </Animated.View>
  //       </SafeAreaView>
  //     </View>
  //   );
  // }

  if (isPreparingDiscovery) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
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
          </View>
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
            
            {/* Hide Continue button for auto-advance questions, but always show for last step */}
            {(!isAutoAdvanceStep(baseStep) || isLastStep) ? (
              <Pressable
                onPress={handleNext}
                disabled={!canProceed()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ height: 40, justifyContent: 'center', paddingHorizontal: 8 }}
              >
                <Text style={{ 
                  fontFamily: FontFamily.uiMedium, 
                  fontSize: 14, 
                  color: canProceed() ? colors.text : colors.textMuted 
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
                      style={{ fontSize: 32, lineHeight: 40 }} 
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
                      <View style={{ 
                        flex: 1, 
                        justifyContent: 'center', 
                        alignItems: 'center',
                        minHeight: 200 
                      }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted }} />
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, opacity: 0.6 }} />
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, opacity: 0.3 }} />
                        </View>
                        <Text style={{ 
                          fontFamily: FontFamily.ui, 
                          fontSize: 15, 
                          color: colors.textMuted,
                          letterSpacing: 0.5
                        }}>
                          {getRandomLoadingQuip()}
                        </Text>
                      </View>
                    ) : (
                      <TypewriterText 
                        text={getStepQuestion()} 
                        onComplete={handleTypewriterComplete} 
                        style={{ fontSize: 32, lineHeight: 40 }} 
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
