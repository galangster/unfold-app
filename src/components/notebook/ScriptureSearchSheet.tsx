/**
 * ScriptureSearchSheet — Modal bottom sheet for searching and inserting
 * scripture references into notes.
 *
 * Uses React Native Modal for reliability across all screen contexts.
 * Sheet is fully opaque and renders above all other UI elements.
 *
 * UX Flow:
 *   1. Sheet opens with auto-focused text input
 *   2. User types a reference (e.g. "John 3:16")
 *   3. 500ms debounce, then parse + fetch verse text
 *   4. Preview card shows the verse with accent left border
 *   5. "Insert" button inserts blockquote into the TipTap editor
 *
 * Existing scripture refs show as quick-tap pills for fast re-insertion.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Keyboard,
} from 'react-native';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';

// Animation config
const OFFSCREEN = 500;
const SLIDE_IN = { duration: Duration.slow, easing: Easing.out(Easing.cubic) };
const DISMISS_DURATION = 180;
const SWIPE_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 500;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  BookBookmarkIcon,
  MagnifyingGlassIcon,
  ArrowRightIcon,
  WarningCircleIcon,
} from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Duration, Ease } from '@/constants/animations';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { fetchVerseLocal, fetchVerse, type VerseResult } from '@/lib/bible-api';
import { parseScriptureReferences } from '@/lib/scripture-parser';
import { referenceToRoute } from '@/lib/bible-constants';
import type { ScriptureRef } from '@/lib/store';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScriptureSearchSheetProps {
  visible: boolean;
  onClose: () => void;
  onInsert: (data: {
    reference: string;
    text: string;
    scriptureRef: ScriptureRef;
  }) => void;
  existingRefs?: ScriptureRef[];
}

type SearchState = 'idle' | 'searching' | 'found' | 'not-found' | 'error';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScriptureSearchSheet({
  visible,
  onClose,
  onInsert,
  existingRefs = [],
}: ScriptureSearchSheetProps) {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const translateY = useSharedValue(OFFSCREEN);
  const dismissing = useRef(false);

  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [verseResult, setVerseResult] = useState<VerseResult | null>(null);
  const [parsedRef, setParsedRef] = useState<ScriptureRef | null>(null);

  // Spring in when sheet opens, reset state
  useEffect(() => {
    if (visible) {
      dismissing.current = false;
      setQuery('');
      setSearchState('idle');
      setVerseResult(null);
      setParsedRef(null);
      translateY.value = OFFSCREEN;
      translateY.value = withTiming(0, SLIDE_IN);
      const focusTimer = setTimeout(() => {
        inputRef.current?.focus();
      }, 350);
      return () => clearTimeout(focusTimer);
    }
  }, [visible, translateY]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const dismissSheet = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    translateY.value = withTiming(OFFSCREEN, { duration: DISMISS_DURATION });
    setTimeout(onClose, DISMISS_DURATION);
  }, [onClose, translateY]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          if (e.translationY > 0) {
            translateY.value = e.translationY;
          }
        })
        .onEnd((e) => {
          if (e.translationY > SWIPE_THRESHOLD || e.velocityY > VELOCITY_THRESHOLD) {
            translateY.value = withTiming(OFFSCREEN, { duration: DISMISS_DURATION });
            runOnJS(dismissSheet)();
          } else {
            translateY.value = withTiming(0, SLIDE_IN);
          }
        }),
    [dismissSheet, translateY],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  /**
   * Fetch a verse by reference string.
   * Tries local DB first (BSB), then falls back to the API.
   */
  const fetchVerseText = useCallback(async (reference: string) => {
    setSearchState('searching');
    setVerseResult(null);
    setParsedRef(null);

    try {
      let result = await fetchVerseLocal(reference, 'BSB');
      if (!result) {
        result = await fetchVerse(reference);
      }

      if (result) {
        setVerseResult(result);
        setSearchState('found');
        const parsed = referenceToRoute(result.reference);
        if (parsed) {
          setParsedRef({
            reference: result.reference,
            bookId: parsed.bookId,
            chapter: parsed.chapter,
            verse: parsed.verse,
            verseEnd: parsed.verseEnd,
          });
        }
      } else {
        setSearchState('not-found');
      }
    } catch (err) {
      logger.error('[ScriptureSearch] Fetch error:', err);
      setSearchState('error');
    }
  }, []);

  const handleQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!text.trim()) {
        setSearchState('idle');
        setVerseResult(null);
        setParsedRef(null);
        return;
      }

      debounceRef.current = setTimeout(() => {
        const refs = parseScriptureReferences(text.trim());
        if (refs.length > 0) {
          fetchVerseText(refs[0].reference);
        } else {
          const parsed = referenceToRoute(text.trim());
          if (parsed) {
            fetchVerseText(text.trim());
          } else {
            setSearchState('not-found');
            setVerseResult(null);
            setParsedRef(null);
          }
        }
      }, 500);
    },
    [fetchVerseText]
  );

  const handlePillPress = useCallback(
    (ref: ScriptureRef) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setQuery(ref.reference);
      fetchVerseText(ref.reference);
    },
    [fetchVerseText]
  );

  const handleInsert = useCallback(() => {
    if (!verseResult || !parsedRef || dismissing.current) return;
    dismissing.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Keyboard.dismiss();
    onInsert({
      reference: verseResult.reference,
      text: verseResult.text,
      scriptureRef: parsedRef,
    });
    setQuery('');
    setSearchState('idle');
    setVerseResult(null);
    setParsedRef(null);
    translateY.value = withTiming(OFFSCREEN, { duration: DISMISS_DURATION });
    setTimeout(onClose, DISMISS_DURATION);
  }, [verseResult, parsedRef, onInsert, onClose, translateY]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissSheet}
    >
      <GestureHandlerRootView style={sheetStyles.modalContainer}>
        <KeyboardAvoidingView
          style={sheetStyles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Transparent dismiss area */}
          <TouchableOpacity
            style={sheetStyles.dismissArea}
            activeOpacity={1}
            onPress={dismissSheet}
          />

          {/* Sheet — single unified surface, slides up from bottom */}
          <GestureDetector gesture={panGesture}>
            <Animated.View
              style={[
                sheetStyles.sheet,
                sheetAnimatedStyle,
                {
                  backgroundColor: colors.backgroundElevated,
                  paddingBottom: insets.bottom + 200,
                },
              ]}
            >
              {/* Handle indicator */}
              <View style={sheetStyles.handleRow}>
                <View style={[sheetStyles.handleBar, { backgroundColor: colors.borderStrong }]} />
              </View>

              <View style={sheetStyles.content}>
                {/* Header */}
                <View style={sheetStyles.header}>
                  <BookBookmarkIcon size={20} color={colors.accent} weight="light" />
                  <Text style={[sheetStyles.headerTitle, { color: colors.text }]}>
                    Insert Scripture
                  </Text>
                </View>

                {/* Search input */}
                <View
                  style={[
                    sheetStyles.inputContainer,
                    {
                      backgroundColor: colors.background,
                      borderColor: query.trim() ? alpha(colors.accent, 0.25) : colors.border,
                    },
                  ]}
                >
                  <MagnifyingGlassIcon
                    size={16}
                    color={colors.textHint}
                    weight="light"
                    style={sheetStyles.inputIcon}
                  />
                  <TextInput
                    ref={inputRef}
                    value={query}
                    onChangeText={handleQueryChange}
                    placeholder='e.g. John 3:16, Psalm 23:1-6'
                    placeholderTextColor={colors.textHint}
                    selectionColor={colors.accent}
                    cursorColor={colors.accent}
                    style={[sheetStyles.input, { color: colors.text }]}
                    autoCorrect={false}
                    autoCapitalize="words"
                    returnKeyType="search"
                    accessibilityLabel="Scripture reference input"
                    accessibilityHint="Type a Bible reference to search"
                  />
                </View>

                {/* Quick-access pills for existing refs */}
                {existingRefs.length > 0 && searchState === 'idle' && (
                  <View style={sheetStyles.pillSection}>
                    <Text style={[sheetStyles.pillLabel, { color: colors.textHint }]}>
                      Recent references
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={sheetStyles.pillRow}
                      style={sheetStyles.pillScroll}
                    >
                      {existingRefs.map((ref, idx) => (
                        <TouchableOpacity
                          key={`${ref.reference}-${idx}`}
                          onPress={() => handlePillPress(ref)}
                          activeOpacity={0.7}
                          style={[
                            sheetStyles.pill,
                            { backgroundColor: alpha(colors.accent, 0.05) },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Insert ${ref.reference}`}
                        >
                          <Text
                            style={[sheetStyles.pillText, { color: colors.accent }]}
                            numberOfLines={1}
                          >
                            {ref.reference}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Search state feedback */}
                {searchState === 'searching' && (
                  <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={sheetStyles.stateContainer}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={[sheetStyles.stateText, { color: colors.textMuted }]}>
                      Searching...
                    </Text>
                  </Animated.View>
                )}

                {searchState === 'not-found' && (
                  <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={sheetStyles.stateContainer}>
                    <WarningCircleIcon size={16} color={colors.textHint} weight="light" />
                    <Text style={[sheetStyles.stateText, { color: colors.textHint }]}>
                      Verse not found. Try a reference like "John 3:16"
                    </Text>
                  </Animated.View>
                )}

                {searchState === 'error' && (
                  <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={sheetStyles.stateContainer}>
                    <WarningCircleIcon size={16} color={colors.textHint} weight="light" />
                    <Text style={[sheetStyles.stateText, { color: colors.textHint }]}>
                      Something went wrong. Please try again.
                    </Text>
                  </Animated.View>
                )}

                {/* Verse preview card */}
                {searchState === 'found' && verseResult && (
                  <Animated.View
                    entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).easing(Ease.out)}
                    exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
                    style={[
                      sheetStyles.previewCard,
                      {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                        borderLeftColor: colors.accent,
                      },
                    ]}
                  >
                    <Text style={[sheetStyles.previewText, { color: colors.text }]} numberOfLines={6}>
                      {verseResult.text}
                    </Text>
                    <Text style={[sheetStyles.previewRef, { color: colors.textMuted }]}>
                      — {verseResult.reference}
                      {verseResult.translation ? ` (${verseResult.translation.toUpperCase()})` : ''}
                    </Text>
                  </Animated.View>
                )}

                {/* Insert button */}
                {searchState === 'found' && verseResult && parsedRef && (
                  <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(100).easing(Ease.out)}>
                    <TouchableOpacity
                      onPress={handleInsert}
                      activeOpacity={0.7}
                      style={[sheetStyles.insertButton, { backgroundColor: colors.accent }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Insert ${verseResult.reference} into note`}
                    >
                      <Text style={[sheetStyles.insertButtonText, { color: colors.background }]}>
                        Insert
                      </Text>
                      <ArrowRightIcon size={16} color={colors.background} weight="bold" style={sheetStyles.insertIcon} />
                    </TouchableOpacity>
                  </Animated.View>
                )}
              </View>
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const sheetStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    maxHeight: '70%',
    ...Shadow.sheet,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['2'],
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  content: {
    paddingHorizontal: Spacing['6'],
    paddingTop: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    marginBottom: Spacing['4'],
  },
  headerTitle: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.lg,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: Spacing['3'],
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    paddingVertical: 0,
  },
  pillSection: {
    marginBottom: Spacing['3'],
  },
  pillLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing['2'],
  },
  pillScroll: {
    flexGrow: 0,
  },
  pillRow: {
    gap: Spacing['2'],
  },
  pill: {
    paddingHorizontal: Spacing['3'],
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  pillText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
    letterSpacing: 0.2,
  },
  stateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    paddingVertical: Spacing['4'],
    justifyContent: 'center',
  },
  stateText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
  },
  previewCard: {
    borderLeftWidth: 3,
    borderRadius: Radius.sm,
    padding: Spacing['4'],
    marginBottom: Spacing['4'],
  },
  previewText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  previewRef: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
    marginTop: 10,
    letterSpacing: 0.2,
  },
  insertButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Radius.md,
  },
  insertButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
    letterSpacing: 0.2,
  },
  insertIcon: {
    marginLeft: 6,
  },
});
