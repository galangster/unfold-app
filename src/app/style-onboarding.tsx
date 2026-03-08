import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, CaretRightIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { TypewriterText } from '@/components/TypewriterText';
import { useUnfoldStore, WritingTone, ContentDepth, FaithBackground, LifeStage } from '@/lib/store';

interface StyleQuestion {
  id: string;
  question: string;
  subtext: string;
  options: {
    value: string;
    label: string;
    description: string;
    example?: string;
  }[];
}

const STYLE_QUESTIONS: StyleQuestion[] = [
  {
    id: 'faithBackground',
    question: "Where are you in your faith journey?",
    subtext: "This helps us meet you where you are.",
    options: [
      {
        value: 'new',
        label: "I'm exploring",
        description: "New to faith or rediscovering it",
        example: "We'll explain concepts gently and avoid assumptions",
      },
      {
        value: 'growing',
        label: "I'm growing",
        description: "Familiar with faith, deepening my understanding",
        example: "A balance of foundation and fresh insight",
      },
      {
        value: 'mature',
        label: "I'm grounded",
        description: "Well-versed and seeking deeper study",
        example: "Rich theological depth and challenging reflections",
      },
    ],
  },
  {
    id: 'lifeStage',
    question: "What season of life are you in?",
    subtext: "So we can speak your language.",
    options: [
      { value: 'student', label: "I'm a student", description: "Figuring things out and finding my footing" },
      { value: 'building', label: "I'm building my life", description: "Career, relationships, and big decisions" },
      { value: 'midlife', label: "I'm in the thick of it", description: "Family, work, and a thousand responsibilities" },
      { value: 'reflective', label: "I'm in a reflective season", description: "Looking back, looking forward, finding meaning" },
    ],
  },
  {
    id: 'tone',
    question: "How do you like to be spoken to?",
    subtext: "The voice that resonates with your soul.",
    options: [
      {
        value: 'warm',
        label: "Like a friend",
        description: "Gentle, encouraging, and personal",
        example: '"You\'re not alone in this feeling..."',
      },
      {
        value: 'direct',
        label: "Straight to the point",
        description: "Clear, practical, and actionable",
        example: '"Here\'s what this means for today..."',
      },
      {
        value: 'poetic',
        label: "With beauty",
        description: "Lyrical, contemplative, and evocative",
        example: '"In the quiet spaces between breaths..."',
      },
    ],
  },
  {
    id: 'depth',
    question: "How deep do you want to go?",
    subtext: "The level of detail that serves you best.",
    options: [
      {
        value: 'simple',
        label: "Keep it simple",
        description: "Clear truth without complexity",
        example: "One key idea to carry with you",
      },
      {
        value: 'balanced',
        label: "A good balance",
        description: "Substance with accessibility",
        example: "Context and application woven together",
      },
      {
        value: 'theological',
        label: "Take me deeper",
        description: "Rich study with historical context",
        example: "Word origins, cross-references, and scholarly insight",
      },
    ],
  },
];

