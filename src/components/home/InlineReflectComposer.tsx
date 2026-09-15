import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { createAutosaveController } from '@/lib/autosave-controller';
import {
  captureSyncSession,
  isSyncSessionCurrent,
} from '@/lib/sync-session-fence';
import type { ReflectionStatus } from './compute-devotional-state';

// Cap growth so a long entry pushes the user into the full journal instead of
// turning the home card into an editor.
const MIN_HEIGHT = 56;
const MAX_HEIGHT = 132;

interface Props {
  /** Existing free-write content for the day (prefills the field). */
  initialDraft: string;
  reflectionStatus: ReflectionStatus;
  /** Persist the draft. Called debounced while typing and flushed on blur/unmount. */
  onSaveDraft: (text: string) => void;
  /** Open the full journal (SOAP, questions, prayer). */
  onOpenFull: () => void;
  /** Demoted re-read action, rendered as a quiet link beside the reflect link. */
  onReadAgain?: () => void;
  /** Today uses focus as the edit-session boundary for a completed day. */
  onFocus?: () => void;
  onBlur?: () => void;
  /** False when Today is no longer the active screen. */
  screenFocused?: boolean;
}

/**
 * Inline free-write field on the completed devotional card.
 *
 * The field IS the invitation: after finishing a reading the primary action is
 * to write, in place, without navigating anywhere. Text state stays local —
 * the store save is fire-and-forget via the shared autosave controller, so a
 * journalEntries update re-rendering the card never clobbers in-flight typing.
 */
export function InlineReflectComposer({
  initialDraft,
  reflectionStatus,
  onSaveDraft,
  onOpenFull,
  onReadAgain,
  onFocus,
  onBlur,
  screenFocused = true,
}: Props) {
  const { colors, isDark } = useTheme();
  const [text, setText] = useState(initialDraft);
  const [inputHeight, setInputHeight] = useState(MIN_HEIGHT);
  const [isFocused, setIsFocused] = useState(false);

  const textRef = useRef(text);
  textRef.current = text;
  const savedRef = useRef(initialDraft);
  const onSaveDraftRef = useRef(onSaveDraft);
  onSaveDraftRef.current = onSaveDraft;
  const [syncSession] = useState(captureSyncSession);

  const autosave = useMemo(
    () =>
      createAutosaveController({
        save: () => {
          if (!isSyncSessionCurrent(syncSession)) return;
          if (textRef.current === savedRef.current) return;
          savedRef.current = textRef.current;
          onSaveDraftRef.current(textRef.current);
        },
      }),
    [syncSession],
  );

  // Flush pending text on unmount (tab switch, state change) so nothing is lost.
  useEffect(() => () => { autosave.flush(); }, [autosave]);

  useEffect(() => {
    if (screenFocused) return;
    setIsFocused(false);
    autosave.flush();
    onBlur?.();
  }, [autosave, onBlur, screenFocused]);

  const handleChange = useCallback((value: string) => {
    setText(value);
    autosave.schedule();
  }, [autosave]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    autosave.flush();
    onBlur?.();
  }, [autosave, onBlur]);

  const fullLinkLabel = reflectionStatus === 'started'
    ? 'Finish your reflection'
    : 'Open full reflection';

  return (
    <View>
      <GlassSurface
        radius={Radius.card}
        style={isFocused ? { borderColor: alpha(colors.accent, 0.45) } : undefined}
      >
        <TextInput
          value={text}
          onChangeText={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onContentSizeChange={(e) =>
            setInputHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, e.nativeEvent.contentSize.height + 28)))
          }
          multiline
          placeholder="What stayed with you today?"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          testID="home-reflect-composer"
          accessibilityLabel="Reflect on today's reading"
          accessibilityHint="Type a short reflection. It saves automatically to your journal."
          style={[
            styles.input,
            {
              height: inputHeight,
              color: colors.text,
            },
          ]}
        />
      </GlassSurface>
      <View style={styles.linksRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onOpenFull}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={fullLinkLabel}
          accessibilityHint="Opens the full journal with guided questions and prayer"
        >
          <Text style={[styles.fullLink, { color: colors.accent }]}>
            {fullLinkLabel} →
          </Text>
        </TouchableOpacity>
        {onReadAgain && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onReadAgain}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Read today's devotional again"
          >
            <Text style={[styles.readAgainLink, { color: colors.textMuted }]}>
              Read again
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    paddingHorizontal: Spacing['4'],
    paddingTop: 14,
    paddingBottom: 14,
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing['3'],
    minHeight: 24,
  },
  fullLink: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
  readAgainLink: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
  },
});
