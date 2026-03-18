/**
 * ScriptureSearchSheet — Bottom sheet for searching and inserting scripture references into notes.
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

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Keyboard,
} from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  BookBookmarkIcon,
  MagnifyingGlassIcon,
  ArrowRightIcon,
  WarningCircleIcon,
} from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
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
  const bottomSheetRef = useRef<BottomSheet>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [verseResult, setVerseResult] = useState<VerseResult | null>(null);
  const [parsedRef, setParsedRef] = useState<ScriptureRef | null>(null);

  // Open/close the sheet based on visibility
  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [visible]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Reset state when sheet opens
  useEffect(() => {
    if (visible) {
      setQuery('');
      setSearchState('idle');
      setVerseResult(null);
      setParsedRef(null);
    }
  }, [visible]);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        Keyboard.dismiss();
        onClose();
      }
    },
    [onClose]
  );

  /**
   * Fetch a verse by reference string.
   * Tries local DB first (BSB), then falls back to the API.
   */
  const fetchVerseText = useCallback(async (reference: string) => {
    setSearchState('searching');
    setVerseResult(null);
    setParsedRef(null);

    try {
      // Try local DB first (faster, offline-capable)
      let result = await fetchVerseLocal(reference, 'BSB');

      // Fall back to remote API
      if (!result) {
        result = await fetchVerse(reference);
      }

      if (result) {
        setVerseResult(result);
        setSearchState('found');

        // Parse into ScriptureRef for the store
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

  /**
   * Handle text input changes with debounced parsing.
   */
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
        // Try to parse the reference from the text
        const refs = parseScriptureReferences(text.trim());
        if (refs.length > 0) {
          fetchVerseText(refs[0].reference);
        } else {
          // Try the raw text as a direct reference (handles partial inputs)
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

  /**
   * Handle tapping a quick-access pill.
   */
  const handlePillPress = useCallback(
    (ref: ScriptureRef) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setQuery(ref.reference);
      fetchVerseText(ref.reference);
    },
    [fetchVerseText]
  );

  /**
   * Handle the Insert button press.
   */
  const handleInsert = useCallback(() => {
    if (!verseResult || !parsedRef) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    onInsert({
      reference: verseResult.reference,
      text: verseResult.text,
      scriptureRef: parsedRef,
    });

    // Reset and close
    setQuery('');
    setSearchState('idle');
    setVerseResult(null);
    setParsedRef(null);
    onClose();
  }, [verseResult, parsedRef, onInsert, onClose]);

  const renderBackdrop = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    []
  );

  if (!visible) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={['55%']}
      enablePanDownToClose
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={{
        backgroundColor: colors.inputBackground,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
      }}
      handleIndicatorStyle={{
        backgroundColor: colors.border,
        width: 36,
      }}
    >
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
              backgroundColor: isDark
                ? 'rgba(255,255,255,0.06)'
                : 'rgba(0,0,0,0.04)',
              borderColor: colors.border,
            },
          ]}
        >
          <MagnifyingGlassIcon
            size={16}
            color={colors.textHint}
            weight="light"
            style={sheetStyles.inputIcon}
          />
          <BottomSheetTextInput
            value={query}
            onChangeText={handleQueryChange}
            placeholder="e.g. John 3:16, Psalm 23:1-6"
            placeholderTextColor={colors.textHint}
            style={[sheetStyles.input, { color: colors.text }]}
            autoFocus
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
                    {
                      backgroundColor: colors.accent + '0D',
                    },
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
          <Animated.View
            entering={FadeIn.duration(200)}
            style={sheetStyles.stateContainer}
          >
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[sheetStyles.stateText, { color: colors.textMuted }]}>
              Searching...
            </Text>
          </Animated.View>
        )}

        {searchState === 'not-found' && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={sheetStyles.stateContainer}
          >
            <WarningCircleIcon
              size={16}
              color={colors.textHint}
              weight="light"
            />
            <Text style={[sheetStyles.stateText, { color: colors.textHint }]}>
              Verse not found. Try a reference like "John 3:16"
            </Text>
          </Animated.View>
        )}

        {searchState === 'error' && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={sheetStyles.stateContainer}
          >
            <WarningCircleIcon
              size={16}
              color={colors.textHint}
              weight="light"
            />
            <Text style={[sheetStyles.stateText, { color: colors.textHint }]}>
              Something went wrong. Please try again.
            </Text>
          </Animated.View>
        )}

        {/* Verse preview card */}
        {searchState === 'found' && verseResult && (
          <Animated.View
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(150)}
            style={[
              sheetStyles.previewCard,
              {
                backgroundColor: isDark
                  ? 'rgba(255,255,255,0.04)'
                  : 'rgba(0,0,0,0.02)',
                borderLeftColor: colors.accent,
              },
            ]}
          >
            <Text
              style={[
                sheetStyles.previewText,
                { color: colors.text },
              ]}
              numberOfLines={6}
            >
              {verseResult.text}
            </Text>
            <Text
              style={[
                sheetStyles.previewRef,
                { color: colors.textMuted },
              ]}
            >
              — {verseResult.reference}
              {verseResult.translation ? ` (${verseResult.translation.toUpperCase()})` : ''}
            </Text>
          </Animated.View>
        )}

        {/* Insert button */}
        {searchState === 'found' && verseResult && parsedRef && (
          <Animated.View entering={FadeIn.duration(200).delay(100)}>
            <TouchableOpacity
              onPress={handleInsert}
              activeOpacity={0.7}
              style={[
                sheetStyles.insertButton,
                { backgroundColor: colors.accent },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Insert ${verseResult.reference} into note`}
            >
              <Text
                style={[
                  sheetStyles.insertButtonText,
                  { color: colors.background },
                ]}
              >
                Insert
              </Text>
              <ArrowRightIcon
                size={16}
                color={colors.background}
                weight="bold"
                style={sheetStyles.insertIcon}
              />
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const sheetStyles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: FontFamily.display,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 12,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 16,
    paddingVertical: 0,
  },
  pillSection: {
    marginBottom: 12,
  },
  pillLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  pillScroll: {
    flexGrow: 0,
  },
  pillRow: {
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pillText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
    letterSpacing: 0.2,
  },
  stateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    justifyContent: 'center',
  },
  stateText: {
    fontFamily: FontFamily.ui,
    fontSize: 14,
  },
  previewCard: {
    borderLeftWidth: 3,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
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
    borderRadius: 12,
  },
  insertButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 16,
    letterSpacing: 0.2,
  },
  insertIcon: {
    marginLeft: 6,
  },
});