export default function StyleOnboardingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useUnfoldStore((s) => s.user);
  const setUser = useUnfoldStore((s) => s.setUser);
  const updateUser = useUnfoldStore((s) => s.updateUser);

  const [currentStep, setCurrentStep] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [selections, setSelections] = useState<{
    tone: WritingTone;
    depth: ContentDepth;
    faithBackground: FaithBackground;
    lifeStage: LifeStage;
  }>({
    tone: 'warm',
    depth: 'balanced',
    faithBackground: 'growing',
    lifeStage: 'building',
  });

  const currentQuestion = STYLE_QUESTIONS[currentStep];
  const isLastStep = currentStep === STYLE_QUESTIONS.length - 1;

  const optionsOpacity = useSharedValue(0);

  useEffect(() => {
    setShowOptions(false);
    optionsOpacity.value = withTiming(0, { duration: 0 });
  }, [currentStep]);

  const handleTypewriterComplete = () => {
    setTimeout(() => {
      setShowOptions(true);
      optionsOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) });
    }, 300);
  };

  const optionsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: optionsOpacity.value,
  }));

  const handleSelect = (value: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const key = currentQuestion.id as keyof typeof selections;
    setSelections((prev) => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (isLastStep) {
      // Save preferences and continue
      if (user) {
        updateUser({
          hasCompletedStyleOnboarding: true,
          writingStyle: selections,
        });
      } else {
        // Create minimal user with style preferences
        setUser({
          name: '',
          aboutMe: '',
          personaTraits: [],
          currentSituation: '',
          emotionalState: '',
          spiritualSeeking: '',
          readingDuration: 15,
          devotionalLength: 7,
          reminderTime: '8:00 AM',
          hasCompletedOnboarding: false,
          hasCompletedStyleOnboarding: true,
          isPremium: false,
          fontSize: 'medium',
          writingStyle: selections,
          bibleTranslation: 'WEB',
          themeMode: 'dark',
          accentTheme: 'gold',
          readingFont: 'source-serif',
          preferredVoice: '694f9389-aac1-45b6-b726-9d9369183238', // Katie - free voice
        });
      }
      router.replace('/onboarding');
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    } else {
      router.back();
    }
  };

  const currentValue = selections[currentQuestion.id as keyof typeof selections];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
          {currentStep > 0 ? (
            <Pressable
              onPress={handleBack}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ padding: 8 }}
            >
              <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}

          {/* Progress dots */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {STYLE_QUESTIONS.map((_, index) => (
              <View
                key={index}
                style={{
                  width: index === currentStep ? 24 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: index <= currentStep ? colors.accent : colors.border,
                }}
              />
            ))}
          </View>

          {/* Continue / Next button — top right */}
          {showOptions ? (
            <Pressable
              onPress={handleNext}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ padding: 8 }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 16,
                  color: colors.text,
                }}
              >
                Continue
              </Text>
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Content */}
        <ScrollView
          style={{ flex: 1, paddingHorizontal: 24 }}
          contentContainerStyle={{ paddingTop: 40, paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Question with typewriter */}
          <View key={currentStep}>
            <TypewriterText
              text={currentQuestion.question}
              onComplete={handleTypewriterComplete}
              style={{
                fontSize: 28,
                lineHeight: 38,
              }}
            />
          </View>

          {/* Subtext */}
          {showOptions && (
            <Animated.View
              entering={FadeIn.duration(300)}
              style={{ marginTop: 12, marginBottom: 32 }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: 16,
                  color: colors.textMuted,
                  lineHeight: 24,
                }}
              >
                {currentQuestion.subtext}
              </Text>
            </Animated.View>
          )}

          {/* Options */}
          {showOptions && (
            <Animated.View style={optionsAnimatedStyle}>
              <View style={{ gap: 12 }}>
                {currentQuestion.options.map((option, index) => {
                  const isSelected = currentValue === option.value;

                  return (
                    <Animated.View
                      key={option.value}
                      entering={FadeIn.duration(300).delay(index * 100)}
                    >
                      <Pressable
                        onPress={() => handleSelect(option.value)}
                        style={({ pressed }) => ({
                          backgroundColor: isSelected
                            ? colors.buttonBackgroundPressed
                            : pressed
                              ? colors.inputBackground
                              : colors.inputBackground,
                          paddingHorizontal: 20,
                          paddingVertical: 20,
                          borderRadius: 16,
                          borderWidth: 1.5,
                          borderColor: isSelected ? colors.accent : colors.border,
                        })}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                          <View style={{ flex: 1, marginRight: 16 }}>
                            <Text
                              style={{
                                fontFamily: FontFamily.uiMedium,
                                fontSize: 17,
                                color: colors.text,
                                marginBottom: 4,
                              }}
                            >
                              {option.label}
                            </Text>
                            <Text
                              style={{
                                fontFamily: FontFamily.ui,
                                fontSize: 14,
                                color: colors.textMuted,
                                lineHeight: 20,
                              }}
                            >
                              {option.description}
                            </Text>
                            {option.example && (
                              <Text
                                style={{
                                  fontFamily: FontFamily.bodyItalic,
                                  fontSize: 13,
                                  color: colors.textSubtle,
                                  marginTop: 8,
                                  lineHeight: 18,
                                }}
                              >
                                {option.example}
                              </Text>
                            )}
                          </View>

                          {/* Selection indicator */}
                          <View
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              borderWidth: 2,
                              borderColor: isSelected ? colors.accent : colors.border,
                              backgroundColor: isSelected ? colors.accent : 'transparent',
                              justifyContent: 'center',
                              alignItems: 'center',
                              marginTop: 2,
                            }}
                          >
                            {isSelected && (
                              <View
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 4,
                                  backgroundColor: colors.background,
                                }}
                              />
                            )}
                          </View>
                        </View>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
