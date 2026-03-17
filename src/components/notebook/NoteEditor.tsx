import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  AccessibilityInfo,
  InputAccessoryView,
} from 'react-native';
import {
  BookBookmarkIcon,
  ListBulletsIcon,
  CheckSquareIcon,
  HashIcon,
  CheckIcon,
} from 'phosphor-react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';

import { Note, NoteCategory, ScriptureRef } from '@/lib/store';

export type { Note, NoteCategory, ScriptureRef };

interface NoteEditorProps {
  /** Existing note to edit. If undefined, this is a new note. */
  initialNote?: Note;
  /** Called when the user taps "Done" or navigates back (manual save). */
  onSave: (data: { title: string; content: string }) => void;
  /** Called on auto-save (800ms debounce after last keystroke). */
  onAutoSave?: (data: { title: string; content: string }) => void;
  /** Called when a toolbar action needs to open a sheet (scripture picker, tag picker). */
  onToolbarAction?: (action: 'scripture' | 'tag') => void;
}

const INPUT_ACCESSORY_ID = 'notebook-editor-toolbar';

/**
 * Core writing component for the notebook feature.
 * Reusable across new note and edit note flows.
 *
 * Features:
 * - InstrumentSerif title field (24px) with "Title" placeholder
 * - Inter body field (16px, lineHeight 26) with "Start writing..." placeholder
 * - Auto-save with 800ms debounce
 * - Auto-save indicator (checkmark that fades in/out)
 * - Formatting toolbar above keyboard (6 buttons)
 * - Title auto-generation from first line of content if left empty
 */
