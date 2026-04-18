import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  AccessibilityInfo,
} from 'react-native';
import {
  BookBookmarkIcon,
  ListBulletsIcon,
  ListNumbersIcon,
  CheckSquareIcon,
  CheckIcon,
  TextBIcon,
  TextItalicIcon,
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  QuotesIcon,
} from 'phosphor-react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useReducedMotion,
} from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import * as Haptics from 'expo-haptics';
import {
  useEditorBridge,
  RichText,
  TenTapStartKit,
  TaskListBridge,
  HeadingBridge,
  ListItemBridge,
  BlockquoteBridge,
  PlaceholderBridge,
  useBridgeState,
  useKeyboard,
} from '@10play/tentap-editor';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import {
  NOTEBOOK_TOOLBAR_BOTTOM_PADDING_IOS,
  NOTEBOOK_TOOLBAR_ROW_HEIGHT,
  NOTEBOOK_TOOLBAR_TOTAL_HEIGHT,
} from '@/lib/notebook-editor-layout';

import { Note } from '@/lib/store';

export type { Note };

/* ─────────────────────────────────────────────────────────
 * Helper: strip HTML tags for plain-text contexts
 * (NoteCard preview, first-line title fallback)
 * ───────────────────────────────────────────────────────── */
export function stripHtml(html: string): string {
  return html
    .replace(/<\/?(p|li|h[1-6]|blockquote|div)[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ─────────────────────────────────────────────────────────
 * Helper: detect HTML vs legacy plain-text/markdown content
 * ───────────────────────────────────────────────────────── */
export function isHtmlContent(content: string): boolean {
  return content.trimStart().startsWith('<');
}

interface NoteEditorProps {
  /** Existing note to edit. If undefined, this is a new note. */
  initialNote?: Note;
  /** Called when the user taps "Done" or navigates back (manual save). */
  onSave: (data: { title: string; content: string }) => void;
  /** Called on auto-save (800ms debounce after last keystroke). */
  onAutoSave?: (data: { title: string; content: string }) => void;
  /** Called when a toolbar action needs to open a sheet (scripture picker). */
  onToolbarAction?: (action: 'scripture') => void;
  /** When set, the editor injects a blockquote with this scripture into the content. */
  pendingScriptureInsert?: { reference: string; text: string } | null;
  /** Called after the scripture blockquote has been injected into the editor. */
  onScriptureInserted?: () => void;
}

/**
 * Core writing component for the notebook feature.
 * Uses @10play/tentap-editor (TipTap for React Native) for rich text.
 *
 * Auto-formatting shortcuts (TipTap input rules):
 *   "- "  → bullet list
 *   "1. " → numbered list
 *   "[ ] " → checklist
 *   "# "  → heading 1 (## → H2, ### → H3)
 *   "> "  → blockquote
 */
export function NoteEditor({
  initialNote,
  onAutoSave,
  onToolbarAction,
  pendingScriptureInsert,
  onScriptureInserted,
}: NoteEditorProps) {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();

  const [title, setTitle] = useState(initialNote?.title ?? '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedResetRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Always keep the latest title accessible to the async save callback
  const latestTitleRef = useRef(initialNote?.title ?? '');

  // Convert legacy plain-text/markdown to minimal HTML for TipTap
  const initialContent = initialNote?.content
    ? isHtmlContent(initialNote.content)
      ? initialNote.content
      : legacyMarkdownToHtml(initialNote.content)
    : '<p></p>';

  // IMPORTANT: avoidIosKeyboard is FALSE because we manage keyboard padding
  // ourselves (accounting for the custom toolbar height). The library's internal
  // padding logic does NOT know about our toolbar and would set paddingBottom to
  // just keyboardHeight+10, causing text to scroll behind the toolbar after ~12 lines.
  const editor = useEditorBridge({
    avoidIosKeyboard: false,
    autofocus: false,
    initialContent,
    theme: {
      webview: { backgroundColor: colors.background },
      webviewContainer: { backgroundColor: colors.background },
    },
    bridgeExtensions: [
      ...TenTapStartKit,
      TaskListBridge,
      HeadingBridge,
      ListItemBridge,
      BlockquoteBridge,
      PlaceholderBridge.configureExtension({
        placeholder: 'Start writing…',
      }),
    ],
    onChange: () => {
      scheduleAutoSave();
    },
  });

  const editorState = useBridgeState(editor);
  const { keyboardHeight, isKeyboardUp } = useKeyboard();

  // Overlay covers the WebView until CSS is painted (WebViews punch through parent opacity on iOS)
  const [editorReady, setEditorReady] = useState(false);

  // Fallback: remove overlay after 1.5s even if isReady never fires
  // (iOS WebView key-change reload can leave isReady stale)
  useEffect(() => {
    const fallback = setTimeout(() => {
      setEditorReady(true);
      // Also inject CSS as a safety net
      editor.injectCSS(buildEditorCSS(colors));
    }, 1500);
    return () => clearTimeout(fallback);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Inject CSS once editor is ready
  useEffect(() => {
    if (!editorState.isReady) return;
    editor.injectCSS(buildEditorCSS(colors));
    // Delay removing overlay until CSS has had time to paint
    setTimeout(() => {
      setEditorReady(true);
    }, 120);
  }, [editorState.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manage keyboard padding ourselves since avoidIosKeyboard is false.
  // We account for the custom toolbar that sits above the keyboard.
  useEffect(() => {
    if (!editorState.isReady) return;
    if (isKeyboardUp && keyboardHeight > 0) {
      // Toolbar sits above the keyboard, so total occlusion is keyboard + toolbar
      const totalPadding = keyboardHeight + NOTEBOOK_TOOLBAR_TOTAL_HEIGHT + 20;
      editor.injectJS(`
        (function() {
          var doc = document.querySelector('.ProseMirror');
          if (doc) doc.style.paddingBottom = '${totalPadding}px';
        })();
      `);
      editor.updateScrollThresholdAndMargin(totalPadding);
    } else {
      editor.injectJS(`
        (function() {
          var doc = document.querySelector('.ProseMirror');
          if (doc) doc.style.paddingBottom = '0px';
        })();
      `);
      editor.updateScrollThresholdAndMargin(0);
    }
  }, [isKeyboardUp, keyboardHeight, editorState.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedResetRef.current) clearTimeout(savedResetRef.current);
    };
  }, []);

  /* ───── Scripture insertion via pending prop ───── */
  useEffect(() => {
    if (!pendingScriptureInsert || !editorState.isReady) return;
    const { reference, text } = pendingScriptureInsert;

    // Escape single quotes and newlines for safe JS string injection
    const escapedRef = reference.replace(/'/g, "\\'");
    const escapedText = text.replace(/'/g, "\\'").replace(/\n/g, ' ');

    // Restore the saved cursor position before inserting so the blockquote
    // lands where the user's cursor was, not at the top of the document.
    // Falls back to the end of the document if no position was saved.
    editor.injectJS(`
      (function() {
        var pos = typeof window.__savedSelection === 'number'
          ? window.__savedSelection
          : window.editor.state.doc.content.size - 1;
        // Clamp to valid range
        var maxPos = window.editor.state.doc.content.size - 1;
        if (pos > maxPos) pos = maxPos;
        if (pos < 0) pos = 0;
        window.editor
          .chain()
          .focus()
          .setTextSelection(pos)
          .insertContent({
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: '${escapedText}' },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [{ type: 'italic' }],
                    text: '\\u2014 ${escapedRef}',
                  },
                ],
              },
            ],
          })
          .run();
        delete window.__savedSelection;
      })();
    `);

    onScriptureInserted?.();
    scheduleAutoSave();
  }, [pendingScriptureInsert, editorState.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ───── Debounced auto-save ───── */
  const scheduleAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (savedResetRef.current) clearTimeout(savedResetRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      const html = await editor.getHTML();
      const titleVal = latestTitleRef.current;

      if (!titleVal.trim() && (!html || html === '<p></p>')) return;

      setSaveState('saving');
      onAutoSave?.({ title: titleVal, content: html });

      setTimeout(() => {
        setSaveState('saved');
        AccessibilityInfo.announceForAccessibility('Note saved');
        savedResetRef.current = setTimeout(() => setSaveState('idle'), 2000);
      }, 150);
    }, 800);
  }, [editor, onAutoSave]);

  const handleTitleChange = useCallback(
    (text: string) => {
      latestTitleRef.current = text;
      setTitle(text);
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );

  /* ───── Toolbar actions ───── */
  const handleScripturePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Save the current cursor position before the sheet opens and steals focus.
    // Without this, .focus() defaults to the start of the document on re-entry.
    editor.injectJS(`window.__savedSelection = window.editor.state.selection.anchor;`);
    onToolbarAction?.('scripture');
  }, [editor, onToolbarAction]);

  const handleBold = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    editor.toggleBold();
  }, [editor]);

  const handleItalic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    editor.toggleItalic();
  }, [editor]);

  const handleBulletList = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    editor.toggleBulletList();
  }, [editor]);

  const handleOrderedList = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    editor.toggleOrderedList();
  }, [editor]);

  const handleTaskList = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    editor.toggleTaskList();
  }, [editor]);

  const handleBlockquote = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    editor.toggleBlockquote();
  }, [editor]);

  const handleIndent = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    editor.sink();
  }, [editor]);

  const handleOutdent = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    editor.lift();
  }, [editor]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Auto-save indicator */}
      <View style={styles.saveIndicatorContainer}>
        {saveState === 'saved' && (
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
            exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
            style={styles.saveIndicator}
          >
            <CheckIcon size={14} color={colors.textSubtle} weight="bold" />
            <Text style={[styles.saveText, { color: colors.textHint }]}>Saved</Text>
          </Animated.View>
        )}
      </View>

      {/* Title — plain TextInput (no rich text needed here) */}
      <TextInput
        value={title}
        onChangeText={handleTitleChange}
        placeholder="Title"
        placeholderTextColor={colors.textHint}
        style={[styles.titleInput, { color: colors.text }]}
        returnKeyType="next"
        onSubmitEditing={() => editor.focus('end')}
        blurOnSubmit={false}
        maxLength={200}
        accessibilityLabel="Note title"
      />

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* TipTap rich text body */}
      <View style={[styles.editorContainer, { backgroundColor: colors.background }]}>
        <RichText
          editor={editor}
          style={[styles.richText, { backgroundColor: colors.background }]}
        />
        {/* Solid overlay hides WebView white flash — removed after CSS paints.
            Uses pointerEvents='none' so taps pass through while the overlay fades. */}
        {!editorReady && (
          <Animated.View
            exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
          />
        )}
      </View>

      {/* Toolbar — absolutely positioned above keyboard */}
      {editorState.isReady && isKeyboardUp && (
        <View
          style={[
            styles.toolbar,
            {
              position: 'absolute',
              bottom: keyboardHeight,
              left: 0,
              right: 0,
              borderTopColor: colors.border,
              backgroundColor: isDark
                ? 'rgba(20, 18, 16, 0.97)'
                : 'rgba(252, 250, 247, 0.97)',
            },
          ]}
        >
          <View style={styles.toolbarRow}>
            <ToolbarButton onPress={handleBold} active={editorState.isBoldActive} label="Bold">
              <TextBIcon
                size={18}
                color={editorState.isBoldActive ? colors.accent : colors.textMuted}
                weight="regular"
              />
            </ToolbarButton>

            <ToolbarButton onPress={handleItalic} active={editorState.isItalicActive} label="Italic">
              <TextItalicIcon
                size={18}
                color={editorState.isItalicActive ? colors.accent : colors.textMuted}
                weight="regular"
              />
            </ToolbarButton>

            <View style={[styles.toolbarSep, { backgroundColor: colors.border }]} />

            <ToolbarButton onPress={handleBulletList} active={editorState.isBulletListActive} label="Bullet list">
              <ListBulletsIcon
                size={18}
                color={editorState.isBulletListActive ? colors.accent : colors.textMuted}
                weight="light"
              />
            </ToolbarButton>

            <ToolbarButton onPress={handleOrderedList} active={editorState.isOrderedListActive} label="Numbered list">
              <ListNumbersIcon
                size={18}
                color={editorState.isOrderedListActive ? colors.accent : colors.textMuted}
                weight="light"
              />
            </ToolbarButton>

            <ToolbarButton onPress={handleTaskList} active={editorState.isTaskListActive} label="Checklist">
              <CheckSquareIcon
                size={18}
                color={editorState.isTaskListActive ? colors.accent : colors.textMuted}
                weight="light"
              />
            </ToolbarButton>

            <View style={[styles.toolbarSep, { backgroundColor: colors.border }]} />

            <ToolbarButton
              onPress={handleIndent}
              label="Indent"
              disabled={!editorState.canSink && !editorState.canSinkTaskListItem}
            >
              <ArrowLineRightIcon
                size={18}
                color={
                  !editorState.canSink && !editorState.canSinkTaskListItem
                    ? colors.textHint
                    : colors.textMuted
                }
                weight="light"
              />
            </ToolbarButton>

            <ToolbarButton
              onPress={handleOutdent}
              label="Outdent"
              disabled={!editorState.canLift && !editorState.canLiftTaskListItem}
            >
              <ArrowLineLeftIcon
                size={18}
                color={
                  !editorState.canLift && !editorState.canLiftTaskListItem
                    ? colors.textHint
                    : colors.textMuted
                }
                weight="light"
              />
            </ToolbarButton>

            <View style={[styles.toolbarSep, { backgroundColor: colors.border }]} />

            <ToolbarButton onPress={handleBlockquote} active={editorState.isBlockquoteActive} label="Blockquote">
              <QuotesIcon
                size={18}
                color={editorState.isBlockquoteActive ? colors.accent : colors.textMuted}
                weight="light"
              />
            </ToolbarButton>

            <ToolbarButton onPress={handleScripturePress} label="Add scripture">
              <BookBookmarkIcon size={18} color={colors.textMuted} weight="light" />
            </ToolbarButton>
          </View>
        </View>
      )}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────
 * ToolbarButton
 * ───────────────────────────────────────────────────────── */
