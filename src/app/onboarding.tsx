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
import { CaretLeftIcon, XIcon, HandIcon, FingerprintIcon, MoonIcon, CompassIcon, HeartIcon, EyeIcon, FireIcon, SparkleIcon, CloudRainIcon, ScalesIcon, CrosshairIcon, BookOpenIcon, UsersIcon, MusicNotesIcon, CrownIcon, LeafIcon, ChatCircleIcon, CalendarIcon, MagicWandIcon, SmileyIcon, GiftIcon, BinocularsIcon, CloudIcon, ShieldIcon, ShieldCheckIcon, SpeakerHighIcon, LockIcon, GavelIcon } from 'phosphor-react-native';
import { logger } from '@/lib/logger';
import { Analytics, AnalyticsEvents } from '@/lib/analytics';
import { useTheme } from '@/lib/theme';
import { DarkColors, createThemedColors } from '@/constants/colors';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { INPUT_LIMITS } from '@/lib/validation';
import { TypewriterText } from '@/components/TypewriterText';
import { CompanionOrb } from '@/components/CompanionOrb';
import { VoiceInputBar } from '@/components/VoiceInputBar';
import { useUnfoldStore, UserProfile, BibleTranslation, ThemeCategory, DevotionalType, ACCENT_THEMES, WritingTone, ContentDepth, FaithBackground, LifeStage, RelationshipWithGod, BibleFrequency } from '@/lib/store';
import { generateAdaptiveQuestion, generateMirrorBackText, type MirrorBackContent } from '@/lib/devotional-service';
import { THEME_CATEGORIES, DEVOTIONAL_TYPES, BIBLICAL_CHARACTERS, BIBLE_BOOKS_FOR_STUDY, ThemeCategoryInfo, DevotionalTypeInfo, getThemeById, getDevotionalTypeById } from '@/constants/devotional-types';
import {
  pickRandomVariation,
  getRandomDurationSubtext,
  getRandomReadingSubtext,
} from '@/constants/onboarding-questions';
import {
  getOfferings,
  purchasePackage,
  isRevenueCatEnabled,
  isTrialEligibleForProduct,
} from '@/lib/revenuecatClient';
import type { PurchasesPackage } from 'react-native-purchases';
import { useQuery, useMutation } from '@tanstack/react-query';
import { alpha } from '@/components/ui';
import { EmberParticles } from '@/components/EmberParticles';
import { Current } from '@/components/Current';
import { ScatterTitle } from '@/components/ScatterTitle';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { isDevotionalLengthFree, isReadingDurationFree } from '@/lib/premium-gating';
import { submitGenerationJob } from '@/lib/generation-api';
import { ShockStat } from '@/components/onboarding/ShockStat';
import { GrowthGraph } from '@/components/onboarding/GrowthGraph';
import { MultiSelectPills } from '@/components/onboarding/MultiSelectPills';
import { VulnerabilityValidation } from '@/components/onboarding/VulnerabilityValidation';
import { FeatureSummaryCarousel } from '@/components/onboarding/FeatureSummaryCarousel';
import { DevotionalSegue } from '@/components/onboarding/DevotionalSegue';
import { ReadDevotionalStep } from '@/components/onboarding/ReadDevotionalStep';
import { OnboardingCelebration } from '@/components/onboarding/OnboardingCelebration';
import { CommitmentStep } from '@/components/onboarding/CommitmentStep';
import { ThreeStepPaywall } from '@/components/onboarding/ThreeStepPaywall';


// Slow-pulsing text — opacity breathes in and out gently
function PulsingText({ text, style }: { text: string; style: any }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.Text style={[style, animStyle]}>
      {text}
    </Animated.Text>
  );
}

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

// Scripture verses for mirror-back screen, mapped to theme categories
const THEME_SCRIPTURE: Record<string, { text: string; ref: string }> = {
  trust: { text: 'When I am afraid, I put my trust in you.', ref: 'Psalm 56:3' },
  identity: { text: 'See what kind of love the Father has given to us, that we should be called children of God; and so we are.', ref: '1 John 3:1' },
  rest: { text: 'Come to me, all who labor and are heavy laden, and I will give you rest.', ref: 'Matthew 11:28' },
  purpose: { text: 'For we are his workmanship, created in Christ Jesus for good works, which God prepared beforehand, that we should walk in them.', ref: 'Ephesians 2:10' },
  healing: { text: 'He heals the brokenhearted and binds up their wounds.', ref: 'Psalm 147:3' },
  gratitude: { text: 'Every good gift and every perfect gift is from above, coming down from the Father of lights.', ref: 'James 1:17' },
  surrender: { text: 'Trust in the Lord with all your heart, and do not lean on your own understanding.', ref: 'Proverbs 3:5' },
  courage: { text: 'Be strong and courageous. Do not be frightened, for the Lord your God is with you wherever you go.', ref: 'Joshua 1:9' },
  hope: { text: 'For I know the plans I have for you, declares the Lord, plans for welfare and not for evil, to give you a future and a hope.', ref: 'Jeremiah 29:11' },
  presence: { text: 'Where shall I go from your Spirit? Or where shall I flee from your presence?', ref: 'Psalm 139:7' },
  conviction: { text: 'For the word of God is living and active, sharper than any two-edged sword.', ref: 'Hebrews 4:12' },
  joy: { text: 'You make known to me the path of life; in your presence there is fullness of joy.', ref: 'Psalm 16:11' },
  lament: { text: 'The Lord is near to the brokenhearted and saves the crushed in spirit.', ref: 'Psalm 34:18' },
  justice: { text: 'He has told you, O man, what is good; and what does the Lord require of you but to do justice, and to love kindness, and to walk humbly with your God?', ref: 'Micah 6:8' },
  discipline: { text: 'I discipline my body and keep it under control.', ref: '1 Corinthians 9:27' },
  wonder: { text: 'The heavens declare the glory of God, and the sky above proclaims his handiwork.', ref: 'Psalm 19:1' },
};
const DEFAULT_SCRIPTURES = [
  { text: 'Be still, and know that I am God.', ref: 'Psalm 46:10' },
  { text: 'The Lord is my shepherd; I shall not want.', ref: 'Psalm 23:1' },
  { text: 'I am with you always, to the end of the age.', ref: 'Matthew 28:20' },
];
const pickRandom = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

// MirrorBackContent type imported from devotional-service

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

// Icon map for themes and types — factory function so accent color is dynamic
function getIconMap(accent: string): Record<string, React.ReactNode> {
  return {
    // Themes
    trust: <FingerprintIcon size={18} color={accent} weight="regular" />,
    courage: <FireIcon size={18} color={accent} weight="regular" />,
    joy: <SmileyIcon size={18} color={accent} weight="regular" />,
    lament: <CloudRainIcon size={18} color={accent} weight="regular" />,
    discipline: <CrosshairIcon size={18} color={accent} weight="regular" />,
    identity: <FingerprintIcon size={18} color={accent} weight="regular" />,
    purpose: <CompassIcon size={18} color={accent} weight="regular" />,
    healing: <HeartIcon size={18} color={accent} weight="regular" />,
    gratitude: <GiftIcon size={18} color={accent} weight="regular" />,
    hope: <SparkleIcon size={18} color={accent} weight="regular" />,
    rest: <MoonIcon size={18} color={accent} weight="regular" />,
    presence: <EyeIcon size={18} color={accent} weight="regular" />,
    conviction: <GavelIcon size={18} color={accent} weight="regular" />,
    surrender: <HandIcon size={18} color={accent} weight="regular" />,
    justice: <ScalesIcon size={18} color={accent} weight="regular" />,
    wonder: <BinocularsIcon size={18} color={accent} weight="regular" />,
    // Study types
    personal_journey: <CompassIcon size={20} color={accent} weight="regular" />,
    book_study: <BookOpenIcon size={20} color={accent} weight="regular" />,
    character_study: <UsersIcon size={20} color={accent} weight="regular" />,
    psalm_journey: <MusicNotesIcon size={20} color={accent} weight="regular" />,
    beatitudes: <CrownIcon size={20} color={accent} weight="regular" />,
    fruit_of_spirit: <LeafIcon size={20} color={accent} weight="regular" />,
    lords_prayer: <ChatCircleIcon size={20} color={accent} weight="regular" />,
    names_of_god: <FireIcon size={20} color={accent} weight="regular" />,
    seasons: <CalendarIcon size={20} color={accent} weight="regular" />,
    parables: <ChatCircleIcon size={20} color={accent} weight="regular" />,
  };
}