export function NoteEditor({ initialNote, onSave, onAutoSave, onToolbarAction }: NoteEditorProps) {
  const { colors, isDark } = useTheme();

  const [title, setTitle] = useState(initialNote?.title ?? '');
  const [content, setContent] = useState(initialNote?.content ?? '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const bodyInputRef = useRef<TextInput>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedResetRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Track keyboard visibility for toolbar display
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedResetRef.current) clearTimeout(savedResetRef.current);
    };
  }, []);

  // Auto-save with 800ms debounce
  const triggerAutoSave = useCallback(
    (newTitle: string, newContent: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedResetRef.current) clearTimeout(savedResetRef.current);

      saveTimeoutRef.current = setTimeout(() => {
        // Only auto-save if there is meaningful content
        if (!newTitle.trim() && !newContent.trim()) return;

        setSaveState('saving');
        onAutoSave?.({ title: newTitle, content: newContent });

        // Brief saving state, then show "saved" checkmark
        setTimeout(() => {
          setSaveState('saved');
          AccessibilityInfo.announceForAccessibility('Note saved');
          savedResetRef.current = setTimeout(() => {
            setSaveState('idle');
          }, 2000);
        }, 150);
      }, 800);
    },
    [onAutoSave]
  );

  const handleTitleChange = useCallback(
    (text: string) => {
      setTitle(text);
      triggerAutoSave(text, content);
    },
    [content, triggerAutoSave]
  );

  const handleContentChange = useCallback(
    (text: string) => {
      setContent(text);
      triggerAutoSave(title, text);
    },
    [title, triggerAutoSave]
  );

  // When Return is pressed in the title, move focus to body
  const handleTitleSubmit = useCallback(() => {
    bodyInputRef.current?.focus();
  }, []);

  // Toolbar action handlers
  const handleScripturePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToolbarAction?.('scripture');
  }, [onToolbarAction]);

  const handleBoldPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Insert markdown bold markers around cursor/selection
    setContent((prev) => prev + '**bold**');
    triggerAutoSave(title, content + '**bold**');
  }, [title, content, triggerAutoSave]);

  const handleItalicPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setContent((prev) => prev + '*italic*');
    triggerAutoSave(title, content + '*italic*');
  }, [title, content, triggerAutoSave]);

  const handleListPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setContent((prev) => {
      const newContent = prev.endsWith('\n') || prev === '' ? prev + '- ' : prev + '\n- ';
      triggerAutoSave(title, newContent);
      return newContent;
    });
  }, [title, triggerAutoSave]);

  const handleChecklistPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setContent((prev) => {
      const newContent = prev.endsWith('\n') || prev === '' ? prev + '[ ] ' : prev + '\n[ ] ';
      triggerAutoSave(title, newContent);
      return newContent;
    });
  }, [title, triggerAutoSave]);

  const handleTagPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToolbarAction?.('tag');
  }, [onToolbarAction]);

  // Toolbar component — rendered both inline (Android) and as InputAccessoryView (iOS)
  const toolbar = (
    <View
      style={[
        styles.toolbar,
        {
          borderTopColor: colors.border,
          backgroundColor: isDark ? 'rgba(20, 18, 16, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        },
      ]}
    >
      <TouchableOpacity
        onPress={handleScripturePress}
        style={styles.toolbarButton}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="Add scripture reference"
        accessibilityHint="Opens scripture reference picker"
      >
        <BookBookmarkIcon size={20} color={colors.textMuted} weight="light" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleBoldPress}
        style={styles.toolbarButton}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="Bold"
        accessibilityHint="Wraps selected text in bold"
      >
        <Text style={[styles.toolbarTextButton, { fontFamily: FontFamily.bodyBold, color: colors.textMuted }]}>
          B
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleItalicPress}
        style={styles.toolbarButton}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="Italic"
        accessibilityHint="Wraps selected text in italic"
      >
        <Text style={[styles.toolbarTextButton, { fontFamily: FontFamily.bodyItalic, color: colors.textMuted }]}>
          I
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleListPress}
        style={styles.toolbarButton}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="Bullet list"
        accessibilityHint="Inserts a bullet point"
      >
        <ListBulletsIcon size={20} color={colors.textMuted} weight="light" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleChecklistPress}
        style={styles.toolbarButton}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="Checklist"
        accessibilityHint="Inserts a checkbox item"
      >
        <CheckSquareIcon size={20} color={colors.textMuted} weight="light" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleTagPress}
        style={styles.toolbarButton}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="Add tag"
        accessibilityHint="Opens tag picker or inserts hashtag"
      >
        <HashIcon size={20} color={colors.textMuted} weight="light" />
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      {/* Auto-save indicator */}
      <View style={styles.saveIndicatorContainer}>
        {saveState === 'saved' && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(300)}
            style={styles.saveIndicator}
          >
            <CheckIcon size={14} color={colors.textSubtle} weight="bold" />
            <Text style={[styles.saveText, { color: colors.textHint }]}>Saved</Text>
          </Animated.View>
        )}
      </View>

      {/* Title input */}
      <TextInput
        value={title}
        onChangeText={handleTitleChange}
        placeholder="Title"
        placeholderTextColor={colors.textHint}
        style={[
          styles.titleInput,
          { color: colors.text },
        ]}
        returnKeyType="next"
        onSubmitEditing={handleTitleSubmit}
        blurOnSubmit={false}
        maxLength={200}
        accessibilityLabel="Note title"
        inputAccessoryViewID={Platform.OS === 'ios' ? INPUT_ACCESSORY_ID : undefined}
      />

      {/* Body input */}
      <TextInput
        ref={bodyInputRef}
        value={content}
        onChangeText={handleContentChange}
        placeholder="Start writing..."
        placeholderTextColor={colors.textHint}
        style={[
          styles.bodyInput,
          { color: colors.text },
        ]}
        multiline
        textAlignVertical="top"
        scrollEnabled
        accessibilityLabel="Note content"
        inputAccessoryViewID={Platform.OS === 'ios' ? INPUT_ACCESSORY_ID : undefined}
      />

      {/* iOS: Toolbar via InputAccessoryView (tracks keyboard natively) */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={INPUT_ACCESSORY_ID}>
          {toolbar}
        </InputAccessoryView>
      )}

      {/* Android: Toolbar rendered inline when keyboard is visible */}
      {Platform.OS === 'android' && isKeyboardVisible && toolbar}
    </KeyboardAvoidingView>
  );
}

/**
 * Returns the display title for a note.
 * If the explicit title is empty, the first line of content is used.
 */
export function getDisplayTitle(title: string, content: string): string {
  if (title.trim()) return title.trim();
  const firstLine = content.split('\n')[0]?.trim();
  return firstLine || 'Untitled';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  saveIndicatorContainer: {
    height: 20,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginTop: 4,
  },
  saveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  saveText: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
  },
  titleInput: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    letterSpacing: -0.3,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 4,
    // No border, no background -- clean journal feel
  },
  bodyInput: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    lineHeight: 26,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 200, // generous keyboard clearance
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingVertical: 8,
    height: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolbarButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarTextButton: {
    fontSize: 16,
  },
});
