import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { X, Check, Sparkles, Lock } from 'lucide-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { analyzeNetworkError, isOnline } from '@/lib/network-error-handler';
import { Analytics, AnalyticsEvents } from '@/lib/analytics';

const BACKEND_URL = process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL || 'http://localhost:3000';

export default function JournalScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ devotionalId: string; dayNumber: string }>();

  const devotionalId = params.devotionalId ?? '';
  const dayNumber = parseInt(params.dayNumber ?? '1', 10);

  const getJournalEntry = useUnfoldStore((s) => s.getJournalEntry);
  const addJournalEntry = useUnfoldStore((s) => s.addJournalEntry);
  const updateJournalEntry = useUnfoldStore((s) => s.updateJournalEntry);
  const setResumeContext = useUnfoldStore((s) => s.setResumeContext);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const isPremium = useUnfoldStore((s) => s.user?.isPremium ?? false);

  const existingEntry = getJournalEntry(devotionalId, dayNumber);
  const [content, setContent] = useState(existingEntry?.content ?? '');
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savedEntryIdRef = useRef<string | null>(existingEntry?.id ?? null);
  const isMountedRef = useRef(true);

  // Go Deeper state
  const [deeperPrompts, setDeeperPrompts] = useState<string[]>([]);
  const [loadingDeeper, setLoadingDeeper] = useState(false);
  const [deeperError, setDeeperError] = useState(false);

  const inputRef = useRef<TextInput>(null);

  // Track refs for unmount save
  const contentRef = useRef(content);
  contentRef.current = content;
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;

  // Get devotional context
  const currentDevotional = devotionals.find((d) => d.id === devotionalId);
  const currentDay = currentDevotional?.days.find((d) => d.dayNumber === dayNumber);

  useEffect(() => {
    if (!devotionalId || Number.isNaN(dayNumber)) return;

    setResumeContext({
      route: 'journal',
      devotionalId,
      dayNumber,
      devotionalTitle: currentDevotional?.title,
      dayTitle: currentDay?.title,
      touchedAt: new Date().toISOString(),
    });
  }, [devotionalId, dayNumber, currentDevotional?.title, currentDay?.title, setResumeContext]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);

    // Track journal opened
    Analytics.logEvent(AnalyticsEvents.JOURNAL_OPENED, {
      devotional_id: devotionalId,
      day_number: dayNumber,
      has_existing_entry: !!existingEntry,
    });
  }, []);

  const saveEntry = useCallback((text: string) => {
    if (!text.trim() || !isMountedRef.current) return;

    if (savedEntryIdRef.current) {
      updateJournalEntry(savedEntryIdRef.current, text);

      // Track journal entry edited
      Analytics.logEvent(AnalyticsEvents.JOURNAL_ENTRY_EDITED, {
        devotional_id: devotionalId,
        day_number: dayNumber,
        entry_id: savedEntryIdRef.current,
      });
    } else {
      addJournalEntry({
        devotionalId,
        dayNumber,
        content: text,
      });
      const newEntry = getJournalEntry(devotionalId, dayNumber);
      if (newEntry) {
        savedEntryIdRef.current = newEntry.id;

        // Track journal entry created
        Analytics.logEvent(AnalyticsEvents.JOURNAL_ENTRY_CREATED, {
          devotional_id: devotionalId,
          day_number: dayNumber,
          entry_id: newEntry.id,
          has_content: text.trim().length > 50,
        });
      }
    }
  }, [devotionalId, dayNumber, addJournalEntry, updateJournalEntry, getJournalEntry]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (hasChangesRef.current && contentRef.current.trim()) {
        saveEntry(contentRef.current);
      }
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
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [content, hasChanges, isSaving, saveEntry]);

  const handleTextChange = (text: string) => {
    setContent(text);
    setHasChanges(true);
  };

  const handleDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    saveEntry(content);
    AccessibilityInfo.announceForAccessibility('Journal entry saved');
    router.back();
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleGoDeeper = async () => {
    // Prevent double-tap
    if (loadingDeeper) return;

    if (!isPremium) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.push('/paywall');
      return;
    }

    if (content.trim().length < 10) return;

    // Check online status first
    const online = await isOnline();
    if (!online) {
      Alert.alert(
        'Offline',
        'You appear to be offline. Please check your connection and try again.'
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Keyboard.dismiss();
    setLoadingDeeper(true);
    setDeeperError(false);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      // Track Go Deeper AI prompt used
      Analytics.logEvent(AnalyticsEvents.JOURNAL_AI_PROMPT_USED, {
        devotional_id: devotionalId,
        day_number: dayNumber,
        content_length: content.trim().length,
      });

      const response = await fetch(`${BACKEND_URL}/api/generate/journal-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journalContent: content,
          devotionalTitle: currentDevotional?.title ?? 'Devotional',
          scriptureReference: currentDay?.scriptureReference ?? '',
          dayTitle: currentDay?.title ?? `Day ${dayNumber}`,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error('Failed to generate');

      const data = await response.json();
      const textContent = data?.content?.[0]?.text ?? '';

      // Parse JSON array from response
      const parsed = JSON.parse(textContent);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setDeeperPrompts(parsed.slice(0, 3));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Go Deeper error:', error);

      // Show user-friendly error
      Alert.alert(
        'Unable to Generate Prompts',
        'This feature is temporarily unavailable. Please try again later.',
        [{ text: 'OK' }]
      );

      setDeeperError(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoadingDeeper(false);
    }
  };

  const showDeeperButton = content.trim().length >= 10 && deeperPrompts.length === 0 && !loadingDeeper;

  return (
    <Pressable style={{ flex: 1, backgroundColor: colors.background }} onPress={Keyboard.dismiss}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-3">
            <Pressable
              onPress={handleSkip}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close journal"
              accessibilityHint="Close without saving changes"
              style={{ padding: 8 }}
            >
              <X size={22} color={colors.textMuted} />
            </Pressable>

            <Text
              style={{
                fontFamily: FontFamily.mono,
                fontSize: 12,
                color: colors.textSubtle,
                letterSpacing: 1,
              }}
            >
              DAY {dayNumber}
            </Text>

            <Pressable
              onPress={handleDone}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Save journal entry"
              accessibilityHint="Saves your reflection and closes"
              accessibilityState={{ disabled: !content.trim() }}
              style={{ padding: 8 }}
            >
              <Check size={22} color={content.trim() ? colors.text : colors.textHint} />
            </Pressable>
          </View>

          {/* Content */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View entering={FadeIn.duration(400)}>
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 28,
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                What's stirring?
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: 15,
                  color: colors.textMuted,
                  marginBottom: 32,
                }}
              >
                Take a moment to reflect. This is just for you.
              </Text>
            </Animated.View>

            <Animated.View entering={FadeIn.duration(400).delay(200)}>
              <TextInput
                ref={inputRef}
                value={content}
                onChangeText={handleTextChange}
                placeholder="Write your thoughts..."
                placeholderTextColor={colors.textHint}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Journal entry"
                accessibilityHint="Write your reflection on today's reading"
                style={{
                  minHeight: 160,
                  fontFamily: FontFamily.mono,
                  fontSize: 16,
                  color: colors.text,
                  lineHeight: 26,
                  paddingTop: 0,
                }}
              />
            </Animated.View>

            {/* Go Deeper button */}
            {showDeeperButton && (
              <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 24 }}>
                <Pressable
                  onPress={handleGoDeeper}
                  disabled={loadingDeeper}
                  accessibilityRole="button"
                  accessibilityLabel={isPremium ? "Go deeper" : "Go deeper, premium feature"}
                  accessibilityHint={isPremium ? "Get AI-generated reflection prompts based on your writing" : "Premium feature. Opens upgrade options"}
                  accessibilityState={{ disabled: loadingDeeper || !isPremium }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 14,
                    paddingHorizontal: 24,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.accent,
                    backgroundColor: pressed ? colors.accent : 'transparent',
                    alignSelf: 'center',
                    opacity: pressed || loadingDeeper ? 0.6 : 0.9,
                  })}
                >
                  {({ pressed }) => (
                    <>
                      {isPremium ? (
                        <Sparkles size={16} color={pressed ? colors.background : colors.accent} />
                      ) : (
                        <Lock size={14} color={pressed ? colors.background : colors.accent} />
                      )}
                      <Text
                        style={{
                          fontFamily: FontFamily.uiMedium,
                          fontSize: 14,
                          color: pressed ? colors.background : colors.accent,
                        }}
                      >
                        Go Deeper
                      </Text>
                    </>
                  )}
                </Pressable>
              </Animated.View>
            )}

            {/* Loading state */}
            {loadingDeeper && (
              <Animated.View
                entering={FadeIn.duration(300)}
                style={{ marginTop: 24, alignItems: 'center', gap: 10 }}
              >
                <ActivityIndicator size="small" color={colors.accent} />
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 13,
                    color: colors.textMuted,
                  }}
                >
                  Reflecting on your words...
                </Text>
              </Animated.View>
            )}

            {/* Error state */}
            {deeperError && (
              <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 24, alignItems: 'center' }}>
                <Pressable onPress={handleGoDeeper}>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 13,
                      color: colors.textMuted,
                      textAlign: 'center',
                    }}
                  >
                    Couldn't generate prompts. Tap to try again.
                  </Text>
                </Pressable>
              </Animated.View>
            )}

            {/* Deeper prompts */}
            {deeperPrompts.length > 0 && (
              <Animated.View entering={FadeInDown.duration(500)} style={{ marginTop: 32, marginBottom: 32 }}>
                <View
                  style={{
                    width: 24,
                    height: 1.5,
                    backgroundColor: colors.accent,
                    marginBottom: 20,
                    borderRadius: 1,
                  }}
                />
                <Text
                  style={{
                    fontFamily: FontFamily.mono,
                    fontSize: 11,
                    color: colors.accent,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    marginBottom: 16,
                    opacity: 0.8,
                  }}
                >
                  Go Deeper
                </Text>
                {deeperPrompts.map((prompt, index) => (
                  <Animated.View
                    key={index}
                    entering={FadeInDown.duration(400).delay(index * 100)}
                    style={{
                      marginBottom: 16,
                      paddingLeft: 14,
                      borderLeftWidth: 2,
                      borderLeftColor: colors.accent,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FontFamily.bodyItalic,
                        fontSize: 15,
                        color: colors.text,
                        lineHeight: 24,
                      }}
                    >
                      {prompt}
                    </Text>
                  </Animated.View>
                ))}
              </Animated.View>
            )}
          </ScrollView>

          {/* Bottom hint */}
          <Animated.View
            entering={FadeIn.duration(400).delay(400)}
            style={{
              paddingHorizontal: 24,
              paddingBottom: 24,
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 13,
                color: colors.textHint,
                textAlign: 'center',
              }}
            >
              {hasChanges ? 'Saving...' : 'Your response is saved automatically'}
            </Text>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Pressable>
  );
}
