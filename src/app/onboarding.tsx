import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutAnimation,
  Keyboard,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
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
import { CaretLeftIcon, HandIcon, FingerprintIcon, MoonIcon, CompassIcon, HeartIcon, EyeIcon, FireIcon, SparkleIcon, CloudRainIcon, ScalesIcon, CrosshairIcon, BookOpenIcon, UsersIcon, MusicNotesIcon, CrownIcon, LeafIcon, ChatCircleIcon, CalendarIcon, MagicWandIcon, SmileyIcon, GiftIcon, BinocularsIcon, CloudIcon, ShieldIcon, ShieldCheckIcon, SpeakerHighIcon, LockIcon, PenNibIcon } from 'phosphor-react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple, signInAnonymously } from '@/lib/appleAuth';
import { logger } from '@/lib/logger';
import { Analytics, AnalyticsEvents } from '@/lib/analytics';
import { useTheme } from '@/lib/theme';
import { DarkColors, createThemedColors } from '@/constants/colors';
import { FontFamily } from '@/constants/fonts';
import { INPUT_LIMITS } from '@/lib/validation';
import { TypewriterText } from '@/components/TypewriterText';
import { CompanionOrb } from '@/components/CompanionOrb';
import { AdaptiveQuestionFlow } from '@/components/AdaptiveQuestionFlow';
import { VoiceInputBar } from '@/components/VoiceInputBar';
import { useUnfoldStore, UserProfile, BIBLE_TRANSLATIONS, BibleTranslation, ThemeCategory, DevotionalType, ACCENT_THEMES, WritingTone, ContentDepth, FaithBackground, LifeStage } from '@/lib/store';
import { generateAdaptiveQuestion } from '@/lib/devotional-service';
import { THEME_CATEGORIES, DEVOTIONAL_TYPES, BIBLICAL_CHARACTERS, BIBLE_BOOKS_FOR_STUDY, ThemeCategoryInfo, DevotionalTypeInfo, getThemeById, getDevotionalTypeById } from '@/constants/devotional-types';
import {
  pickRandomVariation,
  getRandomDurationSubtext,
  getRandomReadingSubtext,
} from '@/constants/onboarding-questions';
import { getOfferings, purchasePackage, isRevenueCatEnabled } from '@/lib/revenuecatClient';
import type { PurchasesPackage } from 'react-native-purchases';
import { useQuery, useMutation } from '@tanstack/react-query';

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
    <TouchableOpacity activeOpacity={0.7}
      onPress={onPress}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
    >
      <View
        style={[
          obStyles.themePillContainer,
          {
            backgroundColor: isSelected ? colors.buttonBackgroundPressed : isPressed ? colors.buttonBackgroundPressed : colors.inputBackground,
            borderColor: isSelected ? colors.borderFocused : isPressed ? colors.borderFocused : colors.border,
          },
        ]}
      >
        {theme.icon}
        <Text style={[obStyles.themePillText, { color: isSelected ? colors.text : colors.textMuted }]}>
          {theme.name}
        </Text>
        {selectionOrder !== undefined && (
          <View style={[obStyles.selectionOrderBadge, { backgroundColor: colors.accent }]}>
            <Text style={[obStyles.selectionOrderText, { color: colors.background }]}>
              {selectionOrder}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// Icon map for themes and types
const iconMap: Record<string, React.ReactNode> = {
  // Themes
  trust: <FingerprintIcon size={18} color="#C8A55C" weight="regular" />,
  courage: <FireIcon size={18} color="#C8A55C" weight="regular" />,
  joy: <SmileyIcon size={18} color="#C8A55C" weight="regular" />,
  lament: <CloudRainIcon size={18} color="#C8A55C" weight="regular" />,
  discipline: <CrosshairIcon size={18} color="#C8A55C" weight="regular" />,
  identity: <FingerprintIcon size={18} color="#C8A55C" weight="regular" />,
  purpose: <CompassIcon size={18} color="#C8A55C" weight="regular" />,
  healing: <HeartIcon size={18} color="#C8A55C" weight="regular" />,
  gratitude: <GiftIcon size={18} color="#C8A55C" weight="regular" />,
  hope: <SparkleIcon size={18} color="#C8A55C" weight="regular" />,
  rest: <MoonIcon size={18} color="#C8A55C" weight="regular" />,
  presence: <EyeIcon size={18} color="#C8A55C" weight="regular" />,
  conviction: <ScalesIcon size={18} color="#C8A55C" weight="regular" />,
  surrender: <HandIcon size={18} color="#C8A55C" weight="regular" />,
  justice: <ScalesIcon size={18} color="#C8A55C" weight="regular" />,
  wonder: <BinocularsIcon size={18} color="#C8A55C" weight="regular" />,
  // Study types
  personal_journey: <CompassIcon size={20} color="#C8A55C" weight="regular" />,
  book_study: <BookOpenIcon size={20} color="#C8A55C" weight="regular" />,
  character_study: <UsersIcon size={20} color="#C8A55C" weight="regular" />,
  psalm_journey: <MusicNotesIcon size={20} color="#C8A55C" weight="regular" />,
  beatitudes: <CrownIcon size={20} color="#C8A55C" weight="regular" />,
  fruit_of_spirit: <LeafIcon size={20} color="#C8A55C" weight="regular" />,
  lords_prayer: <ChatCircleIcon size={20} color="#C8A55C" weight="regular" />,
  names_of_god: <FireIcon size={20} color="#C8A55C" weight="regular" />,
  seasons: <CalendarIcon size={20} color="#C8A55C" weight="regular" />,
  parables: <ChatCircleIcon size={20} color="#C8A55C" weight="regular" />,
};

const ALL_STEPS = [
  { id: 'name', question: "What's your name?", subtext: 'Just your first name is perfect.', type: 'text' as const, placeholder: 'Your name', adaptive: false, skipIfHasValue: true, hasVariations: false },
  { id: 'aboutMe', question: 'Tell me about\u00A0yourself.', subtext: "The more you share, the more personal your devotionals become. Your story stays on your device \u2014 never used to train\u00A0AI.", type: 'multiline' as const, placeholder: "I'm a dad, an entrepreneur, and lately I've been wrestling with...", adaptive: false, skipIfHasValue: true, hasVariations: false },
  // STYLE PREFERENCES: Faith background + life stage
  { id: 'stylePreferences1', question: "Where are you in your faith?", subtext: 'This shapes the voice and depth of everything you read.', type: 'stylePreferences1' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
  // STYLE PREFERENCES: Tone + depth
  { id: 'stylePreferences2', question: "How should this feel?", subtext: 'The tone and depth that serves you best.', type: 'stylePreferences2' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
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
  { id: 'readingDuration', question: 'How long should each devotional be?', subtext: "Each day is crafted to fit your rhythm.", type: 'choice' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false, hasDynamicOptions: true, options: [{ value: 5, label: '5 minutes', description: 'A quick breath' }, { value: 15, label: '15 minutes', description: 'A thoughtful pause' }, { value: 30, label: '30 minutes', description: 'A deep dive' }] },
  { id: 'devotionalLength', question: 'How long should this devotional series\u00A0be?', subtext: 'You can always create another when this\u00A0one\u00A0ends.', type: 'choice' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false, hasDynamicOptions: true, options: [{ value: 3, label: '3 days', description: 'Just a taste' }, { value: 7, label: '7 days', description: 'Enough to build a rhythm' }, { value: 14, label: '14 days', description: 'Room to go deep' }, { value: 30, label: '30 days', description: 'A real transformation' }] },
  { id: 'reminderTime', question: 'When should the\u00A0reminder\u00A0come?', subtext: "A gentle nudge to pause and reflect. You can change\u00A0this\u00A0anytime.", type: 'timeChoice' as const, placeholder: '', adaptive: false, skipIfHasValue: true, hasVariations: false, options: [{ value: '6:00 AM', label: 'Early morning', time: '6:00 AM' }, { value: '8:00 AM', label: 'Morning', time: '8:00 AM' }, { value: '12:00 PM', label: 'Midday', time: '12:00 PM' }, { value: '6:00 PM', label: 'Evening', time: '6:00 PM' }, { value: '9:00 PM', label: 'Night', time: '9:00 PM' }] },
  // MIRROR-BACK: Poetic reflection before building — like a book introduction
  { id: 'mirrorBack', question: "Before we\u00A0begin.", subtext: '', type: 'mirrorBack' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
  // AI CONSENT: Disclose AI providers and get consent (App Store Guideline 5.1.2(i))
  { id: 'aiConsent', question: "How your data is\u00A0used.", subtext: '', type: 'aiConsent' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
  // COMPANION NAMING: Name the companion (intro now lives in how-it-works.tsx)
  { id: 'companionNaming', question: "Name your companion.", subtext: 'Remembers your story. Shows up every\u00A0morning.', type: 'companionNaming' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
  // FOUNDER NOTE: A personal letter from the founder
  { id: 'founderNote', question: 'A note from the\u00A0founder', subtext: '', type: 'founderNote' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
  // SIGN-IN: Optional Apple Sign In before generating
  { id: 'signIn', question: 'One last\u00A0thing.', subtext: 'Keep your journey safe across all\u00A0your\u00A0devices.', type: 'signIn' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
  // PREMIUM SHOWCASE: Final premium pitch before generating
  { id: 'premiumShowcase', question: "Unlock the full\u00A0experience.", subtext: '', type: 'premiumShowcase' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
];

type StepId = 'name' | 'aboutMe' | 'stylePreferences1' | 'stylePreferences2' | 'themeType' | 'studySubject' | 'currentSituation' | 'emotionalState' | 'spiritualSeeking' | 'readingDuration' | 'devotionalLength' | 'reminderTime' | 'mirrorBack' | 'aiConsent' | 'companionNaming' | 'founderNote' | 'signIn' | 'premiumShowcase';

// Discovery chips — tappable quick-select options for the 3 discovery questions
// Each chip is a feeling/situation that seeds context without requiring typing
// Default discovery chips — used as fallback when AI chips aren't available
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

/**
 * Generate contextual chips that match the specific question/topic.
 * These feel like natural quick-select answers to the adaptive question,
 * not generic emotional states.
 */
function getContextualChips(stepId: string, topicName: string): string[] {
  // For the opening question, chips should be ways the topic shows up in life
  if (stepId === 'currentSituation') {
    return [
      'Something I need', 'Something I\'ve lost', 'A daily struggle',
      'Just starting to explore', 'It comes and goes',
      'I think about it constantly', 'I don\'t fully understand it',
      'It feels far away', 'I\'m ready for it',
    ];
  }
  return DISCOVERY_CHIPS[stepId] ?? [];
}

interface OnboardingData {
  name: string;
  bibleTranslation: BibleTranslation;
  aboutMe: string;
  faithBackground: FaithBackground;
  lifeStage: LifeStage;
  tone: WritingTone;
  depth: ContentDepth;
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
  const { colors: _themeColors, isDark: _themeIsDark } = useTheme();
  const accentThemeId = useUnfoldStore((s) => s.user?.accentTheme ?? 'gold');

  // IMPORTANT: Onboarding always has a dark (#0A0A0A) background regardless of
  // the user's light/dark mode setting. Force dark-mode colors so text and UI
  // elements remain visible against the dark backdrop.
  const colors = useMemo(() => {
    const accentTheme = ACCENT_THEMES.find((t) => t.id === accentThemeId);
    const accent = accentTheme ? accentTheme.dark : DarkColors.accent;
    return createThemedColors(DarkColors, accent);
  }, [accentThemeId]);
  const isDark = true;

  const existingUser = useUnfoldStore((s) => s.user);
  const setUser = useUnfoldStore((s) => s.setUser);
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const setCompanionName = useUnfoldStore((s) => s.setCompanionName);
  const hasConsentedToAI = useUnfoldStore((s) => s.hasConsentedToAI);
  const setHasConsentedToAI = useUnfoldStore((s) => s.setHasConsentedToAI);
  
  // Companion naming state (saved to store on continue)
  const [companionNameInput, setCompanionNameInput] = useState('');

  // Form data (declared early — mirrorBackText useMemo depends on it)
  const [data, setData] = useState<OnboardingData>({
    name: existingUser?.name || '',
    bibleTranslation: existingUser?.bibleTranslation || 'WEB',
    aboutMe: existingUser?.aboutMe || '',
    faithBackground: 'growing',
    lifeStage: 'building',
    tone: 'warm',
    depth: 'balanced',
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

  // RevenueCat — fetch offerings for direct purchase from premiumShowcase
  const { data: offeringsResult } = useQuery({
    queryKey: ['revenuecat', 'offerings'],
    queryFn: getOfferings,
    enabled: isRevenueCatEnabled(),
  });
  const rcOfferings = offeringsResult?.ok ? offeringsResult.data : null;
  const yearlyPackage = rcOfferings?.current?.availablePackages.find(
    (pkg) => pkg.identifier === '$rc_annual'
  );
  const yearlyPrice = yearlyPackage?.product.priceString ?? '$49.99';
  const yearlyTrialDuration = (() => {
    const intro = yearlyPackage?.product.introPrice;
    if (!intro || intro.price !== 0) return '7-day';
    const count = intro.periodNumberOfUnits;
    const unit = intro.periodUnit.toLowerCase();
    if (unit === 'day') return `${count}-day`;
    if (unit === 'week') return `${count * 7}-day`;
    return `${count}-${unit}`;
  })();

  const trialPurchaseMutation = useMutation({
    mutationFn: (pkg: PurchasesPackage) => purchasePackage(pkg),
  });

  // Mirror-back text — memoized so it doesn't change on re-render
  const mirrorBackText = useMemo(() => {
    const themeName = (data?.selectedThemes?.length ?? 0) > 0
      ? getThemeById(data.selectedThemes[0])?.name ?? ''
      : data?.selectedType
        ? getDevotionalTypeById(data.selectedType)?.name ?? ''
        : '';
    const emotionalSnippet = data?.emotionalState
      ? data.emotionalState.split(/[.!?]/)[0].trim().toLowerCase()
      : data?.currentSituation
        ? data.currentSituation.split(/[.!?]/)[0].trim().toLowerCase()
        : '';
    const seekingSnippet = data?.spiritualSeeking
      ? data.spiritualSeeking.split(/[.!?]/)[0].trim().toLowerCase()
      : '';
    const daysText = data?.devotionalLength ? `${data.devotionalLength} days` : 'the days ahead';

    const pickRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

    if (emotionalSnippet && seekingSnippet) {
      return pickRandom(themeName ? [
        `You said "${themeName}" — and underneath that, ${emotionalSnippet}. You're reaching for ${seekingSnippet}. That's exactly where your next ${daysText} will\u00A0begin.`,
        `${emotionalSnippet.charAt(0).toUpperCase() + emotionalSnippet.slice(1)}, and a longing for ${seekingSnippet}. "${themeName}" is the lens — but your story is the\u00A0material.`,
        `Between ${emotionalSnippet} and wanting ${seekingSnippet}, there's a thread worth following. Over the next ${daysText}, we'll pull\u00A0on\u00A0it.`,
      ] : [
        `You named it: ${emotionalSnippet}. And what you're reaching for — ${seekingSnippet}. Over the next ${daysText}, each devotional will meet you right\u00A0there.`,
        `${emotionalSnippet.charAt(0).toUpperCase() + emotionalSnippet.slice(1)}, and a desire for ${seekingSnippet}. That honesty is the foundation your devotionals will be built\u00A0on.`,
        `Between ${emotionalSnippet} and ${seekingSnippet}, something real is taking shape. The next ${daysText} are designed around exactly\u00A0that.`,
      ]);
    } else if (emotionalSnippet) {
      return pickRandom(themeName ? [
        `"${themeName}" and ${emotionalSnippet} — you named what most people scroll past. Your devotionals will speak directly to\u00A0that.`,
        `You chose "${themeName}" because of ${emotionalSnippet}. Each day will meet that honesty with\u00A0scripture.`,
      ] : [
        `${emotionalSnippet.charAt(0).toUpperCase() + emotionalSnippet.slice(1)}. Most people don't pause long enough to name it. Your devotionals will start right\u00A0here.`,
        `You put words to something real: ${emotionalSnippet}. That's the seed your ${daysText} of devotionals will grow\u00A0from.`,
      ]);
    } else {
      return pickRandom(themeName ? [
        `"${themeName}" — you picked this for a reason only you know. Your devotionals will be shaped around that\u00A0reason.`,
        `You chose "${themeName}." No two people come to it the same way. Your series will reflect your\u00A0way\u00A0in.`,
      ] : [
        `Something drew you here today. You might not have all the words yet — and that's okay. The next few days will help you find\u00A0them.`,
        `You showed up. That's the start. Each devotional will be written for where you are right\u00A0now.`,
      ]);
    }
  }, [data?.selectedThemes, data?.selectedType, data?.emotionalState, data?.currentSituation, data?.spiritualSeeking, data?.devotionalLength]);

  // Track which step we're on (from filtered list)
  const [currentStepId, setCurrentStepId] = useState<StepId>('name');

  // Sign-in step state
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isAppleAvailable, setIsAppleAvailable] = useState(true);
  const [signInError, setSignInError] = useState<string | null>(null);

  // Track Apple auth data collected during onboarding sign-in step.
  // This is needed because updateUser() is a no-op when user is null (first-time users),
  // so auth data from handleOnboardingAppleSignIn would be silently lost.
  // We store it here and merge it into completeOnboarding's setUser/updateUser call.
  const pendingAuthDataRef = useRef<Partial<UserProfile> | null>(null);
  
  // Track if user is in theme sub-selection mode
  const [themeSelectionMode, setThemeSelectionMode] = useState<'none' | 'theme' | 'type'>('none');
  
  // Track if we're preparing for discovery (generating adaptive questions)
  const [isPreparingDiscovery, setIsPreparingDiscovery] = useState(false);
  const [preparingQuip, setPreparingQuip] = useState('Contemplating...');
  
  // Adaptive question states
  const [adaptedSteps, setAdaptedSteps] = useState<Record<string, { question: string; subtext: string; chips?: string[] }>>({});
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
  const isPremium = existingUser?.isPremium ?? false;
  const [purchasedDuringOnboarding, setPurchasedDuringOnboarding] = useState(false);

  // Transition state for animations
  const isTransitioningRef = useRef(false);
  
  // (data state declared earlier — before mirrorBackText useMemo)
  
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

      // Skip AI consent if already consented
      if (step.id === 'aiConsent' && hasConsentedToAI) {
        return false;
      }

      // Skip first-time-only steps for returning users
      // These are first-time onboarding only — not shown when building new devotionals
      if (existingUser?.hasCompletedOnboarding) {
        if (step.id === 'founderNote' || step.id === 'companionNaming' || step.id === 'signIn' || step.id === 'premiumShowcase' || step.id === 'stylePreferences1' || step.id === 'stylePreferences2') {
          return false;
        }
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
  }, [existingUser, data.selectedMainOption, data.selectedType, hasConsentedToAI]);
  
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

    // Mirror-back, AI consent, founder note, companion naming, style preferences, and premium showcase always allow proceeding
    if (step.type === 'mirrorBack' || step.type === 'aiConsent' || step.type === 'founderNote' || step.type === 'companionNaming' || step.type === 'stylePreferences1' || step.type === 'stylePreferences2' || step.type === 'premiumShowcase') {
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

  // Save all onboarding data to the store (without navigating).
  // Called by completeOnboarding and also before pushing to paywall so the
  // paywall can navigate directly to /generating on purchase success.
  const saveOnboardingData = useCallback((premiumOverride?: boolean) => {
    const isPrem = premiumOverride ?? purchasedDuringOnboarding;
    const pendingAuth = pendingAuthDataRef.current ?? {};

    if (existingUser) {
      updateUser({
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
        writingStyle: { tone: data.tone, depth: data.depth, faithBackground: data.faithBackground, lifeStage: data.lifeStage },
        ...(data.selectedThemes.length > 0 ? { selectedTheme: data.selectedThemes[0] } : {}),
        ...(data.selectedType ? { selectedType: data.selectedType } : {}),
        ...(data.selectedStudySubject ? { selectedStudySubject: data.selectedStudySubject } : {}),
        ...pendingAuth,
        ...(isPrem ? { isPremium: true } : {}),
      });
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
        isPremium: isPrem,
        fontSize: 'medium',
        writingStyle: { tone: data.tone, depth: data.depth, faithBackground: data.faithBackground, lifeStage: data.lifeStage },
        bibleTranslation: data.bibleTranslation as BibleTranslation,
        themeMode: 'dark',
        accentTheme: 'gold',
        readingFont: 'source-serif',
        preferredVoice: '694f9389-aac1-45b6-b726-9d9369183238',
        ...(data.selectedThemes.length > 0 ? { selectedTheme: data.selectedThemes[0] } : {}),
        ...(data.selectedType ? { selectedType: data.selectedType } : {}),
        ...(data.selectedStudySubject ? { selectedStudySubject: data.selectedStudySubject } : {}),
        ...pendingAuth,
      });
    }
  }, [data, existingUser, updateUser, setUser, purchasedDuringOnboarding]);

  // Complete onboarding: save data + navigate to generating screen
  const completeOnboarding = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    saveOnboardingData();
    router.replace('/generating');
  }, [router, saveOnboardingData]);

  // Advance to next step
  const advanceToNextStep = useCallback(() => {
    const currentIdx = STEPS.findIndex((s) => s.id === currentStepId);
    if (currentIdx >= STEPS.length - 1) {
      // Last step — complete onboarding
      completeOnboarding();
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
  }, [STEPS, currentStepId, inputOpacity, completeOnboarding]);

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

        const authData: Partial<UserProfile> = {
          authUserId: result.user.uid,
          authProvider: 'apple',
          authEmail: result.user.email,
          authDisplayName: result.user.displayName,
          hasSeenSignInPrompt: true,
        };

        // Store auth data in ref so completeOnboarding can pick it up
        // even if user profile hasn't been created yet (updateUser is a no-op when user is null)
        pendingAuthDataRef.current = authData;
        updateUser(authData);

        logger.log('[Onboarding] Successfully signed in with Apple', { userId: result.user.uid });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Advance to next step (premiumShowcase)
        advanceToNextStep();
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
        if (result.error?.includes('Firebase')) {
          friendlyError = 'Sign in is temporarily unavailable. You can skip this step.';
        } else if (result.error?.includes('network')) {
          friendlyError = 'Network error. Check your connection and try again.';
        } else if (result.error?.includes('credential') || result.error?.includes('already')) {
          friendlyError = 'This Apple account is already linked to another user.';
        } else if (result.error?.includes('unavailable') || result.error?.includes('digest')) {
          friendlyError = 'Apple Sign In requires a real device. Try skipping for now.';
        }
        logger.error('[Onboarding] Apple Sign In error details', { rawError: result.error });
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
  }, [isSigningIn, updateUser, advanceToNextStep]);

  // Handle skipping sign-in during onboarding
  const handleSkipSignIn = useCallback(async () => {
    if (isSigningIn) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Analytics.logEvent(AnalyticsEvents.SIGN_IN_SKIPPED);

    const skipData: Partial<UserProfile> = {
      hasSeenSignInPrompt: true,
      signInPromptCount: (existingUser?.signInPromptCount ?? 0) + 1,
    };

    // Store in ref so completeOnboarding can pick it up (updateUser is no-op when user is null)
    pendingAuthDataRef.current = skipData;
    updateUser(skipData);

    logger.log('[Onboarding] User skipped sign-in during onboarding');

    // Advance to next step (premiumShowcase)
    advanceToNextStep();
  }, [isSigningIn, updateUser, existingUser?.signInPromptCount, advanceToNextStep]);

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

    // Save companion name when leaving the companion naming step
    if (currentStepId === 'companionNaming') {
      const trimmed = companionNameInput.trim();
      setCompanionName(trimmed.length > 0 ? trimmed : null);
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
      const themeName = data.selectedThemes.length > 0
        ? getThemeById(data.selectedThemes[0])?.name ?? data.selectedThemes[0]
        : '';
      const typeName = data.selectedType?.replace(/_/g, ' ') ?? '';

      const firstQuestion: { question: string; subtext: string; chips?: string[] } = selectionType === 'theme' ? {
        question: `What does "${themeName}" look like in your life right now?`,
        subtext: "The honest, unfiltered reality of where you are.",
        chips: getContextualChips('currentSituation', themeName),
      } : selectionType === 'type' ? {
        question: `As you begin this ${typeName}, what's on your heart?`,
        subtext: "The thing that's there when the noise quiets down.",
        chips: getContextualChips('currentSituation', typeName),
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
        [nextStepId]: { question: result.question, subtext: result.subtext, chips: result.chips },
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
            <TouchableOpacity activeOpacity={0.7}
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
              <View style={{
                paddingVertical: 28,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
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
            </TouchableOpacity>

            {/* Study Type option */}
            <TouchableOpacity activeOpacity={0.7}
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
              <View style={{
                paddingVertical: 28,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
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
            </TouchableOpacity>

            {/* Just guide me option */}
            <TouchableOpacity activeOpacity={0.7}
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
              <View style={{ paddingVertical: 28 }}>
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
            </TouchableOpacity>
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
                    <TouchableOpacity activeOpacity={0.7}
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
                          <View style={{
                            backgroundColor: isSelected ? colors.buttonBackgroundPressed : colors.inputBackground,
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
                    </TouchableOpacity>
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
                  <TouchableOpacity activeOpacity={0.7}
                    key={subject.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setData((prev) => ({
                        ...prev,
                        selectedStudySubject: isSelected ? undefined : subject.id,
                      }));
                    }}
                  >
                        <View style={{
                          backgroundColor: isSelected ? colors.buttonBackgroundPressed : colors.inputBackground,
                          paddingHorizontal: 18,
                          paddingVertical: 14,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: isSelected ? colors.borderFocused : colors.border,
                        }}>
                          <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 16, color: colors.text }}>{subject.name}</Text>
                          <Text style={{ fontFamily: FontFamily.body, fontSize: 13, color: colors.textMuted, marginTop: 3, lineHeight: 18 }}>{subject.description}</Text>
                        </View>
                  </TouchableOpacity>
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
          <VoiceInputBar
            value={data.name}
            onChangeText={(text) => setData((prev) => ({ ...prev, name: text }))}
          />
        </View>
      );
    }

    if (step.type === 'multiline') {
      // Use AI-generated chips when available, fall back to static defaults
      const adapted = adaptedSteps[step.id];
      const chips = adapted?.chips ?? DISCOVERY_CHIPS[step.id];
      const isDiscoveryStep = !!chips;
      const currentChips = selectedChips[step.id] ?? [];

      return (
        <View style={{ flex: 1 }}>
          {/* Discovery chips — quick-select contextual answers */}
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
                  <TouchableOpacity activeOpacity={0.7}
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
                    <Text style={{
                      fontFamily: isChipSelected ? FontFamily.uiMedium : FontFamily.ui,
                      fontSize: 14,
                      color: isChipSelected ? colors.accent : colors.textMuted,
                    }}>
                      {chip}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {/* "Something else" chip — lets user skip chips and just type */}
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  // Clear all chips for this step so user writes freely
                  setSelectedChips((prev) => ({ ...prev, [step.id]: [] }));
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor: 'transparent',
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderStyle: 'dashed',
                }}
              >
                <Text style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 14,
                  color: colors.textMuted,
                  fontStyle: 'italic',
                }}>
                  Something else
                </Text>
              </TouchableOpacity>
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
              scrollEnabled
            />
          </View>
          <VoiceInputBar
            value={data[step.id as keyof OnboardingData] as string}
            onChangeText={(text) => setData((prev) => ({ ...prev, [step.id]: text }))}
          />
          {/* Encouragement to share more */}
          {isDiscoveryStep && (
            <Text style={{
              fontFamily: FontFamily.body,
              fontSize: 13,
              color: colors.textMuted,
              marginTop: 10,
              opacity: 0.7,
            }}>
              The more you share, the more personal your devotional becomes.
            </Text>
          )}
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
              <TouchableOpacity activeOpacity={0.7}
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
                    <View style={{
                      backgroundColor: colors.inputBackground,
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
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    // Mirror-back step: reflect user's answers and commitment button
    if (step.type === 'mirrorBack') {
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
              fontSize: 20,
              color: colors.text,
              lineHeight: 32,
            }}>
              {mirrorBackText}
            </Text>
          </View>

          {/* Commitment button with accent glow */}
          <TouchableOpacity activeOpacity={0.7}
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
            <View style={{
              backgroundColor: colors.accent,
              paddingVertical: 18,
              paddingHorizontal: 24,
              borderRadius: 16,
              alignItems: 'center',
              shadowColor: colors.accent,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.5,
              shadowRadius: 20,
              elevation: 8,
            }}>
              <Text style={{
                fontFamily: FontFamily.uiSemiBold,
                fontSize: 16,
                color: '#FFFFFF',
              }}>
                Let's get started
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    // AI Consent step: disclose AI providers and get consent (App Store 5.1.2(i))
    if (step.type === 'aiConsent') {
      const disclosures = [
        {
          icon: <SparkleIcon size={22} color={colors.accent} weight="light" />,
          title: 'AI-Generated Content',
          description: 'Behind every reading: 32 study methods, rich theological frameworks, and 7 carefully crafted writing personas. AI weaves it all together with your story to create devotionals no one else will ever read.',
        },
        {
          icon: <SpeakerHighIcon size={22} color={colors.accent} weight="light" />,
          title: 'Voice Narration',
          description: 'Audio narration is generated by an AI voice service. Scripture text is sent for speech synthesis.',
        },
        {
          icon: <LockIcon size={22} color={colors.accent} weight="light" />,
          title: 'Your Privacy',
          description: 'Your journal entries stay on your device. Your private writing is never used to train AI models.',
        },
      ];

      return (
        <View style={{ gap: 20, marginTop: 8 }}>
          {/* Shield icon header */}
          <Animated.View
            entering={FadeIn.delay(200).duration(600)}
            style={{ alignItems: 'center', marginBottom: 4 }}
          >
            <ShieldCheckIcon size={40} color={colors.accent} weight="light" />
          </Animated.View>

          {/* Disclosure cards */}
          {disclosures.map((item, index) => (
            <Animated.View
              key={item.title}
              entering={FadeIn.delay(400 + index * 150).duration(500)}
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: 16,
                padding: 18,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: 'row',
                gap: 14,
              }}
            >
              <View style={{ marginTop: 2 }}>
                {item.icon}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 15,
                  color: colors.text,
                  marginBottom: 4,
                }}>
                  {item.title}
                </Text>
                <Text style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 13,
                  color: colors.textMuted,
                  lineHeight: 19,
                }}>
                  {item.description}
                </Text>
              </View>
            </Animated.View>
          ))}

          {/* Bottom consent text */}
          <Animated.Text
            entering={FadeIn.delay(900).duration(500)}
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 13,
              color: colors.textSubtle,
              textAlign: 'center',
              lineHeight: 19,
              marginTop: 4,
              paddingHorizontal: 8,
            }}
          >
            By continuing, you consent to your responses being processed by these AI services.
          </Animated.Text>

          {/* CTA button */}
          <Animated.View entering={FadeIn.delay(1100).duration(500)}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setHasConsentedToAI(true);
                setTimeout(() => advanceToNextStep(), 50);
              }}
            >
              <View style={{
                backgroundColor: colors.accent,
                paddingVertical: 18,
                paddingHorizontal: 24,
                borderRadius: 16,
                alignItems: 'center',
                shadowColor: colors.accent,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.5,
                shadowRadius: 20,
                elevation: 8,
              }}>
                <Text style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 16,
                  color: '#FFFFFF',
                }}>
                  I understand, let's continue
                </Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>
      );
    }

    // Founder's note step: a personal letter from Nick
    if (step.type === 'founderNote') {
      return (
        <View style={{ marginTop: 16, paddingHorizontal: 4 }}>
          {/* Pen nib icon */}
          <Animated.View
            entering={FadeIn.delay(200).duration(600)}
            style={{ marginBottom: 24 }}
          >
            <PenNibIcon size={32} color={colors.accent} weight="light" />
          </Animated.View>

          {/* Gold accent line */}
          <Animated.View
            entering={FadeIn.delay(400).duration(600)}
            style={{
              width: 40,
              height: 1.5,
              backgroundColor: colors.accent,
              opacity: 0.4,
              marginBottom: 28,
              borderRadius: 1,
            }}
          />

          {/* The note */}
          <View style={{ gap: 20 }}>
            <Animated.Text
              entering={FadeIn.delay(600).duration(700)}
              style={{
                fontFamily: FontFamily.bodyItalic,
                fontSize: 17,
                color: colors.text,
                lineHeight: 30,
              }}
            >
              I built Unfold because I needed it. I was going through a season where I craved something deeper than a daily verse notification — something that actually knew where I was and met me there.
            </Animated.Text>

            <Animated.Text
              entering={FadeIn.delay(900).duration(700)}
              style={{
                fontFamily: FontFamily.bodyItalic,
                fontSize: 17,
                color: colors.text,
                lineHeight: 30,
              }}
            >
              So this app is for me just as much as it is for you. I believe people everywhere deserve a space that takes their spiritual life seriously — not as a product, but as something sacred.
            </Animated.Text>

            <Animated.Text
              entering={FadeIn.delay(1200).duration(700)}
              style={{
                fontFamily: FontFamily.bodyItalic,
                fontSize: 17,
                color: colors.textMuted,
                lineHeight: 30,
              }}
            >
              I'm dedicating myself to making this that space. Thank you for trusting me with yours.
            </Animated.Text>
          </View>

          {/* Signature */}
          <Animated.View
            entering={FadeIn.delay(1600).duration(800)}
            style={{ marginTop: 32 }}
          >
            <Text
              style={{
                fontFamily: FontFamily.displayItalic,
                fontSize: 26,
                color: colors.text,
              }}
            >
              Nick
            </Text>
            {/* Gold underline under signature */}
            <View
              style={{
                width: 48,
                height: 1.5,
                backgroundColor: colors.accent,
                opacity: 0.5,
                marginTop: 6,
                borderRadius: 1,
              }}
            />
          </Animated.View>
        </View>
      );
    }

    // Style preferences 1: Faith background + Life stage
    if (step.type === 'stylePreferences1') {
      const faithOptions: { value: FaithBackground; label: string; description: string }[] = [
        { value: 'new', label: "Exploring", description: "New to faith or rediscovering it" },
        { value: 'growing', label: "Growing", description: "Familiar, deepening understanding" },
        { value: 'mature', label: "Grounded", description: "Well-versed, seeking deeper study" },
      ];
      const lifeOptions: { value: LifeStage; label: string; description: string }[] = [
        { value: 'student', label: "Student", description: "Figuring things out" },
        { value: 'building', label: "Building", description: "Career, relationships, big decisions" },
        { value: 'midlife', label: "In the thick of it", description: "Family, work, responsibilities" },
        { value: 'reflective', label: "Reflective", description: "Looking back, finding meaning" },
      ];
      return (
        <View style={{ gap: 32 }}>
          {/* Faith Background */}
          <View style={{ gap: 12 }}>
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
              Faith
            </Text>
            <View style={{ gap: 8 }}>
              {faithOptions.map((opt) => {
                const isSelected = data.faithBackground === opt.value;
                return (
                  <TouchableOpacity key={opt.value} activeOpacity={0.7}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setData((prev) => ({ ...prev, faithBackground: opt.value }));
                    }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingVertical: 16, paddingHorizontal: 18, borderRadius: 14,
                      backgroundColor: isSelected ? colors.buttonBackgroundPressed : colors.inputBackground,
                      borderWidth: 1.5, borderColor: isSelected ? colors.accent : colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 16, color: colors.text }}>{opt.label}</Text>
                      <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{opt.description}</Text>
                    </View>
                    <View style={{
                      width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                      borderColor: isSelected ? colors.accent : colors.border,
                      backgroundColor: isSelected ? colors.accent : 'transparent',
                      justifyContent: 'center', alignItems: 'center',
                    }}>
                      {isSelected && <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.background }} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {/* Life Stage */}
          <View style={{ gap: 12 }}>
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
              Season of life
            </Text>
            <View style={{ gap: 8 }}>
              {lifeOptions.map((opt) => {
                const isSelected = data.lifeStage === opt.value;
                return (
                  <TouchableOpacity key={opt.value} activeOpacity={0.7}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setData((prev) => ({ ...prev, lifeStage: opt.value }));
                    }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingVertical: 16, paddingHorizontal: 18, borderRadius: 14,
                      backgroundColor: isSelected ? colors.buttonBackgroundPressed : colors.inputBackground,
                      borderWidth: 1.5, borderColor: isSelected ? colors.accent : colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 16, color: colors.text }}>{opt.label}</Text>
                      <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{opt.description}</Text>
                    </View>
                    <View style={{
                      width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                      borderColor: isSelected ? colors.accent : colors.border,
                      backgroundColor: isSelected ? colors.accent : 'transparent',
                      justifyContent: 'center', alignItems: 'center',
                    }}>
                      {isSelected && <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.background }} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      );
    }

    // Style preferences 2: Tone + Depth
    if (step.type === 'stylePreferences2') {
      const toneOptions: { value: WritingTone; label: string; description: string; example: string }[] = [
        { value: 'warm', label: "Like a friend", description: "Gentle, encouraging, personal", example: '"You\'re not alone in this..."' },
        { value: 'direct', label: "Straight to the point", description: "Clear, practical, actionable", example: '"Here\'s what this means for today..."' },
        { value: 'poetic', label: "With beauty", description: "Lyrical, contemplative, evocative", example: '"In the quiet spaces between breaths..."' },
      ];
      const depthOptions: { value: ContentDepth; label: string; description: string }[] = [
        { value: 'simple', label: "Keep it simple", description: "One key idea to carry with you" },
        { value: 'balanced', label: "A good balance", description: "Context and application woven together" },
        { value: 'theological', label: "Take me deeper", description: "Word origins, cross-references, scholarly insight" },
      ];
      return (
        <View style={{ gap: 32 }}>
          {/* Tone */}
          <View style={{ gap: 12 }}>
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
              Voice
            </Text>
            <View style={{ gap: 8 }}>
              {toneOptions.map((opt) => {
                const isSelected = data.tone === opt.value;
                return (
                  <TouchableOpacity key={opt.value} activeOpacity={0.7}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setData((prev) => ({ ...prev, tone: opt.value }));
                    }}
                    style={{
                      paddingVertical: 16, paddingHorizontal: 18, borderRadius: 14,
                      backgroundColor: isSelected ? colors.buttonBackgroundPressed : colors.inputBackground,
                      borderWidth: 1.5, borderColor: isSelected ? colors.accent : colors.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 16, color: colors.text }}>{opt.label}</Text>
                        <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{opt.description}</Text>
                        <Text style={{ fontFamily: FontFamily.bodyItalic, fontSize: 12, color: colors.textSubtle, marginTop: 6 }}>{opt.example}</Text>
                      </View>
                      <View style={{
                        width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                        borderColor: isSelected ? colors.accent : colors.border,
                        backgroundColor: isSelected ? colors.accent : 'transparent',
                        justifyContent: 'center', alignItems: 'center',
                      }}>
                        {isSelected && <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.background }} />}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {/* Depth */}
          <View style={{ gap: 12 }}>
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
              Depth
            </Text>
            <View style={{ gap: 8 }}>
              {depthOptions.map((opt) => {
                const isSelected = data.depth === opt.value;
                return (
                  <TouchableOpacity key={opt.value} activeOpacity={0.7}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setData((prev) => ({ ...prev, depth: opt.value }));
                    }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingVertical: 16, paddingHorizontal: 18, borderRadius: 14,
                      backgroundColor: isSelected ? colors.buttonBackgroundPressed : colors.inputBackground,
                      borderWidth: 1.5, borderColor: isSelected ? colors.accent : colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 16, color: colors.text }}>{opt.label}</Text>
                      <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{opt.description}</Text>
                    </View>
                    <View style={{
                      width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                      borderColor: isSelected ? colors.accent : colors.border,
                      backgroundColor: isSelected ? colors.accent : 'transparent',
                      justifyContent: 'center', alignItems: 'center',
                    }}>
                      {isSelected && <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.background }} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      );
    }

    // Companion naming step: simplified — just the name input with orb
    if (step.type === 'companionNaming') {
      return (
        <View style={{ alignItems: 'center', gap: 24, marginTop: 16 }}>
          <Animated.View
            entering={FadeIn.delay(200).duration(600)}
            style={{ marginBottom: 8 }}
          >
            <CompanionOrb accentColor={colors.accent} size={80} isActive showBadge={false} />
          </Animated.View>
          <Animated.View
            entering={FadeIn.delay(400).duration(500)}
            style={{ width: '100%', paddingHorizontal: 4 }}
          >
            <TextInput
              value={companionNameInput}
              onChangeText={setCompanionNameInput}
              placeholder="e.g. Grace, Selah, Guide"
              placeholderTextColor={colors.textMuted}
              style={{
                fontFamily: FontFamily.body,
                fontSize: 18,
                color: colors.text,
                height: 54,
                paddingHorizontal: 20,
                backgroundColor: colors.inputBackground,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
              }}
              maxLength={30}
            />
          </Animated.View>
          <Animated.Text
            entering={FadeIn.delay(600).duration(500)}
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 14,
              color: colors.textSubtle,
              textAlign: 'center',
              paddingHorizontal: 20,
            }}
          >
            You can always change this later.
          </Animated.Text>
        </View>
      );
    }

    // Premium showcase step: final premium pitch before generating
    if (step.type === 'premiumShowcase') {
      const features = [
        { title: 'Unlimited devotionals', description: 'Create as many series as you want' },
        { title: 'Premium voices', description: 'Listen in studio-quality narration' },
        { title: 'Advanced study methods', description: '32 ways to engage with scripture' },
        { title: 'Bookmarks & highlights', description: 'Save passages that speak to you' },
        { title: 'Custom themes', description: 'Choose from 7 accent color palettes' },
        { title: 'Reading fonts', description: 'Pick the typeface that fits your reading style' },
        { title: 'Deeper personalization', description: 'Your companion learns faster' },
      ];
      return (
        <View style={{ gap: 16, marginTop: 4 }}>
          <Animated.View entering={FadeIn.delay(200).duration(600)} style={{ gap: 8 }}>
            {features.map((feature, index) => (
              <Animated.View
                key={feature.title}
                entering={FadeIn.delay(300 + index * 80).duration(500)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingVertical: 10, paddingHorizontal: 14,
                  backgroundColor: colors.accent + '0A',
                  borderRadius: 12,
                }}
              >
                <View style={{
                  width: 6, height: 6, borderRadius: 3,
                  backgroundColor: colors.accent,
                }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 15, color: colors.text }}>{feature.title}</Text>
                  <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{feature.description}</Text>
                </View>
              </Animated.View>
            ))}
          </Animated.View>

          {/* CTA: Start free trial — purchases directly via RevenueCat */}
          <Animated.View entering={FadeIn.delay(800).duration(400)}>
            <TouchableOpacity activeOpacity={0.7}
              disabled={trialPurchaseMutation.isPending}
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                hasSeenPaywallRef.current = true;
                if (!yearlyPackage) {
                  // Fallback: if offerings haven't loaded, go to full paywall
                  saveOnboardingData();
                  router.push({ pathname: '/paywall', params: { source: 'onboarding' } });
                  return;
                }
                try {
                  const result = await trialPurchaseMutation.mutateAsync(yearlyPackage);
                  if (result.ok) {
                    updateUser({ isPremium: true });
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    completeOnboarding();
                  } else {
                    // User cancelled or purchase didn't complete — no action needed
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                  }
                } catch (e) {
                  logger.log('[Onboarding] Purchase error:', e);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                }
              }}
            >
              <View style={{
                backgroundColor: colors.accent,
                paddingVertical: 16, paddingHorizontal: 24, borderRadius: 16,
                alignItems: 'center',
                shadowColor: colors.accent, shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.5, shadowRadius: 20, elevation: 8,
                opacity: trialPurchaseMutation.isPending ? 0.7 : 1,
              }}>
                {trialPurchaseMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: 16, color: '#FFFFFF' }}>
                    Start {yearlyTrialDuration} free trial
                  </Text>
                )}
              </View>
            </TouchableOpacity>

            {/* Billing terms */}
            <Text style={{
              fontFamily: FontFamily.ui,
              fontSize: 12,
              color: colors.textSubtle,
              textAlign: 'center',
              marginTop: 10,
              lineHeight: 18,
            }}>
              After your free trial, {yearlyPrice}/year. Cancel anytime.
            </Text>
          </Animated.View>

          {/* Skip option */}
          <Animated.View entering={FadeIn.delay(950).duration(400)}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                completeOnboarding();
              }}
              style={{ alignItems: 'center', paddingVertical: 8 }}
            >
              <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.textMuted }}>
                Maybe later
              </Text>
            </TouchableOpacity>
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
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleOnboardingAppleSignIn}
                disabled={isSigningIn}
                accessibilityRole="button"
                accessibilityLabel={isSigningIn ? 'Signing in' : 'Sign in with Apple'}
                accessibilityState={{ disabled: isSigningIn }}
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
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Skip option */}
          <Animated.View entering={FadeIn.delay(800).duration(400)}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={handleSkipSignIn}
              disabled={isSigningIn}
              accessibilityRole="button"
              accessibilityLabel="Continue without signing in"
              accessibilityState={{ disabled: isSigningIn }}
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
            </TouchableOpacity>
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
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, minHeight: 52 }}>
            {currentStepIndex > 0 ? (
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleBack}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
                accessibilityLabel="Go back"
                accessibilityRole="button"
              >
                <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40, height: 40 }} />
            )}
            
            {/* Continue button - hide for choice/timeChoice steps (they auto-advance) and mirrorBack (has its own CTA) */}
            {canProceed() && step.type !== 'choice' && step.type !== 'timeChoice' && step.type !== 'mirrorBack' && step.type !== 'aiConsent' && step.type !== 'premiumShowcase' ? (
              <TouchableOpacity activeOpacity={0.7}
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
              </TouchableOpacity>
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
              <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bottomOffset={20}>
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
                      style={{ fontSize: 28, lineHeight: 36, color: colors.text }}
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
              </KeyboardAwareScrollView>
            ) : (
              <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bottomOffset={20}>
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
                        style={{ fontSize: 28, lineHeight: 36, color: colors.text }}
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
              </KeyboardAwareScrollView>
            )}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const obStyles = StyleSheet.create({
  themePillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 8,
  },
  themePillText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 14,
  },
  selectionOrderBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  selectionOrderText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
  },
});
