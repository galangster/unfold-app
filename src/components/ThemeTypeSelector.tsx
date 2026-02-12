import { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  Hand,
  Fingerprint,
  Moon,
  Compass,
  Heart,
  Sparkles,
  Wind,
  Mountain,
  Sun,
  Eye,
  User,
  BookOpen,
  Users,
  Music,
  Crown,
  Leaf,
  MessageCircle,
  Flame,
  Calendar,
  Wheat,
  ChevronRight,
} from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import {
  THEME_CATEGORIES,
  DEVOTIONAL_TYPES,
  ThemeCategory,
  DevotionalType,
  ThemeCategoryInfo,
  DevotionalTypeInfo,
  getCompatibleTypes,
  BIBLICAL_CHARACTERS,
  BIBLE_BOOKS_FOR_STUDY,
} from '@/constants/devotional-types';

// Icon mapping
const THEME_ICONS: Record<string, React.FC<{ size: number; color: string }>> = {
  Hand,
  Fingerprint,
  Moon,
  Compass,
  Heart,
  Sparkles,
  Wind,
  Mountain,
  Sun,
  Eye,
};

const TYPE_ICONS: Record<string, React.FC<{ size: number; color: string }>> = {
  User,
  BookOpen,
  Users,
  Music,
  Crown,
  Leaf,
  MessageCircle,
  Flame,
  Calendar,
  Wheat,
};

interface ThemeTypeSelectorProps {
  selectedTheme?: ThemeCategory;
  selectedType?: DevotionalType;
  selectedSubject?: string;
  onThemeSelect: (theme: ThemeCategory | undefined) => void;
  onTypeSelect: (type: DevotionalType | undefined) => void;
  onSubjectSelect: (subject: string | undefined) => void;
  devotionalLength: number;
}

