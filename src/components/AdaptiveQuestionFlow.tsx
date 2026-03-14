import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  LayoutAnimation,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useAdaptiveQuestions } from '@/lib/use-adaptive-questions';
import { TypewriterText } from '@/components/TypewriterText';
import { StudyContext } from '@/lib/adaptive-questions';

interface AdaptiveQuestionFlowProps {
  studyContext: StudyContext;
  onComplete: (answers: Array<{ question: string; answer: string }>) => void;
  onBack?: () => void;
}

export function AdaptiveQuestionFlow({ studyContext, onComplete, onBack }: AdaptiveQuestionFlowProps) {
  const { colors, isDark } = useTheme();
  const [answer, setAnswer] = useState('');
  const [showInput, setShowInput] = useState(false);

  const {
    currentQuestion,
    currentSubtext,
    isLoading,
    shouldGenerateNow,
    progressMessage,
    submitAnswer,
    questionCount,
    estimatedProgress,
  } = useAdaptiveQuestions({
    studyContext,
    onReadyToGenerate: (qa) => {
      onComplete(qa.map(q => ({ question: q.question, answer: q.answer })));
    },
  });

  const handleTypewriterComplete = useCallback(() => {
    setShowInput(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!answer.trim() || isLoading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();

    LayoutAnimation.configureNext({
      duration: 200,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });

    setShowInput(false);
    await submitAnswer(answer);
    setAnswer('');
  }, [answer, isLoading, submitAnswer]);

  return (
    <View style={{ flex: 1 }}>
      {/* Progress indicator */}
      <View style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: colors.textMuted }}>
            Our conversation
          </Text>
          <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: colors.textMuted }}>
            {estimatedProgress}%
          </Text>
        </View>
        <View style={{ height: 3, backgroundColor: colors.inputBackground, borderRadius: 1.5 }}>
          <View 
            style={{ 
              height: 3, 
              backgroundColor: colors.accent, 
              borderRadius: 1.5,
              width: `${estimatedProgress}%`,
            }} 
          />
        </View>
        
        {progressMessage && (
          <Animated.Text 
            entering={FadeIn}
            style={{ 
              fontFamily: FontFamily.body, 
              fontSize: 13, 
              color: colors.textMuted,
              marginTop: 8,
              fontStyle: 'italic',
            }}
          >
            {progressMessage}
          </Animated.Text>
        )}
      </View>

      {/* Question */}
      <View style={{ marginBottom: 16 }}>
        <TypewriterText
          text={currentQuestion}
          onComplete={handleTypewriterComplete}
          style={{ fontSize: 28, lineHeight: 36, fontFamily: FontFamily.uiMedium }}
        />
      </View>

      {/* Subtext */}
      {showInput && (
        <Animated.View entering={FadeIn} style={{ marginBottom: 32 }}>
          <Text style={{ 
            fontFamily: FontFamily.body, 
            fontSize: 16, 
            color: colors.textMuted, 
            lineHeight: 24 
          }}>
            {currentSubtext}
          </Text>
        </Animated.View>
      )}

      {/* Input */}
      {showInput && !shouldGenerateNow && (
        <Animated.View entering={FadeIn} style={{ flex: 1 }}>
          <TextInput
            style={{
              fontFamily: FontFamily.body,
              fontSize: 17,
              color: colors.text,
              lineHeight: 26,
              padding: 0,
              minHeight: 120,
              textAlignVertical: 'top',
            }}
            multiline
            placeholder="Your thoughts..."
            placeholderTextColor={colors.textMuted}
            value={answer}
            onChangeText={setAnswer}
            autoFocus
            editable={!isLoading}
          />

          {/* Submit button */}
          <View style={{ marginTop: 24, alignItems: 'flex-end' }}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={handleSubmit}
              disabled={!answer.trim() || isLoading}
              accessibilityRole="button"
              accessibilityLabel="Submit answer"
              accessibilityState={{ disabled: !answer.trim() || isLoading }}
              style={{
                backgroundColor: answer.trim() ? colors.accent : colors.inputBackground,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 24,
                opacity: answer.trim() ? 1 : 0.5,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={answer.trim() ? '#fff' : colors.textMuted} />
              ) : (
                <>
                  <Text style={{ 
                    fontFamily: FontFamily.uiMedium, 
                    fontSize: 15, 
                    color: answer.trim() ? '#fff' : colors.textMuted 
                  }}>
                    Continue
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Generating state */}
      {shouldGenerateNow && (
        <Animated.View 
          entering={FadeIn}
          style={{ 
            flex: 1, 
            justifyContent: 'center', 
            alignItems: 'center',
            gap: 16,
          }}
        >
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.accent,
                  opacity: 0.3 + i * 0.35,
                }}
              />
            ))}
          </View>
          <Text style={{ 
            fontFamily: FontFamily.ui, 
            fontSize: 15, 
            color: colors.textMuted,
            letterSpacing: 0.5,
          }}>
            Crafting your devotional...
          </Text>
        </Animated.View>
      )}
    </View>
  );
}