function ToolbarButton({
  onPress,
  active,
  label,
  disabled,
  children,
}: {
  onPress: () => void;
  active?: boolean;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.toolbarButton,
        disabled && styles.toolbarButtonDisabled,
      ]}
      activeOpacity={disabled ? 1 : 0.6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
    >
      {children}
    </TouchableOpacity>
  );
}

/* ─────────────────────────────────────────────────────────
 * CSS injected into the TipTap WebView
 * ───────────────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEditorCSS(colors: any): string {
  return `
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html {
      background-color: ${colors.background} !important;
      height: 100%;
    }
    body {
      font-family: -apple-system, 'Helvetica Neue', sans-serif;
      font-size: 17px;
      line-height: 1.65;
      color: ${colors.text};
      background-color: ${colors.background} !important;
      padding: 0 4px 200px;
      margin: 0;
      width: auto;
      max-width: 100vw;
      overflow-x: hidden;
      /* CRITICAL: use only overflow-wrap:break-word for wrapping long
         unbreakable tokens (URLs, long words). DO NOT use
         word-break:break-word — it's a non-standard value that current
         iOS WebKit interprets as break-all, which breaks NORMAL words
         mid-letter at line ends (e.g. "one" → "on" + "e"). */
      overflow-wrap: break-word;
      word-wrap: break-word;
      caret-color: ${colors.accent};
      -webkit-text-size-adjust: none;
      min-height: 100%;
    }
    /* Prevent TipTap from scrolling cursor to top — only scroll when
       cursor would go below the visible area (Notion-style behavior) */
    .ProseMirror {
      overflow-anchor: none;
      overflow-wrap: break-word;
      word-wrap: break-word;
      max-width: 100%;
    }
    .tiptap { scroll-padding-bottom: 60vh; }
    p { margin: 0 0 4px 0; }
    h1 { font-size: 22px; font-weight: 700; margin: 14px 0 4px; }
    h2 { font-size: 19px; font-weight: 600; margin: 10px 0 4px; }
    h3 { font-size: 17px; font-weight: 600; margin: 8px 0 4px; }
    ul, ol { padding-left: 22px; margin: 4px 0; }
    li { margin: 2px 0; }
    ul[data-type="taskList"] { padding-left: 0; list-style: none; }
    ul[data-type="taskList"] li { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
    ul[data-type="taskList"] li > label { flex-shrink: 0; line-height: 1; display: flex; align-items: center; }
    ul[data-type="taskList"] li > label input[type="checkbox"] {
      width: 18px; height: 18px;
      accent-color: ${colors.accent};
      cursor: pointer;
      margin: 0;
    }
    ul[data-type="taskList"] li > div { flex: 1; min-width: 0; }
    ul[data-type="taskList"] li[data-checked="true"] > div {
      text-decoration: line-through;
      opacity: 0.45;
    }
    /* Hide placeholder when inside a task list */
    ul[data-type="taskList"] .is-editor-empty::before,
    ul[data-type="taskList"] .is-empty::before {
      display: none !important;
    }
    blockquote {
      border-left: 3px solid ${colors.accent};
      padding-left: 14px;
      margin: 8px 0 8px 0;
      color: ${colors.textMuted};
      font-style: italic;
    }
    strong { font-weight: 700; }
    em { font-style: italic; }
    .tiptap p.is-editor-empty:first-child::before {
      color: ${colors.textHint};
      content: attr(data-placeholder);
      float: left;
      height: 0;
      pointer-events: none;
    }
  `;
}

/* ─────────────────────────────────────────────────────────
 * Legacy markdown → minimal HTML converter
 * Handles the pseudo-markdown format from the old TextInput editor
 * ───────────────────────────────────────────────────────── */
function legacyMarkdownToHtml(content: string): string {
  const lines = content.split('\n');
  const htmlLines = lines.map((line) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('[x] ')) {
      return `<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked /></label><div>${trimmed.slice(4)}</div></li></ul>`;
    }
    if (trimmed.startsWith('[ ] ')) {
      return `<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox" /></label><div>${trimmed.slice(4)}</div></li></ul>`;
    }
    if (trimmed.startsWith('- ')) {
      return `<ul><li>${trimmed.slice(2)}</li></ul>`;
    }
    if (trimmed === '') return '<p></p>';
    // Bold/italic inline conversion
    const html = trimmed
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
    return `<p>${html}</p>`;
  });
  return htmlLines.join('') || '<p></p>';
}

/* ─────────────────────────────────────────────────────────
 * Display title helper (exported for use in note screens)
 * ───────────────────────────────────────────────────────── */
export function getDisplayTitle(title: string, content: string): string {
  if (title.trim()) return title.trim();
  const plainText = isHtmlContent(content) ? stripHtml(content) : content;
  return plainText.split('\n')[0]?.trim().slice(0, 60) || 'Untitled';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  saveIndicatorContainer: {
    height: 20,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: Spacing['6'],
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
    fontSize: FontSize['2xl'],
    letterSpacing: -0.3,
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['4'],
    paddingBottom: Spacing['3'],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing['6'],
    marginBottom: 4,
  },
  editorContainer: {
    flex: 1,
    position: 'relative',
    paddingHorizontal: Spacing['5'],
  },
  richText: {
    flex: 1,
  },
  toolbar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: Platform.OS === 'ios' ? NOTEBOOK_TOOLBAR_BOTTOM_PADDING_IOS : 0,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    height: NOTEBOOK_TOOLBAR_ROW_HEIGHT,
  },
  toolbarButton: {
    width: 34,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  toolbarButtonDisabled: {
    opacity: 0.3,
  },
  toolbarSep: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    marginHorizontal: 3,
  },
});