export function ThemeTypeSelector({
  selectedTheme,
  selectedType,
  selectedSubject,
  onThemeSelect,
  onTypeSelect,
  onSubjectSelect,
  devotionalLength,
}: ThemeTypeSelectorProps) {
  const { colors } = useTheme();
  const [step, setStep] = useState<'theme' | 'type' | 'subject'>('theme');

  // Filter types that work with selected theme and length
  const compatibleTypes = selectedTheme
    ? getCompatibleTypes(selectedTheme).filter(t => t.minDays <= devotionalLength)
    : DEVOTIONAL_TYPES.filter(t => t.minDays <= devotionalLength);

  // Get subjects based on selected type
  const getSubjects = (): { name: string; description: string }[] => {
    if (selectedType === 'book_study') {
      return BIBLE_BOOKS_FOR_STUDY
        .filter(b => !selectedTheme || b.themes.includes(selectedTheme))
        .filter(b => b.idealLength <= devotionalLength)
        .map(b => ({ name: b.name, description: b.description }));
    }
    if (selectedType === 'character_study') {
      return BIBLICAL_CHARACTERS
        .filter(c => !selectedTheme || c.themes.some(t => t === selectedTheme))
        .map(c => ({ name: c.name, description: c.description }));
    }
    return [];
  };

  const subjects = getSubjects();
  const needsSubject = selectedType === 'book_study' || selectedType === 'character_study';

  const handleThemeSelect = (theme: ThemeCategory) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedTheme === theme) {
      onThemeSelect(undefined);
    } else {
      onThemeSelect(theme);
      // Auto-advance to type selection
      setTimeout(() => setStep('type'), 300);
    }
  };

  const handleTypeSelect = (type: DevotionalType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTypeSelect(type);
    // If type needs a subject, advance to subject selection
    if (type === 'book_study' || type === 'character_study') {
      setTimeout(() => setStep('subject'), 300);
    }
  };

  const handleSubjectSelect = (subject: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSubjectSelect(subject);
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 'subject') {
      setStep('type');
      onSubjectSelect(undefined);
    } else if (step === 'type') {
      setStep('theme');
      onTypeSelect(undefined);
    }
  };

  const handleSkipTheme = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onThemeSelect(undefined);
    setStep('type');
  };

  // Render theme selection
  if (step === 'theme') {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <Text
          style={{
            fontFamily: FontFamily.body,
            fontSize: 14,
            color: colors.textMuted,
            marginBottom: 20,
            lineHeight: 20,
          }}
        >
          Choose a theme to focus your journey, or skip to let us choose based on what you shared.
        </Text>

        {THEME_CATEGORIES.map((theme, index) => {
          const IconComponent = THEME_ICONS[theme.icon];
          const isSelected = selectedTheme === theme.id;

          return (
            <Animated.View
              key={theme.id}
              entering={FadeInUp.duration(300).delay(index * 40)}
            >
              <Pressable
                onPress={() => handleThemeSelect(theme.id)}
                style={({ pressed }) => ({
                  backgroundColor: isSelected
                    ? colors.buttonBackgroundPressed
                    : pressed
                    ? 'rgba(255,255,255,0.03)'
                    : colors.inputBackground,
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: isSelected ? colors.borderFocused : colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                })}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 14,
                  }}
                >
                  {IconComponent && (
                    <IconComponent
                      size={20}
                      color={isSelected ? colors.text : colors.textMuted}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 16,
                      color: colors.text,
                      marginBottom: 2,
                    }}
                  >
                    {theme.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: 13,
                      color: colors.textMuted,
                      lineHeight: 18,
                    }}
                  >
                    {theme.description}
                  </Text>
                </View>
                {isSelected && (
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: colors.text,
                      marginLeft: 8,
                    }}
                  />
                )}
              </Pressable>
            </Animated.View>
          );
        })}

        <Pressable
          onPress={handleSkipTheme}
          style={{
            paddingVertical: 16,
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 14,
              color: colors.textSubtle,
            }}
          >
            Skip – let us choose based on your story
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  // Render type selection
  if (step === 'type') {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {selectedTheme && (
          <Pressable
            onPress={handleBack}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 14,
                color: colors.textSubtle,
              }}
            >
              ← Back to themes
            </Text>
          </Pressable>
        )}

        <Text
          style={{
            fontFamily: FontFamily.body,
            fontSize: 14,
            color: colors.textMuted,
            marginBottom: 20,
            lineHeight: 20,
          }}
        >
          How would you like this devotional structured?
        </Text>

        {compatibleTypes.map((type, index) => {
          const IconComponent = TYPE_ICONS[type.icon];
          const isSelected = selectedType === type.id;

          return (
            <Animated.View
              key={type.id}
              entering={FadeInUp.duration(300).delay(index * 40)}
            >
              <Pressable
                onPress={() => handleTypeSelect(type.id)}
                style={({ pressed }) => ({
                  backgroundColor: isSelected
                    ? colors.buttonBackgroundPressed
                    : pressed
                    ? 'rgba(255,255,255,0.03)'
                    : colors.inputBackground,
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: isSelected ? colors.borderFocused : colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                })}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 14,
                  }}
                >
                  {IconComponent && (
                    <IconComponent
                      size={20}
                      color={isSelected ? colors.text : colors.textMuted}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 16,
                      color: colors.text,
                      marginBottom: 2,
                    }}
                  >
                    {type.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: 13,
                      color: colors.textMuted,
                      lineHeight: 18,
                    }}
                  >
                    {type.description}
                  </Text>
                </View>
                <ChevronRight
                  size={18}
                  color={isSelected ? colors.text : colors.textSubtle}
                />
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>
    );
  }

  // Render subject selection (for book/character studies)
  if (step === 'subject' && needsSubject) {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <Pressable
          onPress={handleBack}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 14,
              color: colors.textSubtle,
            }}
          >
            ← Back to types
          </Text>
        </Pressable>

        <Text
          style={{
            fontFamily: FontFamily.body,
            fontSize: 14,
            color: colors.textMuted,
            marginBottom: 20,
            lineHeight: 20,
          }}
        >
          {selectedType === 'book_study'
            ? 'Which book would you like to study?'
            : 'Whose story would you like to explore?'}
        </Text>

        {subjects.map((subject, index) => {
          const isSelected = selectedSubject === subject.name;

          return (
            <Animated.View
              key={subject.name}
              entering={FadeInUp.duration(300).delay(index * 30)}
            >
              <Pressable
                onPress={() => handleSubjectSelect(subject.name)}
                style={({ pressed }) => ({
                  backgroundColor: isSelected
                    ? colors.buttonBackgroundPressed
                    : pressed
                    ? 'rgba(255,255,255,0.03)'
                    : colors.inputBackground,
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: isSelected ? colors.borderFocused : colors.border,
                })}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 16,
                    color: colors.text,
                    marginBottom: 4,
                  }}
                >
                  {subject.name}
                </Text>
                <Text
                  style={{
                    fontFamily: FontFamily.body,
                    fontSize: 13,
                    color: colors.textMuted,
                    lineHeight: 18,
                  }}
                >
                  {subject.description}
                </Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>
    );
  }

  return null;
}