const ALL_STEPS = [
  // HOOK: Opening question — problem-naming with an obvious "yes"
  { id: 'hook', question: '', subtext: '', type: 'hook' as const, adaptive: false, skipIfHasValue: false, hasVariations: false },
  // SOLUTION: The feeling — chaos freezes on "still"
  { id: 'solution', question: '', subtext: '', type: 'solution' as const, adaptive: false, skipIfHasValue: false, hasVariations: false },
  // UNFOLD INTRO: The answer — what Unfold is, particles rise
  { id: 'unfoldIntro', question: '', subtext: '', type: 'unfoldIntro' as const, adaptive: false, skipIfHasValue: false, hasVariations: false },
  { id: 'name', question: "What's your name?", subtext: 'Just your first name is perfect.', type: 'text' as const, placeholder: 'Your name', adaptive: false, skipIfHasValue: true, hasVariations: false },
  { id: 'aboutMe', question: 'Tell me about\u00A0yourself.', subtext: "The more you share, the more personal your devotionals become. Your story stays on your device \u2014 never used to train\u00A0AI.", type: 'multiline' as const, placeholder: "I'm a dad, an entrepreneur, and lately I've been wrestling with...", adaptive: false, skipIfHasValue: true, hasVariations: false },
  // STYLE PREFERENCES: Faith background + life stage
  { id: 'stylePreferences1', question: "Your walk right\u00A0now.", subtext: 'This shapes the voice and depth of everything you read.', type: 'stylePreferences1' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
  // STYLE PREFERENCES: Tone + depth
  { id: 'stylePreferences2', question: "Your reading\u00A0style.", subtext: 'The tone and depth that serves you best. You can always change this in settings.', type: 'stylePreferences2' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
  // CONFRONT: Relationship with God — problem reinforcement
  { id: 'relationshipWithGod', question: "How would you describe your relationship with God right\u00A0now?", subtext: '', type: 'choice' as const, adaptive: false, skipIfHasValue: false, hasVariations: false, options: [
    { value: 'close', label: 'Close and consistent' },
    { value: 'ups-and-downs', label: 'Has its ups and downs' },
    { value: 'distant', label: 'Feeling distant lately' },
    { value: 'starting', label: 'Just starting or rebuilding' },
  ]},
  // CONFRONT: Bible reading frequency — feeds shock stat
  { id: 'bibleFrequency', question: "How often do you spend time in God's\u00A0word?", subtext: '', type: 'choice' as const, adaptive: false, skipIfHasValue: false, hasVariations: false, options: [
    { value: 'daily', label: 'Every day' },
    { value: 'few-times-week', label: 'A few times a week' },
    { value: 'weekly', label: 'Once a week' },
    { value: 'couple-times-month', label: 'A couple times a month' },
    { value: 'rarely', label: 'Rarely' },
    { value: 'never', label: 'Never' },
  ]},
  // CONFRONT: Shock stat — pure problem, 93%/11% gap
  { id: 'shockStat', question: '', subtext: '', type: 'shockStat' as const, adaptive: false, skipIfHasValue: false, hasVariations: false },
  // CONFRONT: Growth graph — the turn, hope arrives
  { id: 'growthGraph', question: '', subtext: '', type: 'growthGraph' as const, adaptive: false, skipIfHasValue: false, hasVariations: false },
  // ASPIRATIONS: What do you want to grow in? (multi-select pills, max 3)
  { id: 'growthGoals', question: "What do you want to\u00A0grow\u00A0in?", subtext: 'Pick up to 3 that resonate most.', type: 'multiSelect' as const, adaptive: false, skipIfHasValue: false, hasVariations: false, options: [
    { value: 'prayer', label: 'Prayer life' },
    { value: 'scripture', label: 'Scripture knowledge' },
    { value: 'trust', label: 'Trusting God' },
    { value: 'peace', label: 'Finding peace' },
    { value: 'community', label: 'Community' },
    { value: 'discipline', label: 'Spiritual discipline' },
    { value: 'purpose', label: 'Sense of purpose' },
    { value: 'forgiveness', label: 'Forgiveness' },
    { value: 'gratitude', label: 'Gratitude' },
    { value: 'patience', label: 'Patience' },
  ], maxCount: 3 },
  // OBSTACLES: What gets in the way? (multi-select pills, no max)
  { id: 'obstacles', question: "What gets in the\u00A0way?", subtext: 'Select any that feel true right now.', type: 'multiSelect' as const, adaptive: false, skipIfHasValue: false, hasVariations: false, options: [
    { value: 'busy', label: 'Too busy' },
    { value: 'distracted', label: 'Easily distracted' },
    { value: 'alone', label: 'Doing it alone' },
    { value: 'doubt', label: 'Doubt & questions' },
    { value: 'consistency', label: 'Staying consistent' },
    { value: 'boring', label: 'Bible feels dry' },
    { value: 'guilt', label: 'Guilt or shame' },
    { value: 'understanding', label: "Don't know where to start" },
    { value: 'motivation', label: 'Lack of motivation' },
  ] },
  // ASPIRATION: What would breakthrough look like? (text + pill starters)
  { id: 'aspiration', question: "When you imagine your faith 6\u00A0months from now, what\u2019s\u00A0different?", subtext: "If something could shift, what would you hope it would\u00A0be?", type: 'multiline' as const, placeholder: "I think what I really need is...", adaptive: true, skipIfHasValue: false, hasVariations: true },
  // VULNERABILITY VALIDATION: The exhale — acknowledge their courage before mirror-back
  { id: 'vulnerabilityValidation', question: '', subtext: '', type: 'vulnerabilityValidation' as const, adaptive: false, skipIfHasValue: false, hasVariations: false },
  // MIRROR-BACK: Poetic reflection — like a book introduction
  { id: 'mirrorBack', question: "We heard\u00A0you.", subtext: '', type: 'mirrorBack' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
  // FEATURE SUMMARY: How-it-works carousel with companion naming
  { id: 'featureSummary', question: '', subtext: '', type: 'featureSummary' as const, adaptive: false, skipIfHasValue: false, hasVariations: false },
  // FOUNDER NOTE: A personal letter from the founder
  { id: 'founderNote', question: 'A note from the\u00A0founder', subtext: '', type: 'founderNote' as const, placeholder: '', adaptive: false, skipIfHasValue: false, hasVariations: false },
  // SEGUE: Build anticipation before the first devotional reveal
  { id: 'devotionalSegue', question: '', subtext: '', type: 'devotionalSegue' as const, adaptive: false, skipIfHasValue: false, hasVariations: false },
  // READ THE DEVOTIONAL: The actual first reading experience during onboarding
  { id: 'readDevotional', question: '', subtext: '', type: 'readDevotional' as const, adaptive: false, skipIfHasValue: false, hasVariations: false },
  // CELEBRATION: Emotional payoff after first devotional
  { id: 'celebration', question: '', subtext: '', type: 'celebration' as const, adaptive: false, skipIfHasValue: false, hasVariations: false },
  // COMMITMENT 1: Self-identification question
  { id: 'commitment1', question: "How committed are you to making space for this?", subtext: '', type: 'commitment1' as const, adaptive: false, skipIfHasValue: false, hasVariations: false },
  // COMMITMENT 2: Personalized affirmation
  { id: 'commitment2', question: '', subtext: '', type: 'commitment2' as const, adaptive: false, skipIfHasValue: false, hasVariations: false },
  // THREE STEP PAYWALL: Final premium pitch before generating — shown to ALL users
  { id: 'threeStepPaywall', question: '', subtext: '', type: 'threeStepPaywall' as const, adaptive: false, skipIfHasValue: false, hasVariations: false },
];

type StepId = 'hook' | 'solution' | 'unfoldIntro' | 'name' | 'aboutMe' | 'stylePreferences1' | 'stylePreferences2' | 'relationshipWithGod' | 'bibleFrequency' | 'shockStat' | 'growthGraph' | 'growthGoals' | 'obstacles' | 'aspiration' | 'vulnerabilityValidation' | 'mirrorBack' | 'featureSummary' | 'founderNote' | 'devotionalSegue' | 'readDevotional' | 'celebration' | 'commitment1' | 'commitment2' | 'threeStepPaywall';

// Discovery chips — tappable quick-select options for the 3 discovery questions
// Each chip is a feeling/situation that seeds context without requiring typing
// Default discovery chips — used as fallback when AI chips aren't available
const DISCOVERY_CHIPS: Record<string, string[]> = {
  currentSituation: [
    'A relationship', 'My future', 'Work stress', 'A loss',
    'Big changes', 'Starting over', 'Feeling stuck', 'Health',
    'Loneliness', 'Family', 'A decision', 'Letting go',
    'Faith doubts', 'Finding purpose', 'Need rest', 'Forgiveness',
  ],
  spiritualSeeking: [
    'Consistent rhythm', 'Peace in uncertainty', 'Hearing God clearly',
    'Deeper relationships', 'Freedom from guilt', 'Bible feels alive',
  ],
  aspiration: [
    'Consistent rhythm', 'Peace in uncertainty', 'Hearing God clearly',
    'Deeper relationships', 'Freedom from guilt', 'Bible feels alive',
    'Trusting more', 'Less anxiety', 'Stronger prayer life', 'Knowing my purpose',
  ],
};

/**
 * Contextual situation chips — maps each theme and type to relevant Q1 pills.
 * These replace the generic "Anxious, Grateful, Searching..." pills with options
 * that match what the user chose to explore, providing zero-latency contextual answers.
 */
const CONTEXTUAL_SITUATION_CHIPS: Record<string, string[]> = {
  // Theme pills
  trust: ['Letting go', 'Control', 'Betrayed', 'Guarded', 'Vulnerable', 'Uncertain', 'Rebuilding', 'Suspicious'],
  identity: ['Lost', 'Comparing', 'Performing', 'Unseen', 'Shifting', 'Questioning', 'Torn', 'Rebuilding'],
  rest: ['Burned out', "Can't stop", 'Guilty resting', 'Running on empty', 'Wired', 'Depleted', 'Striving', 'Overcommitted'],
  presence: ['Distracted', 'Distant from God', 'Going through motions', 'Longing', 'Numb', 'Disconnected', 'Seeking', 'Dry season'],
  healing: ['Wounded', 'Processing', 'Stuck in pain', 'Ready', 'Afraid to hope', 'Scarred', 'Tired of hurting', 'Slowly mending'],
  joy: ['Joyless', 'Faking it', 'Grateful but heavy', 'Searching for lightness', 'Nostalgic', 'Flat', 'Wanting to celebrate', 'Suppressing'],
  gratitude: ['Taking things for granted', 'Overwhelmed by blessings', 'Hard to be thankful', 'Rediscovering', 'Guilt about complaining', 'Noticing more', 'Humbled', 'Adjusting perspective'],
  lament: ['Crying out', 'Angry at God', 'Why me', 'Sitting in ashes', 'Raw', 'Unanswered prayers', 'Shaking fist', 'Abandoned'],
  hope: ['Barely holding on', 'Waiting', 'Discouraged', 'Flickering', 'Skeptical', 'Wanting to believe', 'Weary', 'Cynical'],
  purpose: ['Directionless', 'Stuck', 'Restless', 'Called but unclear', 'Underused', 'Pivoting', 'Searching', 'Torn between paths'],
  courage: ['Paralyzed', 'Playing it safe', 'Avoiding', 'Shrinking back', 'Afraid to step out', 'People-pleasing', 'Hiding', 'Holding back'],
  conviction: ['Compromising', 'Wavering', 'Standing alone', 'Pressured', 'Doubting beliefs', 'Torn', 'Tested', 'Conflicted'],
  surrender: ['White-knuckling', 'Controlling', 'Resisting', 'Exhausted from fighting', 'Afraid to let go', 'Bargaining', 'Stubborn', 'Clinging'],
  discipline: ['Inconsistent', 'Starting over again', 'Distracted', 'No routine', 'Falling short', 'Wanting structure', 'Undisciplined', 'Scattered'],
  justice: ['Outraged', 'Helpless', 'Burdened for others', 'Systemic weight', 'Wanting to act', 'Complicit', 'Fatigued', 'Fired up'],
  wonder: ['Dulled', 'Routine', 'Lost childlike faith', 'Craving awe', 'Overlooking beauty', 'Jaded', 'Curious again', 'Closed off'],
  grief: ['Numb', 'Missing someone', 'Angry', 'Empty', 'Guilty', 'In denial', 'Exhausted', 'Waves of sadness'],
  // Type pills
  book_study: ['Curious', 'Intimidated', 'Excited', 'Returning to it', 'Fresh eyes', 'Looking deeper', 'Committed', 'Exploring'],
  character_study: ['Curious', 'Identifying with someone', 'Inspired', 'Challenged', 'Seeking examples', 'Learning from failure', 'Drawn to a story', 'Wanting mentorship'],
  psalm_study: ['Heavy-hearted', 'Praising', 'Lamenting', 'Grateful', 'Crying out', 'Worshiping', 'Wrestling', 'Remembering'],
  topical_study: ['Questioning', 'Seeking answers', 'Building foundation', 'Deconstructing', 'Hungry to learn', 'Confused', 'Wanting depth', 'Revisiting basics'],
  lectio_divina: ['Seeking stillness', 'Restless mind', 'Wanting to listen', 'Spiritually dry', 'Open', 'Contemplative', 'Distracted', 'Hungry for encounter'],
  soap_journal: ['Wanting structure', 'Journaling curious', 'Need accountability', 'Fresh start', 'Building habit', 'Reflective', 'Seeking consistency', 'Ready to commit'],
  verse_mapping: ['Detail-oriented', 'Wanting context', 'Digging deeper', 'Scholarly', 'Curious about original meaning', 'Seeking precision', 'Analytical', 'Thorough'],
  parables: ['Confused by parables', 'Wanting fresh perspective', 'Familiar but shallow', 'Ready for depth', 'Seeking hidden meaning', 'Storyteller', 'Practical learner', 'Curious'],
};

/**
 * Get contextual situation chips for Q1 based on the user's theme or type selection.
 * Falls back to static DISCOVERY_CHIPS.currentSituation for guided mode or no match.
 */
function getContextualSituationChips(
  selectedMainOption: 'theme' | 'type' | 'guided' | undefined,
  selectedThemes: ThemeCategory[],
  selectedType: DevotionalType | undefined,
): string[] {
  if (selectedMainOption === 'theme' && selectedThemes.length > 0) {
    const themeChips = CONTEXTUAL_SITUATION_CHIPS[selectedThemes[0]];
    if (themeChips) return themeChips;
  }
  if (selectedMainOption === 'type' && selectedType) {
    const typeChips = CONTEXTUAL_SITUATION_CHIPS[selectedType];
    if (typeChips) return typeChips;
  }
  // Guided mode or no match — fall back to generic chips
  return DISCOVERY_CHIPS.currentSituation;
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
  spiritualSeeking: string;
  aspiration: string;
  growthGoals: string[];
  obstacles: string[];
  relationshipWithGod?: RelationshipWithGod;
  bibleFrequency?: BibleFrequency;
  readingDuration: 5 | 15 | 30;
  devotionalLength: 3 | 7 | 14 | 30;
  reminderTime: string;
  mirrorBackCommitted: boolean;
}

// Progress indicator component
function ProgressIndicator({ currentStepIndex, totalSteps, colors }: { currentStepIndex: number; totalSteps: number; colors: any }) {
  // Hidden for now — keeping the slot for future use
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

  const iconMap = useMemo(() => getIconMap(colors.accent), [colors.accent]);

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
    bibleTranslation: existingUser?.bibleTranslation || 'BSB',
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
    spiritualSeeking: '',
    aspiration: '',
    growthGoals: [],
    obstacles: [],
    relationshipWithGod: undefined,
    bibleFrequency: undefined,
    readingDuration: 15,
    devotionalLength: 7,
    reminderTime: '8:00 AM',
    mirrorBackCommitted: false,
  });

  // RevenueCat — fetch offerings for direct purchase from threeStepPaywall
  const { data: offeringsResult } = useQuery({
    queryKey: ['revenuecat', 'offerings'],
    queryFn: getOfferings,
    enabled: isRevenueCatEnabled(),
  });
  const rcOfferings = offeringsResult?.ok ? offeringsResult.data : null;
  const yearlyPackage = rcOfferings?.current?.availablePackages.find(
    (pkg) => pkg.identifier === '$rc_annual'
  );
  const yearlyPrice = yearlyPackage?.product.priceString ?? '$59.99';
  // Honest source of truth: only true when (a) App Store Connect advertises
  // a zero-price intro offer on the yearly SKU AND (b) RevenueCat confirms
  // *this user* is eligible to receive it. Everywhere in the paywall UI reads
  // from this flag so we never promise a trial the user won't actually get
  // (Apple Guideline 3.1.2). Defaults to `false` while either query resolves
  // or on any error — showing non-trial pricing to a trial-eligible user is
  // merely a missed upsell; showing trial copy to an ineligible user is a lie.
  const yearlyProductId = yearlyPackage?.product.identifier;
  const { data: yearlyEligible } = useQuery({
    queryKey: ['revenuecat', 'trial-eligibility', yearlyProductId],
    queryFn: () =>
      yearlyProductId ? isTrialEligibleForProduct(yearlyProductId) : false,
    enabled: isRevenueCatEnabled() && !!yearlyProductId,
    staleTime: Infinity,
  });
  const yearlyHasZeroIntro = (() => {
    const intro = yearlyPackage?.product.introPrice;
    return !!intro && intro.price === 0;
  })();
  const yearlyHasFreeTrial = yearlyHasZeroIntro && yearlyEligible === true;
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

  // Premium gating state for duration/length options in onboarding
  const [premiumGateFeature, setPremiumGateFeature] = useState<'devotionalLength' | 'readingDuration' | null>(null);

  // Adaptive-question endpoint is now public (no auth required) — no early auth needed.

  // Mirror-back content — structured for the redesigned screen
  const mirrorBackContent = useMemo<MirrorBackContent>(() => {
    const themeId = (data?.selectedThemes?.length ?? 0) > 0 ? data.selectedThemes[0] : null;
    const hasEmotional = !!data?.currentSituation;
    const hasSeeking = !!data?.spiritualSeeking;
    const nameClause = data?.name ? `${data.name}, ` : '';

    // Pick scripture based on selected theme
    const scripture = themeId && THEME_SCRIPTURE[themeId]
      ? THEME_SCRIPTURE[themeId]
      : pickRandom(DEFAULT_SCRIPTURES);

    let reflection: string;
    if (hasEmotional && hasSeeking) {
      reflection = pickRandom([
        `${nameClause}something real brought you here\u00A0\u2014 a weight you've been carrying, and a hope you haven't let go\u00A0of.`,
        `Between where you are and where you're reaching, ${nameClause.toLowerCase() || ''}God is already at\u00A0work.`,
        `${nameClause}you named what many people never pause long enough to say out\u00A0loud.`,
      ]);
    } else if (hasEmotional) {
      reflection = pickRandom([
        `${nameClause}you named something that matters. That kind of honesty is where God meets\u00A0us.`,
        `What you shared took courage${data?.name ? `, ${data.name}` : ''}. It's exactly the right place to\u00A0begin.`,
      ]);
    } else {
      reflection = pickRandom([
        `${nameClause}something drew you here today. Whatever the reason\u00A0\u2014 you're in the right\u00A0place.`,
        `You showed up${data?.name ? `, ${data.name}` : ''}. That's the beginning of\u00A0everything.`,
      ]);
    }

    const anticipation = 'Something is being written for you right now\u00A0\u2014 crafted for exactly where you\u00A0are.';

    return { reflection, verse: scripture.text, verseRef: scripture.ref, anticipation };
  }, [data?.selectedThemes, data?.currentSituation, data?.spiritualSeeking, data?.name]);

  // Track which step we're on (from filtered list)
  const [currentStepId, setCurrentStepId] = useState<StepId>('hook');

  // Dev: step picker visibility + show-all toggle
  const [devStepPickerVisible, setDevStepPickerVisible] = useState(false);
  const [devShowAllSteps, setDevShowAllSteps] = useState(false);

  // Chaos particle speed — shared value so Current can freeze smoothly
  const chaosSpeed = useSharedValue(1);
  // Vertical drift — negative = upward. Used on Screen 3.
  const chaosDrift = useSharedValue(0);

  // Screen 2: "still." reveal state
  const [showStillWord, setShowStillWord] = useState(false);

  // Gate taps — prevents advancing while animations are still playing
  const [screenReady, setScreenReady] = useState(false);

  // Drive particle transitions when entering screens
  useEffect(() => {
    if (currentStepId === 'unfoldIntro') {
      // Screen 3: wait a beat, then gently wake particles and drift upward
      // Delay prevents the visual "jump" at transition
      setTimeout(() => {
        chaosSpeed.value = withTiming(0.5, { duration: 4000, easing: Easing.out(Easing.quad) });
      }, 600);
      setTimeout(() => {
        chaosDrift.value = withTiming(-2.5, { duration: 5000, easing: Easing.out(Easing.quad) });
      }, 1200);
    } else if (currentStepId === 'hook') {
      // Reset everything for Screen 1
      chaosSpeed.value = 1;
      chaosDrift.value = 0;
    } else if (currentStepId === 'shockStat') {
      // Shock stat: particles slow to near-still immediately, drift stops
      chaosSpeed.value = withTiming(0.08, { duration: 800, easing: Easing.out(Easing.cubic) });
      chaosDrift.value = withTiming(0, { duration: 800, easing: Easing.out(Easing.cubic) });
      // When 11% reveals (~3000ms), freeze particles completely
      setTimeout(() => {
        chaosSpeed.value = withTiming(0.01, { duration: 1000, easing: Easing.out(Easing.cubic) });
      }, 3000);
    } else if (currentStepId === 'growthGraph') {
      // Screen 10: hope arriving — particles begin slow warm drift upward
      setTimeout(() => {
        chaosSpeed.value = withTiming(0.4, { duration: 3000, easing: Easing.out(Easing.quad) });
      }, 800);
      setTimeout(() => {
        chaosDrift.value = withTiming(-1.5, { duration: 4000, easing: Easing.out(Easing.quad) });
      }, 1500);
    }
  }, [currentStepId]);

  // Track pending auth data to merge into completeOnboarding's setUser/updateUser call.
  const pendingAuthDataRef = useRef<Partial<UserProfile> | null>(null);

  // Track if user is in theme sub-selection mode
  const [themeSelectionMode, setThemeSelectionMode] = useState<'none' | 'theme' | 'type'>('none');
  
  // Track if we're preparing for discovery (generating adaptive questions)
  const [isPreparingDiscovery, setIsPreparingDiscovery] = useState(false);
  const [preparingQuip, setPreparingQuip] = useState('Contemplating...');
  
  // AI-generated mirror-back content
  const [aiMirrorBack, setAiMirrorBack] = useState<MirrorBackContent | null>(null);
  const [isLoadingMirrorBack, setIsLoadingMirrorBack] = useState(false);

  // Adaptive question states
  const [adaptedSteps, setAdaptedSteps] = useState<Record<string, { question: string; subtext: string; chips?: string[] }>>({});
  const [isLoadingAdaptive, setIsLoadingAdaptive] = useState(false);
  const ripple1 = useSharedValue(0);
  const ripple2 = useSharedValue(0);
  const ripple3 = useSharedValue(0);
  
  // Discovery chips — multi-select state per step
  const [selectedChips, setSelectedChips] = useState<Record<string, string[]>>({
    currentSituation: [],
    spiritualSeeking: [],
    aspiration: [],
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
  const onboardingJobIdRef = useRef<string | null>(null);
  const onboardingDevotionalResultRef = useRef<any>(null);
  const [commitmentLevel, setCommitmentLevel] = useState<string>('');
  const [onboardingDevotionalDay, setOnboardingDevotionalDay] = useState<any>(null);
  const [onboardingDevotionalId, setOnboardingDevotionalId] = useState<string>('');
  
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

  // Generate AI mirror-back when reaching that step
  useEffect(() => {
    if (currentStepId === 'mirrorBack' && !aiMirrorBack && !isLoadingMirrorBack) {
      setIsLoadingMirrorBack(true);
      generateMirrorBackText({
        selectedThemes: data.selectedThemes,
        selectedType: data.selectedType,
        emotionalState: '',
        currentSituation: data.currentSituation,
        faithImpact: '',
        spiritualSeeking: data.spiritualSeeking || data.aspiration,
        name: data.name,
        aboutMe: data.aboutMe,
        relationshipWithGod: data.relationshipWithGod,
        growthGoals: data.growthGoals,
        obstacles: data.obstacles,
      })
        .then(({ content }) => {
          setAiMirrorBack(content);
        })
        .catch((err) => {
          logger.warn('[MirrorBack] Generation failed, using fallback:', err);
          setAiMirrorBack(mirrorBackContent);
        })
        .finally(() => {
          setIsLoadingMirrorBack(false);
        });
    }
  }, [currentStepId]);

  // Keyboard height tracking for scroll adjustment
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  // Filter steps based on what we already know
  const STEPS = useMemo(() => {
    // Dev: bypass all filtering to show every screen
    if (__DEV__ && devShowAllSteps) return ALL_STEPS;

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
      
      // Skip first-time-only steps for returning users
      // These are first-time onboarding only — not shown when building new devotionals
      if (existingUser?.hasCompletedOnboarding) {
        if (step.id === 'founderNote' || step.id === 'featureSummary' || step.id === 'threeStepPaywall' || step.id === 'stylePreferences1' || step.id === 'stylePreferences2') {
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
  }, [existingUser, data.selectedMainOption, data.selectedType, hasConsentedToAI, devShowAllSteps]);
  
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
    // Character study gets "Who" instead of "Which"
    if (step.id === 'studySubject' && data.selectedType === 'character_study') {
      return 'Who would you like to study?';
    }
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
    
    // For multiSelect inputs — at least 1 pill selected
    if (step.type === 'multiSelect') {
      const arr = data[step.id as keyof OnboardingData];
      return Array.isArray(arr) && arr.length > 0;
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

    // Mirror-back, AI consent, founder note, companion naming, style preferences, cinematic steps, and three-step paywall always allow proceeding
    if (step.type === 'mirrorBack' || step.type === 'founderNote' || step.type === 'featureSummary' || step.type === 'devotionalSegue' || step.type === 'readDevotional' || step.type === 'stylePreferences1' || step.type === 'stylePreferences2' || step.type === 'threeStepPaywall' || step.type === 'shockStat' || step.type === 'growthGraph' || step.type === 'vulnerabilityValidation' || step.type === 'celebration' || step.type === 'commitment1' || step.type === 'commitment2') {
      return true;
    }

    return true;
  };
  
  // Handle typewriter animation complete
  const handleTypewriterComplete = () => {
    setShowInput(true);
    inputOpacity.value = withTiming(1, { duration: Duration.slow });
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
        emotionalState: '',
        faithImpact: '',
        spiritualSeeking: data.spiritualSeeking || data.aspiration,
        growthGoals: data.growthGoals,
        obstacles: data.obstacles,
        relationshipWithGod: data.relationshipWithGod,
        bibleFrequency: data.bibleFrequency,
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
        emotionalState: '',
        faithImpact: '',
        spiritualSeeking: data.spiritualSeeking || data.aspiration,
        growthGoals: data.growthGoals,
        obstacles: data.obstacles,
        relationshipWithGod: data.relationshipWithGod,
        bibleFrequency: data.bibleFrequency,
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
        preferredVoice: 'arman',
        ...(data.selectedThemes.length > 0 ? { selectedTheme: data.selectedThemes[0] } : {}),
        ...(data.selectedType ? { selectedType: data.selectedType } : {}),
        ...(data.selectedStudySubject ? { selectedStudySubject: data.selectedStudySubject } : {}),
        ...pendingAuth,
      });
    }
  }, [data, existingUser, updateUser, setUser, purchasedDuringOnboarding]);

  // Complete onboarding: save data + navigate to generating screen
  const proceedToGeneration = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    saveOnboardingData();
    router.replace('/generating');
  }, [router, saveOnboardingData]);

  const completeOnboarding = useCallback(() => {
    proceedToGeneration();
  }, [proceedToGeneration]);

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
      duration: Duration.normal,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });

    setCurrentStepId(nextStepId);
    setScreenReady(false);
    setShowStillWord(false);
    setShowInput(false);
    setShowListScrollHint(true);
    inputOpacity.value = 0;
  }, [STEPS, currentStepId, inputOpacity, completeOnboarding]);


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
            duration: Duration.normal,
            create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
            update: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
          });
          setThemeSelectionMode('theme');
          return;
        } else if (data.selectedMainOption === 'type') {
          LayoutAnimation.configureNext({
            duration: Duration.normal,
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
    // Also compute the merged value synchronously for adaptive question generation
    let mergedCurrentAnswer: string | undefined;
    const discoveryStepIds = ['currentSituation', 'spiritualSeeking'];
    if (discoveryStepIds.includes(currentStepId)) {
      const chips = selectedChips[currentStepId] ?? [];
      const currentText = (data[currentStepId as keyof OnboardingData] as string || '').trim();
      if (chips.length > 0) {
        const chipPrefix = chips.join(', ');
        // Merge: "Anxious, Searching — I've been thinking about..."
        const merged = currentText
          ? `${chipPrefix} — ${currentText}`
          : chipPrefix;
        mergedCurrentAnswer = merged;
        setData((prev) => ({ ...prev, [currentStepId]: merged }));
      } else if (currentText) {
        mergedCurrentAnswer = currentText;
      }
    }

    // Fire-and-forget: trigger onboarding devotional generation after aspiration
    // so content generates in the background while the user continues through buffer screens.
    if (currentStepId === 'aspiration') {
      submitGenerationJob({
        jobType: 'onboarding',
        dayNumber: 1,
        userContext: {
          name: data.name || existingUser?.name || '',
          aboutMe: data.aboutMe || existingUser?.aboutMe || '',
          situation: data.currentSituation || '',
          emotion: '',
          faith: '',
          seeking: data.aspiration || '',
          themeCategory: '',
          devotionalType: '',
          readingDuration: 5,
          bibleTranslation: existingUser?.bibleTranslation || 'BSB',
          relationshipWithGod: data.relationshipWithGod || 'ups-and-downs',
          growthGoals: data.growthGoals || [],
          obstacles: data.obstacles || [],
        },
      }).then(({ jobId }) => {
        onboardingJobIdRef.current = jobId;
        console.log('[Onboarding] Generation triggered, jobId:', jobId);
      }).catch((err) => {
        console.warn('[Onboarding] Background generation failed:', err);
      });
    }

    // Save companion name when leaving the feature summary step (companion naming is inside the carousel)
    if (currentStepId === 'featureSummary') {
      const trimmed = companionNameInput.trim();
      setCompanionName(trimmed.length > 0 ? trimmed : null);
    }

    // Dismiss keyboard first to prevent layout shift during animation
    Keyboard.dismiss();

    // If leaving an adaptive discovery step, generate the next adaptive question
    const adaptiveNextMap: Record<string, string> = {
      currentSituation: 'spiritualSeeking',
    };
    const nextAdaptiveStepId = adaptiveNextMap[currentStepId];
    if (nextAdaptiveStepId && baseStep?.adaptive) {
      // Fire-and-forget: generate adaptive question in background while advancing
      // The question will be ready by the time the typewriter finishes on the next step
      // Pass the merged answer directly since setData is async and data won't be updated yet
      generateNextAdaptiveQuestion(nextAdaptiveStepId, mergedCurrentAnswer);
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
        duration: Duration.normal,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });

      // Reset particle + animation state when navigating back
      chaosSpeed.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
      chaosDrift.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) });
      setShowStillWord(false);
      setScreenReady(false);

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
      const typeName = data.selectedType
        ? getDevotionalTypeById(data.selectedType)?.name ?? data.selectedType.replace(/_/g, ' ')
        : '';

      // Get contextual pills from the lookup table
      const contextualChips = getContextualSituationChips(
        selectionType === 'theme' ? 'theme' : selectionType === 'type' ? 'type' : 'guided',
        data.selectedThemes,
        data.selectedType,
      );

      const firstQuestion: { question: string; subtext: string; chips?: string[] } = selectionType === 'theme' ? {
        question: `When you think about ${themeName.toLowerCase()}, where do you find\u00A0yourself?`,
        subtext: "The honest, unfiltered reality of where you are.",
        chips: contextualChips,
      } : selectionType === 'type' ? {
        question: `As you begin your ${typeName} journey, what's on your heart?`,
        subtext: "The thing that's there when the noise quiets down.",
        chips: contextualChips,
      } : {
        question: "What's been on your heart lately?",
        subtext: "The thing that's there when the noise quiets down.",
        chips: contextualChips,
      };

      // Set the first adaptive question immediately
      setAdaptedSteps((prev) => ({ ...prev, currentSituation: firstQuestion }));
    } finally {
      clearInterval(quipInterval);
      setIsPreparingDiscovery(false);

      // Advance to discovery
      LayoutAnimation.configureNext({
        duration: Duration.slow,
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
  // currentAnswerOverride: pass the merged chips+text for the step we're leaving,
  // since setData is async and data[currentStepId] won't reflect the merge yet
  const generateNextAdaptiveQuestion = async (nextStepId: string, currentAnswerOverride?: string) => {
    // Collect previous Q&A from all answered discovery steps
    const discoverySteps = ['currentSituation', 'spiritualSeeking'];
    const previousAnswers: { question: string; answer: string }[] = [];

    // The step immediately before nextStepId is the one we're leaving
    const leavingStepIdx = discoverySteps.indexOf(nextStepId) - 1;
    const leavingStepId = leavingStepIdx >= 0 ? discoverySteps[leavingStepIdx] : null;

    for (const stepId of discoverySteps) {
      if (stepId === nextStepId) break; // Stop before the next step
      // Use the override for the step we're leaving (data state hasn't updated yet)
      const answer = (stepId === leavingStepId && currentAnswerOverride !== undefined)
        ? currentAnswerOverride
        : data[stepId as keyof OnboardingData];
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
    const positionMap: Record<string, 'opening' | 'depth' | 'bridge' | 'longing'> = {
      currentSituation: 'opening',
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
      const result = await generateAdaptiveQuestion(previousAnswers, fallbackQuestion, stepPosition, {
        growthGoals: data.growthGoals,
        obstacles: data.obstacles,
        relationshipWithGod: data.relationshipWithGod,
      });
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

    // Screen 1: Hook question — chaos particles, scatter title, pulsing CTA
    if (step.type === 'hook') {
      return (
        <TouchableOpacity
          activeOpacity={1}
          disabled={!screenReady}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            advanceToNextStep();
          }}
          style={{ flex: 1, paddingHorizontal: Spacing['6'] }}
        >
          {/* Heading — left-aligned, scatter letter animation */}
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <ScatterTitle
              text="Ever open your Bible and not know where to start?"
              fontSize={32}
              baseDelay={400}
              stagger={60}
              color={colors.text}
              onComplete={() => setScreenReady(true)}
            />

            {/* Tap anywhere — always rendered to reserve space, opacity controlled */}
            <View style={{ marginTop: Spacing['4'], opacity: screenReady ? 1 : 0 }}>
              <PulsingText
                text="Tap anywhere to continue"
                style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.textMuted }}
              />
            </View>
          </View>

          {/* Bottom spacer */}
          <View style={{ paddingBottom: Spacing['8'] }} />
        </TouchableOpacity>
      );
    }

    // Screen 2: The feeling — chaos freezes on "still."
    // Typewriter runs the full text. "still." is gold via lastWordColor.
    // Chaos slows during "..." then freezes with haptic on "still."
    if (step.type === 'solution') {
      return (
        <TouchableOpacity
          activeOpacity={1}
          disabled={!screenReady}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            advanceToNextStep();
          }}
          style={{ flex: 1, paddingHorizontal: Spacing['6'] }}
        >
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <TypewriterText
              text="All that noise. The searching. The not knowing. You just want to be... still."
              style={{ fontSize: 32, lineHeight: 42, color: colors.text }}
              charDelay={40}
              delay={300}
              lastWordColor={colors.accent}
              lastWordPause={800}
              onLastWordStart={() => {
                // Pause starts — slow particles down as tension builds
                chaosSpeed.value = withTiming(0.15, { duration: 1000, easing: Easing.out(Easing.cubic) });
                // Freeze + haptic when "still." actually appears (after the pause + a beat)
                setTimeout(() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  chaosSpeed.value = withTiming(0.02, { duration: 400, easing: Easing.out(Easing.cubic) });
                }, 1800); // well after lastWordPause so "still." is fully visible when freeze hits
              }}
              onComplete={() => {
                setShowStillWord(true);
                setScreenReady(true);
              }}
            />

            {/* Tap anywhere — always rendered to reserve space, opacity controlled */}
            <View style={{ marginTop: Spacing['4'], opacity: screenReady ? 1 : 0 }}>
              <PulsingText
                text="Tap anywhere to continue"
                style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.textMuted }}
              />
            </View>
          </View>

        </TouchableOpacity>
      );
    }

    // Screen 3: Unfold intro — the answer. Particles rise. Gradient fades in.
    if (step.type === 'unfoldIntro') {
      return (
        <TouchableOpacity
          activeOpacity={1}
          disabled={!screenReady}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            advanceToNextStep();
          }}
          style={{ flex: 1, paddingHorizontal: Spacing['6'] }}
        >
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <TypewriterText
              text="That's why we built Unfold. God's word, written into your story — so every time you open it, you're already home."
              style={{ fontSize: 32, lineHeight: 42, color: colors.text }}
              charDelay={35}
              delay={400}
              highlightWord="Unfold"
              highlightColor={colors.accent}
              onComplete={() => setScreenReady(true)}
            />

            {/* Tap anywhere — always rendered to reserve space, opacity controlled */}
            <View style={{ marginTop: Spacing['4'], opacity: screenReady ? 1 : 0 }}>
              <PulsingText
                text="Tap anywhere to continue"
                style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.textMuted }}
              />
            </View>
          </View>

        </TouchableOpacity>
      );
    }

    // Screen 9: Shock stat — pure problem, sit in it
    if (step.type === 'shockStat') {
      return (
        <TouchableOpacity
          activeOpacity={1}
          disabled={!screenReady}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            advanceToNextStep();
          }}
          style={{ flex: 1 }}
        >
          <ShockStat
            colors={colors}
            onReady={() => setScreenReady(true)}
          />

          <View style={{ paddingBottom: Spacing['8'], paddingHorizontal: Spacing['6'], opacity: screenReady ? 1 : 0 }}>
            <PulsingText
              text="Tap anywhere to continue"
              style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.textMuted }}
            />
          </View>
        </TouchableOpacity>
      );
    }

    // Screen 10: Growth graph — the turn, hope arrives
    if (step.type === 'growthGraph') {
      const userName = data.name || existingUser?.name || '';
      return (
        <TouchableOpacity
          activeOpacity={1}
          disabled={!screenReady}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            advanceToNextStep();
          }}
          style={{ flex: 1, justifyContent: 'center', paddingHorizontal: Spacing['6'] }}
        >
          {/* Personal pivot — first time the app uses their name */}
          <Animated.Text
            entering={FadeIn.duration(800)}
            style={{
              fontFamily: FontFamily.display,
              fontSize: 28,
              color: colors.text,
              lineHeight: 36,
              marginBottom: Spacing['2'],
            }}
          >
            For you{userName ? `, ${userName}` : ''}, that changes today.
          </Animated.Text>

          <Animated.Text
            entering={FadeIn.delay(600).duration(600)}
            style={{
              fontFamily: FontFamily.body,
              fontSize: 16,
              color: colors.textMuted,
              lineHeight: 24,
              marginBottom: Spacing['8'],
            }}
          >
            Unfold writes devotionals around your life — every day more personal than the last.
          </Animated.Text>

          {/* Growth graph — draws after copy lands */}
          <Animated.View entering={FadeIn.delay(1400).duration(400)}>
            <GrowthGraph
              colors={colors}
              animationDelay={600}
              onDrawComplete={() => {
                setTimeout(() => setScreenReady(true), 1800);
              }}
            />
          </Animated.View>

          {/* Graph narration copy */}
          <Animated.Text
            entering={FadeIn.delay(3200).duration(600)}
            style={{
              fontFamily: FontFamily.bodyItalic,
              fontSize: 17,
              color: colors.text,
              lineHeight: 26,
              marginTop: Spacing['6'],
            }}
          >
            Day 1, it's good. Day 7, it knows your story. Day 30, it feels like it was written by someone who's been walking beside you the whole time.
          </Animated.Text>

          {/* Closer */}
          <Animated.Text
            entering={FadeIn.delay(3800).duration(600)}
            style={{
              fontFamily: FontFamily.body,
              fontSize: 14,
              color: colors.textMuted,
              lineHeight: 22,
              marginTop: Spacing['3'],
            }}
          >
            This is the first adaptive Bible app in the world. Unfold is the only one that grows with you.
          </Animated.Text>

          {/* Tap anywhere */}
          <Animated.View entering={FadeIn.delay(4400).duration(400)} style={{ marginTop: Spacing['8'] }}>
            <PulsingText
              text="Tap anywhere to continue"
              style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.textMuted }}
            />
          </Animated.View>
        </TouchableOpacity>
      );
    }

    if (baseStep?.type === 'themeType') {
      // Handle theme type selection
      if (themeSelectionMode === 'none') {
        const selectedMode = data.selectedMainOption;
        
        return (
          <View style={{ gap: Spacing['0'] }}>
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
                paddingVertical: Spacing['7'],
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                  <View style={{
                    width: 56, height: 56, borderRadius: Radius.lg,
                    backgroundColor: isDark ? 'rgba(200, 165, 92, 0.15)' : 'rgba(154, 123, 60, 0.1)',
                    justifyContent: 'center', alignItems: 'center',
                  }}>
                    <HeartIcon size={26} color={colors.accent} weight="light" />
                  </View>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.xl, color: colors.text, letterSpacing: -0.3 }}>A theme or topic</Text>
                    <Text style={{ fontFamily: FontFamily.body, fontSize: 15, color: colors.textMuted, marginTop: 8, lineHeight: 22 }}>
                      Trust, courage, joy, lament, discipline...
                    </Text>
                  </View>
                  <View style={{ marginTop: Spacing['3'] }}>
                    <Text style={{ fontFamily: FontFamily.mono, fontSize: FontSize.lg, color: colors.accent }}>→</Text>
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
                paddingVertical: Spacing['7'],
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                  <View style={{
                    width: 56, height: 56, borderRadius: Radius.lg,
                    backgroundColor: isDark ? 'rgba(200, 165, 92, 0.15)' : 'rgba(154, 123, 60, 0.1)',
                    justifyContent: 'center', alignItems: 'center',
                  }}>
                    <BookOpenIcon size={26} color={colors.accent} weight="light" />
                  </View>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.xl, color: colors.text, letterSpacing: -0.3 }}>A style of study</Text>
                    <Text style={{ fontFamily: FontFamily.body, fontSize: 15, color: colors.textMuted, marginTop: 8, lineHeight: 22 }}>
                      Book study, character study, psalms, parables...
                    </Text>
                  </View>
                  <View style={{ marginTop: Spacing['3'] }}>
                    <Text style={{ fontFamily: FontFamily.mono, fontSize: FontSize.lg, color: colors.accent }}>→</Text>
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
              <View style={{ paddingVertical: Spacing['7'] }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                  <View style={{
                    width: 56, height: 56, borderRadius: Radius.lg,
                    backgroundColor: isDark ? 'rgba(200, 165, 92, 0.15)' : 'rgba(154, 123, 60, 0.1)',
                    justifyContent: 'center', alignItems: 'center',
                  }}>
                    <MagicWandIcon size={26} color={colors.accent} weight="light" />
                  </View>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.xl, color: colors.text, letterSpacing: -0.3 }}>Just guide me</Text>
                    <Text style={{ fontFamily: FontFamily.body, fontSize: 15, color: colors.textMuted, marginTop: 8, lineHeight: 22 }}>
                      We'll craft something based on what you share
                    </Text>
                  </View>
                  <View style={{ marginTop: Spacing['3'] }}>
                    <Text style={{ fontFamily: FontFamily.mono, fontSize: FontSize.lg, color: colors.accent }}>→</Text>
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
            <View style={{ marginBottom: Spacing['4'] }}>
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
              <View style={{ paddingBottom: 200, gap: Spacing['6'] }}>
                {Object.entries(themeGroups).map(([groupName, themeIds]) => (
                  <View key={groupName} style={{ gap: Spacing['3'] }}>
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
                  paddingBottom: Spacing['2'],
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
              <View style={{ gap: Spacing['2.5'], paddingBottom: 200 }}>
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
                            paddingVertical: Spacing['4'],
                            borderRadius: Radius.md,
                            borderWidth: 1,
                            borderColor: isSelected ? colors.borderFocused : colors.border,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: Spacing['3'],
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
                    marginTop: Spacing['6'],
                    padding: Spacing['4'],
                    backgroundColor: colors.inputBackground,
                    borderRadius: Radius.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: 0.7,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <CrownIcon size={18} color={colors.textMuted} weight="light" />
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.sm, color: colors.textMuted }}>More study types coming soon</Text>
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
      const isCharacterStudy = data.selectedType === 'character_study';

      if (isCharacterStudy) {
        const otCharacters = BIBLICAL_CHARACTERS.filter(c => c.testament === 'ot');
        const ntCharacters = BIBLICAL_CHARACTERS.filter(c => c.testament === 'nt');

        const renderCharacterGrid = (characters: typeof BIBLICAL_CHARACTERS) => (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {characters.map((char) => {
              const isSelected = data.selectedStudySubject === char.name;
              return (
                <TouchableOpacity activeOpacity={0.7}
                  key={char.name}
                  style={{ width: '48%' }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setData((prev) => ({
                      ...prev,
                      selectedStudySubject: isSelected ? undefined : char.name,
                    }));
                  }}
                >
                  <View style={{
                    backgroundColor: isSelected ? colors.buttonBackgroundPressed : colors.inputBackground,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: Radius.md,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.borderFocused : colors.border,
                    minHeight: 72,
                  }}>
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.sm, color: colors.text }} numberOfLines={1}>{char.name}</Text>
                    <Text style={{ fontFamily: FontFamily.body, fontSize: 12, color: colors.textMuted, marginTop: 3, lineHeight: 16 }} numberOfLines={3}>{char.description}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        );

        return (
          <View style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} onScroll={handleListScroll} scrollEventThrottle={16}>
              <View style={{ gap: 10, paddingBottom: 200 }}>
                <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Old Testament</Text>
                {renderCharacterGrid(otCharacters)}

                <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 10, marginBottom: 2 }}>New Testament</Text>
                {renderCharacterGrid(ntCharacters)}
              </View>
            </ScrollView>
          </View>
        );
      }

      // Book study — keep original single-column layout
      const subjects = BIBLE_BOOKS_FOR_STUDY.map(book => ({
        id: book.name,
        name: book.name,
        description: book.description,
      }));

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
                          paddingVertical: Spacing['3.5'],
                          borderRadius: Radius.md,
                          borderWidth: 1,
                          borderColor: isSelected ? colors.borderFocused : colors.border,
                        }}>
                          <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.base, color: colors.text }}>{subject.name}</Text>
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
        <View style={{ marginTop: Spacing['2'] }}>
          <TextInput
            value={data.name}
            onChangeText={(text) => setData((prev) => ({ ...prev, name: text }))}
            placeholder={step.placeholder}
            placeholderTextColor={colors.textMuted}
            style={{
              fontFamily: FontFamily.body,
              fontSize: FontSize.lg,
              color: colors.text,
              paddingVertical: Spacing['4'],
              paddingHorizontal: Spacing['5'],
              backgroundColor: colors.inputBackground,
              borderRadius: Radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            autoFocus
            maxLength={INPUT_LIMITS.NAME.max}
            onSubmitEditing={canProceed() ? handleNext : undefined}
            returnKeyType="done"
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
              gap: Spacing['2'],
              marginBottom: Spacing['4'],
            }}>
              {chips.map((chip) => {
                const isChipSelected = currentChips.includes(chip);
                return (
                  <TouchableOpacity activeOpacity={1}
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
                      paddingHorizontal: Spacing['3.5'],
                      paddingVertical: Spacing['2'],
                      borderRadius: Radius.xl,
                      backgroundColor: isChipSelected ? alpha(colors.accent, 0.13) : colors.inputBackground,
                      borderWidth: 1,
                      borderColor: isChipSelected ? alpha(colors.accent, 0.40) : colors.border,
                    }}
                  >
                    <Text style={{
                      fontFamily: isChipSelected ? FontFamily.uiMedium : FontFamily.ui,
                      fontSize: FontSize.sm,
                      color: isChipSelected ? colors.text : colors.textMuted,
                    }}>
                      {chip}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Text input — primary for aboutMe, optional elaboration for discovery */}
          <View style={{
            flex: isDiscoveryStep ? undefined : 1,
            backgroundColor: colors.inputBackground,
            borderRadius: Radius.xl,
            borderWidth: 1,
            borderColor: colors.border,
            padding: Spacing['5'],
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
                textAlignVertical: 'top',
                paddingTop: 0,
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
              marginTop: Spacing['2.5'],
              opacity: 0.7,
            }}>
              The more you share, the more personal your devotional becomes.
            </Text>
          )}
        </View>
      );
    }

    // Multi-select pill steps (growthGoals, obstacles)
    if (step.type === 'multiSelect') {
      const pillOptions: { value: string; label: string }[] = (step as any).options ?? [];
      const maxCount: number | undefined = (step as any).maxCount;
      const selected: string[] = (data[step.id as keyof OnboardingData] as string[]) ?? [];

      const handleToggle = (value: string) => {
        setData((prev) => {
          const current = (prev[step.id as keyof OnboardingData] as string[]) ?? [];
          if (current.includes(value)) {
            return { ...prev, [step.id]: current.filter((v) => v !== value) };
          }
          if (maxCount && current.length >= maxCount) return prev;
          return { ...prev, [step.id]: [...current, value] };
        });
      };

      return (
        <View style={{ marginTop: Spacing['2'] }}>
          <MultiSelectPills
            options={pillOptions}
            selected={selected}
            onToggle={handleToggle}
            maxCount={maxCount}
            colors={colors}
            isDark={isDark}
          />
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
        <View style={{ gap: Spacing['3'], marginTop: Spacing['2'] }}>
          {options.map((option) => {
            const isSelected = data[step.id as keyof OnboardingData] === option.value;

            // Premium gating for duration and length options
            const isLockedOption = !isPremium && (
              (step.id === 'readingDuration' && !isReadingDurationFree(option.value as number)) ||
              (step.id === 'devotionalLength' && !isDevotionalLengthFree(option.value as number))
            );

            return (
              <TouchableOpacity activeOpacity={0.7}
                key={option.value}
                onPress={() => {
                  if (isLockedOption) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    setPremiumGateFeature(step.id === 'readingDuration' ? 'readingDuration' : 'devotionalLength');
                    return;
                  }
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
                accessibilityLabel={isLockedOption ? `${option.label}, premium only` : option.label}
              >
                    <View style={{
                      backgroundColor: colors.inputBackground,
                      paddingHorizontal: Spacing['5'],
                      paddingVertical: 18,
                      borderRadius: Radius.lg,
                      borderWidth: 1,
                      borderColor: isLockedOption ? `${colors.border}80` : colors.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      opacity: isLockedOption ? 0.6 : 1,
                    }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.base, color: colors.text }}>{option.label}</Text>
                        {'description' in option && option.description && (
                          <Text style={{ fontFamily: FontFamily.body, fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{option.description}</Text>
                        )}
                      </View>
                      {isLockedOption && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                          <LockIcon size={14} color={colors.accent} weight="light" />
                          <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 11, color: colors.accent }}>Premium</Text>
                        </View>
                      )}
                    </View>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    // Mirror-back step: AI-generated poetic reflection with scripture + floating embers
    if (step.type === 'mirrorBack') {
      const displayContent = aiMirrorBack || mirrorBackContent;

      // Loading state while AI generates
      if (isLoadingMirrorBack && !aiMirrorBack) {
        return (
          <View style={{ minHeight: 380, position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
            <EmberParticles color={colors.accent} count={10} />
            <View style={{ alignItems: 'center', gap: Spacing['4'] }}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={{ fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textMuted }}>
                Crafting something for you...
              </Text>
            </View>
          </View>
        );
      }

      return (
        <View style={{ minHeight: 380, position: 'relative' }}>
          {/* Floating ember particles */}
          <EmberParticles color={colors.accent} count={10} />

          <View style={{ gap: Spacing['8'] }}>
            {/* Opening reflection */}
            <Animated.View entering={FadeIn.duration(800).delay(200)}>
              <Text style={{
                fontFamily: FontFamily.body,
                fontSize: FontSize.lg,
                color: colors.text,
                lineHeight: 30,
              }}>
                {displayContent.reflection}
              </Text>
            </Animated.View>

            {/* Scripture verse */}
            <Animated.View
              entering={FadeIn.duration(800).delay(700)}
              style={{
                paddingLeft: Spacing['4'],
                borderLeftWidth: 2,
                borderLeftColor: alpha(colors.accent, 0.3),
              }}
            >
              <Text style={{
                fontFamily: FontFamily.bodyItalic,
                fontSize: FontSize.lg,
                color: alpha(colors.text, 0.85),
                lineHeight: 30,
              }}>
                "{displayContent.verse}"
              </Text>
              <Text style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.sm,
                color: colors.accent,
                marginTop: Spacing['2'],
              }}>
                — {displayContent.verseRef}
              </Text>
            </Animated.View>

            {/* Anticipation */}
            <Animated.View entering={FadeIn.duration(800).delay(1200)}>
              <Text style={{
                fontFamily: FontFamily.body,
                fontSize: FontSize.base,
                color: colors.textMuted,
                lineHeight: 24,
              }}>
                {displayContent.anticipation}
              </Text>
            </Animated.View>
          </View>

          {/* Confirmation prompt */}
          <Animated.View entering={FadeIn.duration(600).delay(1400)}>
            <Text style={{
              fontFamily: FontFamily.bodyItalic,
              fontSize: FontSize.sm,
              color: colors.textSubtle,
              lineHeight: 20,
              marginTop: Spacing['8'],
            }}>
              Does this feel like where you are right now?
            </Text>
          </Animated.View>

          {/* CTA buttons */}
          <Animated.View entering={FadeIn.duration(600).delay(1600)} style={{ marginTop: Spacing['4'], gap: Spacing['3'] }}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setData((prev) => ({ ...prev, mirrorBackCommitted: true }));
                // Advance immediately — the feature summary is a full-screen step
                // that replaces the entire view, so no need for input fade-out
                advanceToNextStep();
              }}
            >
              <View style={{
                backgroundColor: colors.accent,
                paddingVertical: 18,
                paddingHorizontal: Spacing['6'],
                borderRadius: Radius.lg,
                alignItems: 'center',
                shadowColor: colors.accent,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.4,
                shadowRadius: 16,
                elevation: 8,
              }}>
                <Text style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: FontSize.base,
                  color: '#FFFFFF',
                }}>
                  Yes, this feels right
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleBack();
              }}
            >
              <View style={{
                paddingVertical: 14,
                paddingHorizontal: Spacing['6'],
                borderRadius: Radius.lg,
                alignItems: 'center',
              }}>
                <Text style={{
                  fontFamily: FontFamily.ui,
                  fontSize: FontSize.sm,
                  color: colors.textMuted,
                }}>
                  Let me adjust something
                </Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>
      );
    }

    // Vulnerability validation: the exhale — acknowledge courage with scripture
    if (step.type === 'vulnerabilityValidation') {
      return (
        <VulnerabilityValidation
          name={data.name}
          relationshipWithGod={data.relationshipWithGod}
          colors={colors}
          onContinue={advanceToNextStep}
        />
      );
    }

    // Feature summary: how-it-works carousel with companion naming
    if (step.type === 'featureSummary') {
      return (
        <FeatureSummaryCarousel
          colors={colors}
          isDark={isDark}
          companionName={companionNameInput}
          onCompanionNameChange={setCompanionNameInput}
          onComplete={advanceToNextStep}
        />
      );
    }

    // Devotional segue: build anticipation before the reveal
    if (step.type === 'devotionalSegue') {
      return (
        <DevotionalSegue
          name={data.name}
          colors={colors}
          jobId={onboardingJobIdRef.current}
          submitFallback={!onboardingJobIdRef.current ? async () => {
            const { jobId } = await submitGenerationJob({
              jobType: 'onboarding',
              dayNumber: 1,
              userContext: {
                name: data.name || existingUser?.name || '',
                aboutMe: data.aboutMe || existingUser?.aboutMe || '',
                situation: '',
                emotion: '',
                faith: '',
                seeking: data.aspiration || data.spiritualSeeking || '',
                themeCategory: '',
                devotionalType: '',
                readingDuration: 5,
                bibleTranslation: existingUser?.bibleTranslation || 'BSB',
                relationshipWithGod: data.relationshipWithGod || 'ups-and-downs',
                growthGoals: data.growthGoals || [],
                obstacles: data.obstacles || [],
              },
            });
            onboardingJobIdRef.current = jobId;
            return jobId;
          } : undefined}
          onDevotionalReady={(result) => {
            onboardingDevotionalResultRef.current = result;
            if (result?.devotionalDay) {
              setOnboardingDevotionalDay(result.devotionalDay);
              setOnboardingDevotionalId(result.devotionalId || `onboarding-${Date.now()}`);
            }
          }}
          onContinue={advanceToNextStep}
        />
      );
    }

    // Read devotional: the first reading experience
    if (step.type === 'readDevotional') {
      return (
        <ReadDevotionalStep
          devotionalDay={onboardingDevotionalDay}
          devotionalId={onboardingDevotionalId}
          colors={colors}
          onComplete={advanceToNextStep}
        />
      );
    }

    // Celebration after first devotional
    if (step.type === 'celebration') {
      return (
        <OnboardingCelebration
          colors={colors}
          onContinue={advanceToNextStep}
        />
      );
    }

    // Commitment 1 — choose commitment level
    if (step.type === 'commitment1') {
      return (
        <CommitmentStep
          step="choose"
          colors={colors}
          onSelect={(level) => {
            setCommitmentLevel(level);
            setTimeout(() => advanceToNextStep(), 300);
          }}
          onContinue={advanceToNextStep}
        />
      );
    }

    // Commitment 2 — personalized affirmation
    if (step.type === 'commitment2') {
      return (
        <CommitmentStep
          step="affirm"
          commitmentLevel={commitmentLevel}
          colors={colors}
          onSelect={() => {}}
          onContinue={advanceToNextStep}
        />
      );
    }

    // Founder's note step: a personal letter from Nick
    if (step.type === 'founderNote') {
      return (
        <View style={{ flex: 1, justifyContent: 'space-between', paddingHorizontal: Spacing['1'] }}>
          <View>
            {/* Gold accent line */}
            <Animated.View
              entering={FadeIn.delay(200).duration(600)}
              style={{
                width: 40,
                height: 1.5,
                backgroundColor: colors.accent,
                opacity: 0.4,
                marginBottom: Spacing['5'],
                borderRadius: 1,
              }}
            />

            {/* The note */}
            <View style={{ gap: Spacing['4'] }}>
              <Animated.Text
                entering={FadeIn.delay(400).duration(700)}
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: 17,
                  color: colors.text,
                  lineHeight: 30,
                }}
              >
                I built Unfold because I needed it. I craved something deeper than a daily verse notification — something that actually knew where I was and met me there.
              </Animated.Text>

              <Animated.Text
                entering={FadeIn.delay(700).duration(700)}
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
                entering={FadeIn.delay(1000).duration(700)}
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: 17,
                  color: colors.textMuted,
                  lineHeight: 30,
                }}
              >
                I'm dedicating myself to making Unfold that space. Thank you for trusting me with yours.
              </Animated.Text>
            </View>

            {/* Signature */}
            <Animated.View
              entering={FadeIn.delay(1400).duration(800)}
              style={{ marginTop: Spacing['5'] }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.displayItalic,
                  fontSize: 30,
                  color: colors.text,
                }}
              >
                Nick
              </Text>
              <View
                style={{
                  width: 48,
                  height: 1.5,
                  backgroundColor: colors.accent,
                  opacity: 0.5,
                  marginTop: Spacing['1.5'],
                  borderRadius: 1,
                }}
              />
            </Animated.View>
          </View>

          {/* Bottom Continue button */}
          <Animated.View entering={FadeIn.delay(1800).duration(600)} style={{ paddingTop: Spacing['6'], paddingBottom: Spacing['4'] }}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleNext}
              style={{
                backgroundColor: colors.accent,
                paddingVertical: Spacing['4'],
                borderRadius: Radius.md,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.base, color: colors.background, letterSpacing: 0.3 }}>
                Continue
              </Text>
            </TouchableOpacity>
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
        <View style={{ gap: Spacing['8'] }}>
          {/* Faith Background */}
          <View style={{ gap: Spacing['3'] }}>
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
              Faith
            </Text>
            <View style={{ gap: Spacing['2'] }}>
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
                      paddingVertical: Spacing['4'], paddingHorizontal: 18, borderRadius: Radius.card,
                      backgroundColor: isSelected ? colors.buttonBackgroundPressed : colors.inputBackground,
                      borderWidth: 1.5, borderColor: isSelected ? colors.accent : colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.base, color: colors.text }}>{opt.label}</Text>
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
          <View style={{ gap: Spacing['3'] }}>
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
              Season of life
            </Text>
            <View style={{ gap: Spacing['2'] }}>
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
                      paddingVertical: Spacing['4'], paddingHorizontal: 18, borderRadius: Radius.card,
                      backgroundColor: isSelected ? colors.buttonBackgroundPressed : colors.inputBackground,
                      borderWidth: 1.5, borderColor: isSelected ? colors.accent : colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.base, color: colors.text }}>{opt.label}</Text>
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
        <View style={{ gap: Spacing['8'] }}>
          {/* Tone */}
          <View style={{ gap: Spacing['3'] }}>
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
              Voice
            </Text>
            <View style={{ gap: Spacing['2'] }}>
              {toneOptions.map((opt) => {
                const isSelected = data.tone === opt.value;
                return (
                  <TouchableOpacity key={opt.value} activeOpacity={0.7}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setData((prev) => ({ ...prev, tone: opt.value }));
                    }}
                    style={{
                      paddingVertical: Spacing['4'], paddingHorizontal: 18, borderRadius: Radius.card,
                      backgroundColor: isSelected ? colors.buttonBackgroundPressed : colors.inputBackground,
                      borderWidth: 1.5, borderColor: isSelected ? colors.accent : colors.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, marginRight: Spacing['3'] }}>
                        <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.base, color: colors.text }}>{opt.label}</Text>
                        <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{opt.description}</Text>
                        <Text style={{ fontFamily: FontFamily.bodyItalic, fontSize: FontSize.xs, color: colors.textSubtle, marginTop: 6 }}>{opt.example}</Text>
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
          <View style={{ gap: Spacing['3'] }}>
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
              Depth
            </Text>
            <View style={{ gap: Spacing['2'] }}>
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
                      paddingVertical: Spacing['4'], paddingHorizontal: 18, borderRadius: Radius.card,
                      backgroundColor: isSelected ? colors.buttonBackgroundPressed : colors.inputBackground,
                      borderWidth: 1.5, borderColor: isSelected ? colors.accent : colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.base, color: colors.text }}>{opt.label}</Text>
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

    // Companion step: orb + naming input on a single screen
    if (step.type === 'companionNaming') {
      return (
        <View style={{ alignItems: 'center', gap: Spacing['4'], marginTop: Spacing['2'] }}>
          <Animated.View
            entering={FadeIn.delay(200).duration(600)}
          >
            <CompanionOrb accentColor={colors.accent} size={80} isActive showBadge={false} />
          </Animated.View>
          <Animated.View
            entering={FadeIn.delay(350).duration(500)}
            style={{ width: '100%', paddingHorizontal: Spacing['1'] }}
          >
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.xs, color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: Spacing['2'], marginLeft: Spacing['1'] }}>
              Companion name
            </Text>
            <TextInput
              value={companionNameInput}
              onChangeText={setCompanionNameInput}
              placeholder="e.g. Grace, Selah, Guide"
              placeholderTextColor={colors.textMuted}
              style={{
                fontFamily: FontFamily.body,
                fontSize: FontSize.lg,
                color: colors.text,
                height: 54,
                paddingHorizontal: Spacing['5'],
                backgroundColor: colors.inputBackground,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
              }}
              maxLength={30}
            />
          </Animated.View>
          <Animated.Text
            entering={FadeIn.delay(500).duration(500)}
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.sm,
              color: colors.textSubtle,
              textAlign: 'center',
              paddingHorizontal: Spacing['5'],
            }}
          >
            You can always change this later.
          </Animated.Text>
        </View>
      );
    }

    // Three-step paywall: final premium pitch before generating
    if (step.type === 'threeStepPaywall') {
      const monthlyPkg = rcOfferings?.current?.availablePackages.find(
        (pkg) => pkg.identifier === '$rc_monthly'
      );
      const mPrice = monthlyPkg?.product.priceString ?? '$9.99';
      const mRaw = monthlyPkg?.product.price ?? 9.99;
      const yRaw = yearlyPackage?.product.price ?? 59.99;
      const tDays = (() => {
        const intro = yearlyPackage?.product.introPrice;
        if (!intro || intro.price !== 0) return 7;
        const unit = intro.periodUnit.toLowerCase();
        if (unit === 'day') return intro.periodNumberOfUnits;
        if (unit === 'week') return intro.periodNumberOfUnits * 7;
        return 7;
      })();

      return (
        <ThreeStepPaywall
          colors={colors}
          isDark={isDark}
          yearlyPackage={yearlyPackage}
          monthlyPackage={monthlyPkg}
          yearlyPrice={yearlyPrice}
          monthlyPrice={mPrice}
          yearlyRaw={yRaw}
          monthlyRaw={mRaw}
          trialDuration={yearlyTrialDuration}
          trialDays={tDays}
          hasFreeTrial={yearlyHasFreeTrial}
          onPurchaseSuccess={() => {
            setPurchasedDuringOnboarding(true);
            updateUser({ isPremium: true });
            advanceToNextStep();
          }}
          onSkip={advanceToNextStep}
        />
      );
    }

    return null;
  };

  // Loading state during discovery preparation
  if (isPreparingDiscovery) {
    return (
      <View style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' }}>
        <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], marginBottom: Spacing['4'] }}>
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
        <Text style={{ fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textMuted }}>Loading next question…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      {/* Currents — one continuous particle layer across intro screens */}
      {(currentStepId === 'hook' || currentStepId === 'solution' || currentStepId === 'unfoldIntro' || currentStepId === 'shockStat' || currentStepId === 'growthGraph') && (
        <Current type="chaos" color={colors.accent} speed={chaosSpeed} drift={chaosDrift} />
      )}

      {/* Accent gradient — fades in on Screen 3 (unfoldIntro) */}
      {currentStepId === 'unfoldIntro' && (
        <Animated.View entering={FadeIn.duration(1500)} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1 }} pointerEvents="none">
          <LinearGradient
            colors={['transparent', `${colors.accent}20`, `${colors.accent}40`]}
            style={{ height: 350 }}
          />
        </Animated.View>
      )}
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
            ) : existingUser?.hasCompletedOnboarding ? (
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => router.back()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
                accessibilityLabel="Close"
                accessibilityRole="button"
              >
                <XIcon size={24} color={colors.textMuted} weight="light" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40, height: 40 }} />
            )}
            
            {/* Continue button - hide for self-navigating steps */}
            {canProceed() && step.type !== 'hook' && step.type !== 'solution' && step.type !== 'unfoldIntro' && step.type !== 'shockStat' && step.type !== 'growthGraph' && step.type !== 'choice' && step.type !== 'timeChoice' && step.type !== 'mirrorBack' && step.type !== 'featureSummary' && step.type !== 'devotionalSegue' && step.type !== 'readDevotional' && step.type !== 'threeStepPaywall' && step.type !== 'founderNote' && step.type !== 'vulnerabilityValidation' && step.type !== 'celebration' && step.type !== 'commitment1' && step.type !== 'commitment2' ? (
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleNext}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ height: 40, justifyContent: 'center', paddingHorizontal: 8 }}
              >
                <Text style={{ 
                  fontFamily: FontFamily.uiMedium, 
                  fontSize: FontSize.sm, 
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
            {/* Full-screen steps that bypass the TypewriterText + showInput layout */}
            {step?.type === 'hook' || step?.type === 'solution' || step?.type === 'unfoldIntro' || step?.type === 'shockStat' || step?.type === 'growthGraph' || step?.type === 'vulnerabilityValidation' || step?.type === 'featureSummary' || step?.type === 'devotionalSegue' || step?.type === 'readDevotional' || step?.type === 'celebration' || step?.type === 'commitment1' || step?.type === 'commitment2' || step?.type === 'threeStepPaywall' ? (
              <View style={{ flex: 1 }}>
                {renderInput()}
              </View>
            ) : (baseStep?.type === 'themeType' && themeSelectionMode !== 'none') || baseStep?.type === 'studySubject' ? (
              <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bottomOffset={60}>
                <View style={{ flex: 1, paddingHorizontal: Spacing['6'], paddingTop: Spacing['10'] }}>
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
                      style={{ fontSize: 32, lineHeight: 40, color: colors.text }}
                    />
                  </View>
                  {showInput && (
                    <Animated.View entering={FadeIn.duration(Duration.slow)} style={{ marginTop: Spacing['3'], marginBottom: Spacing['6'] }}>
                      <Text style={{ fontFamily: FontFamily.body, fontSize: FontSize.lg, color: colors.textMuted, lineHeight: 26 }}>
                        {baseStep?.type === 'themeType' && themeSelectionMode === 'theme'
                          ? "Select up to 3 themes that resonate with where you are."
                          : baseStep?.type === 'themeType' && themeSelectionMode === 'type'
                          ? "Choose a study style for your series."
                          : getStepSubtext()}
                      </Text>
                    </Animated.View>
                  )}
                  {showInput && <Animated.View style={[inputAnimatedStyle, { flex: 1 }]}>{renderInput()}</Animated.View>}
                </View>
              </KeyboardAwareScrollView>
            ) : (
              <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bottomOffset={100}>
                <View style={{ flex: 1, paddingHorizontal: Spacing['6'], paddingTop: Spacing['10'], paddingBottom: 120 }}>
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
                        style={{ fontSize: 32, lineHeight: 40, color: colors.text }}
                      />
                    )}
                  </View>
                  {showInput && (
                    <Animated.View entering={FadeIn.duration(Duration.slow)} style={{ marginTop: Spacing['3'], marginBottom: Spacing['8'] }}>
                      <Text style={{ fontFamily: FontFamily.body, fontSize: FontSize.lg, color: colors.textMuted, lineHeight: 26 }}>{getStepSubtext()}</Text>
                    </Animated.View>
                  )}
                  {showInput && <Animated.View style={inputAnimatedStyle}>{renderInput()}</Animated.View>}
                </View>
              </KeyboardAwareScrollView>
            )}
          </View>
        </View>
      </SafeAreaView>

      {/* Premium upsell sheet for gated onboarding options */}
      <PremiumFeatureSheet
        visible={!!premiumGateFeature}
        onClose={() => setPremiumGateFeature(null)}
        feature={premiumGateFeature ?? 'general'}
      />

      {/* DEV: Floating step picker — jump to any onboarding screen */}
      {__DEV__ && (
        <>
          <TouchableOpacity
            onPress={() => setDevStepPickerVisible(!devStepPickerVisible)}
            style={{
              position: 'absolute',
              bottom: 50,
              right: 16,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(200, 165, 92, 0.3)',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 999,
            }}
          >
            <Text style={{ fontSize: 14, color: colors.accent }}>⚙</Text>
          </TouchableOpacity>

          {devStepPickerVisible && (
            <View
              style={{
                position: 'absolute',
                bottom: 95,
                right: 16,
                width: 220,
                maxHeight: 400,
                backgroundColor: 'rgba(20, 18, 16, 0.95)',
                borderRadius: Radius.md,
                borderWidth: 1,
                borderColor: 'rgba(200, 165, 92, 0.2)',
                zIndex: 999,
                overflow: 'hidden',
              }}
            >
              <TouchableOpacity
                onPress={() => setDevShowAllSteps(!devShowAllSteps)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(200, 165, 92, 0.15)',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: FontFamily.ui, fontSize: 11, color: colors.accent }}>
                  Show all steps
                </Text>
                <Text style={{ fontSize: 11, color: devShowAllSteps ? colors.accent : colors.textHint }}>
                  {devShowAllSteps ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                {ALL_STEPS.map((s) => {
                  const isFiltered = !STEPS.find((fs) => fs.id === s.id);
                  return (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => {
                      setCurrentStepId(s.id as StepId);
                      setShowInput(false);
                      setScreenReady(false);
                      setDevStepPickerVisible(false);
                    }}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      backgroundColor: currentStepId === s.id ? 'rgba(200, 165, 92, 0.15)' : 'transparent',
                      opacity: isFiltered && !devShowAllSteps ? 0.35 : 1,
                    }}
                  >
                    <Text style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 12,
                      color: currentStepId === s.id ? colors.accent : isFiltered ? colors.textHint : colors.textMuted,
                    }}>
                      {s.id}{isFiltered ? ' (skipped)' : ''}
                    </Text>
                  </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const obStyles = StyleSheet.create({
  themePillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing['2.5'],
    paddingHorizontal: Spacing['4'],
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    gap: Spacing['2'],
  },
  themePillText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
  selectionOrderBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing['1'],
  },
  selectionOrderText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
  },
});
