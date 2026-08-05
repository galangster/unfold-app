import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  AppState,
  Keyboard,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  AccessibilityInfo,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import * as Haptics from 'expo-haptics';
import {
  CaretLeftIcon,
  DotsThreeIcon,
  TrashIcon,
  StarIcon,
  FolderSimpleIcon,
  BookBookmarkIcon,
  ListBulletsIcon,
  ListNumbersIcon,
  CheckSquareIcon,
  TextBIcon,
  TextItalicIcon,
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  TextHOneIcon,
  TextHTwoIcon,
  TextHThreeIcon,
  ArrowsInSimpleIcon,
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
} from 'phosphor-react-native';
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
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, READING_FONTS, type Note, type NoteCategory, type ScriptureRef } from '@/lib/store';
import { ScriptureRefPill } from '@/components/notebook/ScriptureRefPill';
import { ScriptureSearchSheet } from '@/components/notebook/ScriptureSearchSheet';
import { MoveFolderSheet } from '@/components/notebook/MoveFolderSheet';
import { CreateFolderSheet } from '@/components/notebook/CreateFolderSheet';
import { NoteDetailSaveIndicator } from '@/components/notebook/NoteDetailSaveIndicator';
import { isHtmlContent, stripHtml } from '@/lib/note-html';
import { logger } from '@/lib/logger';
import { alpha } from '@/components/ui';
import { useCreationGate } from '@/hooks/useCreationGate';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';
import {
  UnfoldEditor,
  type UnfoldEditorRef,
  type UnfoldEditorSelectionState,
  type UnfoldEditorChangeHtmlEvent,
  type UnfoldEditorScriptureRefsEvent,
} from 'unfold-editor';
import { referenceToRoute, routeToReference } from '@/lib/bible-constants';
import {
  NOTEBOOK_TOOLBAR_BOTTOM_PADDING_IOS,
  NOTEBOOK_TOOLBAR_ROW_HEIGHT,
  NOTEBOOK_TOOLBAR_TOTAL_HEIGHT,
  getNativeEditorToolbarInset,
  shouldReuseSelectionFormattingState,
} from '@/lib/notebook-editor-layout';
import {
  getNativeBlockTypeCommand,
  getNativeListCommand,
  getTitleDividerPresentation,
  hasMeaningfulNoteContent,
  normalizeNativeInitialHtml,
  persistNoteSnapshot,
} from '@/lib/note-detail-editor';
import { buildNoteDraftDockPreview, useNoteDraftDock } from '@/lib/note-draft-dock';
import {
  createAutosaveController,
  shouldFlushAutosaveOnAppState,
  type AutosaveController,
} from '@/lib/autosave-controller';
import { reflectionBodyPx, type ReflectionFontSize } from '@/lib/reflection-typography';


/* ─────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────── */

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Convert legacy plain-text/markdown to minimal HTML for TipTap */
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
    const html = trimmed
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
    return `<p>${html}</p>`;
  });
  return htmlLines.join('') || '<p></p>';
}

/**
 * Reading-font preference → web font family for the tentap WebView editor.
 * Mirrors the DevotionalWebView map. The default ('source-serif') is
 * intentionally absent so it keeps the existing system UI stack — notes
 * only opt into a serif body when the user actively picked one.
 */
const READING_FONT_WEB_FAMILY: Record<string, string> = {
  EBGaramond_400Regular: 'EB Garamond',
  Lora_400Regular: 'Lora',
  Inter_400Regular: 'Inter',
  CrimsonText_400Regular: 'Crimson Text',
  Merriweather_400Regular: 'Merriweather',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEditorCSS(colors: any, fontSize: ReflectionFontSize, webFontFamily?: string | null): string {
  const bodyFontSize = reflectionBodyPx(fontSize);
  const fontImport = webFontFamily
    ? `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(webFontFamily)}:ital,wght@0,400;0,600;0,700;1,400&display=swap');`
    : '';
  const bodyFontStack = webFontFamily
    ? `'${webFontFamily}', Georgia, serif`
    : "-apple-system, 'Helvetica Neue', sans-serif";

  return `
    ${fontImport}
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html {
      background-color: ${colors.background} !important;
      height: 100%;
    }
    body {
      font-family: ${bodyFontStack};
      font-size: ${bodyFontSize}px;
      line-height: 1.65;
      color: ${colors.text};
      background-color: ${colors.background} !important;
      padding: 0 4px 200px;
      margin: 0;
      width: auto;
      max-width: 100vw;
      overflow-x: hidden;
      /* CRITICAL: use ONLY overflow-wrap:break-word for breaking long
         unbreakable tokens (URLs, long words). DO NOT use
         word-break:break-all — that breaks between any two characters,
         splitting normal words mid-letter at line ends (e.g. "one" →
         "on" + "e", "mistake" → "mistak" + "e"). */
      overflow-wrap: break-word;
      word-wrap: break-word;
      caret-color: ${colors.accent};
      -webkit-text-size-adjust: none;
      min-height: 100%;
    }
    ::selection {
      background: ${colors.accent}33;
    }
    .ProseMirror {
      overflow-anchor: none;
      overflow-wrap: break-word;
      word-wrap: break-word;
      max-width: 100%;
      overflow-x: hidden;
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
    ul[data-type="taskList"] .is-editor-empty::before,
    ul[data-type="taskList"] .is-empty::before {
      display: none !important;
    }
    blockquote {
      border: 1px solid ${alpha(colors.accent, 0.18)};
      border-radius: 12px;
      background-color: ${alpha(colors.accent, 0.055)};
      padding: 12px 14px;
      margin: 10px 0;
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


/**
 * iOS uses the native unfold-editor module (Proton + TextKit 1).
 * Android falls back to tentap (WebView + TipTap). Both hooks
 * always run to avoid conditional-hook violations; the tentap
 * bridge is inert on iOS since <RichText> never mounts.
 */
const IS_NATIVE_EDITOR = Platform.OS === 'ios';

const DEFAULT_SELECTION_STATE: UnfoldEditorSelectionState = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  code: false,
  hasLink: false,
  linkUrl: null,
  blockType: 'p',
  listType: null,
  start: 0,
  end: 0,
};

const JOURNAL_TAB_BAR_CONTENT_HEIGHT = 56;
const JOURNAL_EDITOR_BOTTOM_BREATHING_ROOM = 24;

/* ─────────────────────────────────────────────────────────
 * Unified Note Screen — always editable (premium users)
 *
 * There is no read/edit mode split: the editor is editable
 * whenever the user is premium, and editing chrome (toolbar,
 * undo/redo, Done) is driven purely by keyboard visibility.
 * The keyboard appears only on tap (or via `startEditing=true`,
 * which now means "focus on open"). Non-premium users get a
 * read-only view (`editable={false}` everywhere).
 * iOS: unfold-editor native module. Android: tentap WebView.
 * ───────────────────────────────────────────────────────── */

export default function NoteDetailScreen() {
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const params = useLocalSearchParams<{
    noteId?: string;
    startEditing?: string;
    devotionalId?: string;
    dayNumber?: string;
    bookId?: string;
    chapter?: string;
    verse?: string;
    verseEnd?: string;
    verseText?: string;
    reference?: string;
    folderId?: string;
  }>();

  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const { isPremium, gate, showExclusiveOffer, dismissOffer } = useCreationGate();

  // Store selectors
  const user = useUnfoldStore((s) => s.user);
  const fontSize = user?.fontSize ?? 'medium';
  // Reading-font preference (premium): notes honor the same body font the
  // reader uses. Non-premium/default stays on the existing stacks.
  const readingFontId = isPremium ? (user?.readingFont ?? 'source-serif') : 'source-serif';
  const activeReadingFont = useMemo(
    () => READING_FONTS.find((f) => f.id === readingFontId) ?? READING_FONTS[0],
    [readingFontId],
  );
  const editorWebFontFamily: string | null =
    READING_FONT_WEB_FAMILY[activeReadingFont.regular] ?? null;
  // Title keeps the display face on the default font; a chosen reading font
  // carries through at its semibold weight so title and body agree.
  const titleFontFamily =
    readingFontId === 'source-serif' ? FontFamily.display : activeReadingFont.medium;
  const notes = useUnfoldStore((s) => s.notes);
  const addNote = useUnfoldStore((s) => s.addNote);
  const updateNote = useUnfoldStore((s) => s.updateNote);
  const deleteNote = useUnfoldStore((s) => s.deleteNote);
  const folders = useUnfoldStore((s) => s.folders);
  const addFolder = useUnfoldStore((s) => s.addFolder);
  const moveNoteToFolder = useUnfoldStore((s) => s.moveNoteToFolder);
  const setDraftDock = useNoteDraftDock((s) => s.setDraft);

  // Find existing note
  const existingNote = useMemo(
    () => (params.noteId ? notes.find((n) => n.id === params.noteId) : undefined),
    [notes, params.noteId],
  );

  const noteFolder = useMemo(
    () => (existingNote?.folderId ? folders.find((f) => f.id === existingNote.folderId) : undefined),
    [existingNote?.folderId, folders],
  );

  // Track the live note ID (may be set after first auto-save for new notes)
  const [noteId, setNoteId] = useState<string | undefined>(params.noteId);
  const category: NoteCategory = existingNote?.category ?? 'general';

  // Initial folder pre-assignment for NEW notes — inherited from the
  // Journal Notebook's currently-selected folder filter. Captured once at
  // mount via ref so later in-editor folder moves (moveNoteToFolder) aren't
  // clobbered by this initial value on subsequent addNote fallbacks.
  const initialFolderIdRef = useRef<string | undefined>(
    typeof params.folderId === 'string' && params.folderId.length > 0 ? params.folderId : undefined,
  );

  // Always-editable model: no read/edit mode state. Non-premium users cannot
  // create or edit notes (defense-in-depth behind the navigation gate).
  // `startEditing=true` means "focus on open" (new-note flow, dock restore).
  const titleInputRef = useRef<TextInput>(null);
  const isNewNote = !params.noteId;
  const shouldAutoFocus = isPremium && (isNewNote || params.startEditing === 'true');

  // Title state
  const [title, setTitle] = useState(existingNote?.title ?? '');
  const latestTitleRef = useRef(existingNote?.title ?? '');

  // Auto-save indicator
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const savedResetRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingAutoSaveHtmlRef = useRef<string | undefined>(undefined);
  const autoSaveAllowEmptyRef = useRef(false);
  const autoSaveSaveRef = useRef<() => void | Promise<void>>(() => undefined);
  const autoSaveControllerRef = useRef<AutosaveController | null>(null);
  if (!autoSaveControllerRef.current) {
    autoSaveControllerRef.current = createAutosaveController({
      save: () => autoSaveSaveRef.current(),
    });
  }

  // Menu state
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMoveFolderSheet, setShowMoveFolderSheet] = useState(false);
  const [showCreateFolderSheet, setShowCreateFolderSheet] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Scripture search & insert state
  const [showScriptureSheet, setShowScriptureSheet] = useState(false);
  const [pendingScriptureInsert, setPendingScriptureInsert] = useState<{
    reference: string;
    text: string;
  } | null>(null);
  const [scriptureRefs, setScriptureRefs] = useState<ScriptureRef[]>(
    existingNote?.scriptureRefs ?? [],
  );

  // Convert legacy plain-text/markdown to HTML for TipTap
  const initialContent = existingNote?.content
    ? isHtmlContent(existingNote.content)
      ? existingNote.content
      : legacyMarkdownToHtml(existingNote.content)
    : '<p></p>';
  const nativeInitialContent = normalizeNativeInitialHtml(initialContent);

  /* ───── Native editor state (iOS) ───── */

  const editorRef = useRef<UnfoldEditorRef>(null);
  const [selectionState, setSelectionState] = useState(DEFAULT_SELECTION_STATE);
  // Tracks latest HTML from onChangeHtml for explicit save (Done/Back)
  const latestHtmlRef = useRef(initialContent);
  const isMinimizingRef = useRef(false);
  const appliedStartEditingKeyRef = useRef<string | null>(null);

  /* ───── TipTap editor bridge (Android / inert on iOS) ───── */

  // IMPORTANT: avoidIosKeyboard is FALSE because we manage keyboard padding
  // ourselves (accounting for the custom toolbar height). The library's internal
  // padding logic does NOT know about our toolbar and would set paddingBottom to
  // just keyboardHeight+10, causing text to scroll behind the toolbar after ~12 lines.
  const editor = useEditorBridge({
    avoidIosKeyboard: false,
    autofocus: false,
    editable: isPremium,
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
        placeholder: 'Start writing\u2026',
      }),
    ],
    onChange: () => {
      // Mirror the latest HTML into latestHtmlRef so flush paths (unmount
      // cleanup in particular) can read refs synchronously instead of
      // awaiting the bridge. Checkbox taps also land here and persist —
      // intended: checking a task is an edit.
      if (!IS_NATIVE_EDITOR) {
        editor
          .getHTML()
          .then((html) => {
            latestHtmlRef.current = html;
          })
          .catch(() => undefined);
      }
      scheduleAutoSave();
    },
  });

  const editorState = useBridgeState(editor);
  // RN Keyboard-listener based (tentap's hook wraps Keyboard events), so it
  // works for both the native (iOS) and tentap (Android) editor paths.
  const { keyboardHeight, isKeyboardUp } = useKeyboard();
  const nativeEditorToolbarInset = getNativeEditorToolbarInset({
    isKeyboardUp,
  });
  const nativeEditorBottomOverlayInset = isKeyboardUp
    ? 0
    : JOURNAL_TAB_BAR_CONTENT_HEIGHT + insets.bottom + JOURNAL_EDITOR_BOTTOM_BREATHING_ROOM;

  useFocusEffect(
    useCallback(() => {
      isMinimizingRef.current = false;
      const startEditingKey = `${params.noteId ?? 'new'}:${params.startEditing ?? ''}`;
      if (
        isPremium &&
        params.startEditing === 'true' &&
        !isNewNote &&
        appliedStartEditingKeyRef.current !== startEditingKey
      ) {
        appliedStartEditingKeyRef.current = startEditingKey;
        // "startEditing" means "focus on open": request editor focus so the
        // keyboard comes up (chrome follows keyboard visibility).
        //
        // Existing notes only. The new-note FAB also passes startEditing,
        // and grabbing the body here raced the title's autoFocus — the body
        // stole focus ~100ms in, the native becomeFirstResponder did not
        // take, and the note opened with nothing focused and no keyboard.
        // A new note focuses its title (see note-title-input autoFocus).
        setTimeout(() => {
          IS_NATIVE_EDITOR ? editorRef.current?.focus() : editor.focus('end');
        }, 100);
      } else if (isPremium && isNewNote && appliedStartEditingKeyRef.current !== startEditingKey) {
        appliedStartEditingKeyRef.current = startEditingKey;
        // A new note focuses its title. The TextInput's own autoFocus does not
        // survive the navigation push — the screen mounts mid-transition and
        // the focus is dropped — so claim it once the screen is actually
        // focused. Without this the note opens with nothing focused at all.
        setTimeout(() => {
          titleInputRef.current?.focus();
        }, 100);
      }
    }, [isPremium, params.noteId, params.startEditing, isNewNote, editor]),
  );

  // Overlay covers the WebView until CSS is painted (not needed on native)
  const [editorReady, setEditorReady] = useState(IS_NATIVE_EDITOR);

  // WR-19: the native editor's first frame can render with a stale interface
  // style before its colorScheme prop lands (worst on the first open per
  // launch for light-theme users — a dark flash). Mask it with the JS theme's
  // background for the first frames, then fade out.
  const [nativeEditorMasked, setNativeEditorMasked] = useState(IS_NATIVE_EDITOR);
  useEffect(() => {
    if (!IS_NATIVE_EDITOR) return;
    const mask = setTimeout(() => setNativeEditorMasked(false), 120);
    return () => clearTimeout(mask);
  }, []);

  // Fallback: remove overlay after 1.5s (tentap only — native editor has no WebView flash)
  useEffect(() => {
    if (IS_NATIVE_EDITOR) return;
    const fallback = setTimeout(() => {
      setEditorReady(true);
      editor.injectCSS(buildEditorCSS(colors, fontSize, editorWebFontFamily));
    }, 1500);
    return () => clearTimeout(fallback);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Inject CSS once editor is ready (tentap only)
  useEffect(() => {
    if (IS_NATIVE_EDITOR) return;
    if (!editorState.isReady) return;
    editor.injectCSS(buildEditorCSS(colors, fontSize, editorWebFontFamily));
    // Delay removing overlay until CSS has had time to paint
    setTimeout(() => {
      setEditorReady(true);
    }, 120);

    // If new note, auto-focus the editor after it's ready
    if (shouldAutoFocus && isNewNote) {
      setTimeout(() => {
        editor.focus('end');
      }, 300);
    }
  }, [editorState.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manage keyboard padding (tentap only — native UITextView handles its own insets)
  useEffect(() => {
    if (IS_NATIVE_EDITOR) return;
    if (!editorState.isReady) return;
    if (isKeyboardUp && keyboardHeight > 0) {
      // Toolbar is anchored above the keyboard whenever it's up
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

  // Cleanup on unmount — flush (not cancel) any pending autosave so edits
  // survive navigation that bypasses handleBack. The save path reads
  // latestHtmlRef/latestTitleRef synchronously (never awaits the editor
  // bridge) so it is safe to run during teardown. Deliberate exits
  // (back/minimize/delete) cancel first, so this is a no-op for them.
  useEffect(() => {
    return () => {
      autoSaveControllerRef.current?.flush();
      if (savedResetRef.current) clearTimeout(savedResetRef.current);
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    };
  }, []);


  /* ───── Scripture insertion via pending prop ───── */

  const handleNativeScriptureInsert = useCallback(
    async (reference: string, text: string) => {
      await editorRef.current?.insertScripture(reference, text);
      latestHtmlRef.current = (await editorRef.current?.getHtml()) ?? latestHtmlRef.current;
    },
    [],
  );

  useEffect(() => {
    if (!pendingScriptureInsert) return;

    if (IS_NATIVE_EDITOR) {
      const { reference, text } = pendingScriptureInsert;
      setPendingScriptureInsert(null);
      handleNativeScriptureInsert(reference, text).then(() => {
        scheduleAutoSave(latestHtmlRef.current);
      });
      return;
    }

    // tentap path: inject into ProseMirror
    if (!editorState.isReady) return;
    const { reference, text } = pendingScriptureInsert;

    const escapedRef = reference.replace(/'/g, "\\'");
    const escapedText = text.replace(/'/g, "\\'").replace(/\n/g, ' ');

    editor.injectJS(`
      (function() {
        var pos = typeof window.__savedSelection === 'number'
          ? window.__savedSelection
          : window.editor.state.doc.content.size - 1;
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

    setPendingScriptureInsert(null);
    scheduleAutoSave();
  }, [pendingScriptureInsert, editorState.isReady]); // eslint-disable-line react-hooks/exhaustive-deps


  /* ───── Debounced auto-save ───── */

  const scheduleAutoSave = useCallback((htmlFromEvent?: string) => {
    if (!gate()) return;
    pendingAutoSaveHtmlRef.current = htmlFromEvent;
    autoSaveAllowEmptyRef.current = false;
    if (savedResetRef.current) clearTimeout(savedResetRef.current);
    autoSaveControllerRef.current?.schedule();
  }, [gate]);

  const getCurrentEditorHtml = useCallback(async () => {
    return IS_NATIVE_EDITOR
      ? ((await editorRef.current?.getHtml()) ?? latestHtmlRef.current)
      : await editor.getHTML();
  }, [editor]);

  const persistCurrentSnapshot = useCallback(({
    title,
    html,
    allowEmpty = false,
    newNoteLog,
  }: {
    title: string;
    html: string;
    allowEmpty?: boolean;
    newNoteLog?: string;
  }): string | undefined => {
    if (!allowEmpty && !hasMeaningfulNoteContent({ title, html })) {
      return undefined;
    }

    const id = persistNoteSnapshot({
      noteId,
      input: {
        title,
        html,
        category,
        scriptureRefs,
        devotionalId: params.devotionalId,
        dayNumber: params.dayNumber,
        bookId: params.bookId,
        chapter: params.chapter,
        folderId: initialFolderIdRef.current,
      },
      allowEmpty,
      addNote,
      updateNote,
    });

    if (id && !noteId) {
      setNoteId(id);
      if (newNoteLog) {
        logger.log(newNoteLog, id);
      }
    }

    return id;
  }, [noteId, updateNote, category, scriptureRefs, addNote, params]);

  const persistScheduledAutoSave = useCallback(async () => {
    const htmlFromEvent = pendingAutoSaveHtmlRef.current;
    pendingAutoSaveHtmlRef.current = undefined;
    const allowEmpty = autoSaveAllowEmptyRef.current;
    autoSaveAllowEmptyRef.current = false;

    // Native path: HTML pushed via onChangeHtml event. tentap: mirrored into
    // latestHtmlRef from onChange. Reading refs (not the editor bridge) keeps
    // the normal debounced path safe to run from unmount cleanup.
    const html = allowEmpty
      ? await getCurrentEditorHtml()
      : htmlFromEvent ?? latestHtmlRef.current;
    const titleVal = latestTitleRef.current;

    if (!allowEmpty && !hasMeaningfulNoteContent({ title: titleVal, html })) return;

    setSaveState('saving');

    persistCurrentSnapshot({
      title: titleVal,
      html,
      allowEmpty,
      newNoteLog: '[NoteDetail] Auto-saved new note:',
    });

    setTimeout(() => {
      setSaveState('saved');
      AccessibilityInfo.announceForAccessibility('Note saved');
      savedResetRef.current = setTimeout(() => setSaveState('idle'), 2000);
    }, 150);
  }, [getCurrentEditorHtml, persistCurrentSnapshot]);
  autoSaveSaveRef.current = persistScheduledAutoSave;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      // Ungated flush: the controller no-ops when idle, so backgrounding
      // without pending edits costs nothing.
      if (!shouldFlushAutosaveOnAppState(nextState)) return;

      pendingAutoSaveHtmlRef.current = undefined;
      autoSaveAllowEmptyRef.current = true;
      if (!autoSaveControllerRef.current?.flush()) {
        autoSaveAllowEmptyRef.current = false;
      }
    });

    return () => subscription.remove();
  }, []);

  const handleTitleChange = useCallback(
    (text: string) => {
      latestTitleRef.current = text;
      setTitle(text);
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );


  /* ───── Keyboard dismissal ───── */

  const handleDismissKeyboard = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Blur EVERY possible first responder, not just the rich-text editor.
    // Dino (build 245) reported Done doing nothing; the old handler never
    // blurred the TITLE input, so with the title focused it relied entirely
    // on Keyboard.dismiss() — which can no-op (keyboard-controller installed,
    // and it can never resign the native editor's UITextView, which RN does
    // not track). Blur each responder explicitly; Keyboard.dismiss() stays as
    // belt-and-braces. The native blur is async — swallow rejections so a
    // bridge hiccup can't surface as an unhandled rejection with the keyboard
    // stuck up.
    titleInputRef.current?.blur();
    if (IS_NATIVE_EDITOR) {
      Promise.resolve(editorRef.current?.blur()).catch(() => {
        // Native blur failed — Keyboard.dismiss below is the only fallback.
      });
    } else {
      editor.blur();
    }
    Keyboard.dismiss();
    // Flush (don't cancel) any pending autosave so the latest keystrokes are
    // persisted immediately; editing chrome follows keyboard visibility.
    autoSaveControllerRef.current?.flush();
  }, [editor]);


  /* ───── Navigation ───── */

  const handleBack = useCallback(async () => {
    // Cancel the pending debounce first: the explicit snapshot below is
    // fresher, and a stale-closure flush firing from unmount cleanup could
    // otherwise double-create a brand-new note.
    autoSaveControllerRef.current?.cancel();
    pendingAutoSaveHtmlRef.current = undefined;

    // Save unconditionally. Empty new notes fall through persistCurrentSnapshot
    // unsaved, so backing out of an untouched new note leaves no ghost note.
    const html = await getCurrentEditorHtml();
    const titleVal = latestTitleRef.current;

    persistCurrentSnapshot({
      title: titleVal,
      html,
      newNoteLog: '[NoteDetail] Saved new note on back:',
    });

    router.back();
  }, [router, getCurrentEditorHtml, persistCurrentSnapshot]);

  const handleMinimize = useCallback(async () => {
    if (!gate() || isMinimizingRef.current) return;
    isMinimizingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const html = await getCurrentEditorHtml();
      const titleVal = latestTitleRef.current;
      const id = persistCurrentSnapshot({
        title: titleVal,
        html,
        allowEmpty: true,
        newNoteLog: '[NoteDetail] Saved note before minimizing to dock:',
      });
      if (!id) {
        isMinimizingRef.current = false;
        return;
      }

      const dockCopy = buildNoteDraftDockPreview({
        title: titleVal,
        plainText: stripHtml(html),
      });
      setDraftDock({
        noteId: id,
        title: dockCopy.title,
        preview: dockCopy.preview,
        updatedAt: new Date().toISOString(),
      });

      // Cancel — NOT flush — the pending autosave: the allowEmpty snapshot
      // above already captured the freshest state; a flush would double-write.
      autoSaveControllerRef.current?.cancel();
      pendingAutoSaveHtmlRef.current = undefined;
      setSaveState('idle');
      IS_NATIVE_EDITOR ? editorRef.current?.blur() : editor.blur();
      // Return to wherever the user came from — the draft dock floats above
      // every tab (rendered in (tabs)/_layout), so no tab switch is needed.
      router.back();
    } catch (error) {
      isMinimizingRef.current = false;
      logger.error('[NoteDetail] Failed to minimize note:', error);
    }
  }, [editor, gate, getCurrentEditorHtml, persistCurrentSnapshot, router, setDraftDock]);


  /* ───── Menu actions ───── */

  /**
   * Ensure the note has been persisted to the store and return its ID.
   * If the note hasn't been saved yet (new/empty), creates it immediately.
   */
  const ensureNoteSaved = useCallback(async (): Promise<string> => {
    if (noteId) return noteId;
    const html = await getCurrentEditorHtml();
    const titleVal = latestTitleRef.current;
    const id = persistCurrentSnapshot({
      title: titleVal,
      html,
      allowEmpty: true,
      newNoteLog: '[NoteDetail] Saved note via menu action:',
    });
    if (!id) {
      throw new Error('Expected note to be persisted before menu action');
    }
    return id;
  }, [noteId, getCurrentEditorHtml, persistCurrentSnapshot]);

  const handleToggleFavorite = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const id = await ensureNoteSaved();
    const currentNote = notes.find((n) => n.id === id);
    if (currentNote) {
      updateNote(id, { isFavorite: !currentNote.isFavorite });
    } else {
      // Note was just created — toggle it to favorite
      updateNote(id, { isFavorite: true });
    }
    setShowMoreMenu(false);
  }, [ensureNoteSaved, notes, updateNote]);

  const handleDelete = useCallback(() => {
    if (!noteId) {
      // Discarding an unsaved note — cancel any pending autosave so the
      // unmount flush can't recreate what the user just threw away.
      autoSaveControllerRef.current?.cancel();
      pendingAutoSaveHtmlRef.current = undefined;
      setShowMoreMenu(false);
      router.back();
      return;
    }

    if (!deleteConfirm) {
      setDeleteConfirm(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      deleteTimeoutRef.current = setTimeout(() => {
        setDeleteConfirm(false);
      }, 3000);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    // Cancel any pending autosave BEFORE deleting — the unmount flush would
    // otherwise resurrect the note via updateNote's resurrect-on-missing path.
    autoSaveControllerRef.current?.cancel();
    pendingAutoSaveHtmlRef.current = undefined;
    deleteNote(noteId);
    setShowMoreMenu(false);
    router.back();
  }, [noteId, deleteConfirm, deleteNote, router]);

  const handleMoveToFolder = useCallback(() => {
    setShowMoreMenu(false);
    setTimeout(() => {
      setShowMoveFolderSheet(true);
    }, 100);
  }, []);

  const handleMoveFolderSelect = useCallback(
    async (folderId: string | null) => {
      const id = await ensureNoteSaved();
      moveNoteToFolder(id, folderId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [ensureNoteSaved, moveNoteToFolder],
  );

  const handleCreateFolderFromSheet = useCallback(() => {
    if (!gate()) return;
    setShowCreateFolderSheet(true);
  }, [gate]);

  const handleCreateFolderSubmit = useCallback(
    async (name: string, color?: string) => {
      if (!gate()) return;
      const folderId = addFolder(name, color);
      const id = await ensureNoteSaved();
      moveNoteToFolder(id, folderId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [addFolder, ensureNoteSaved, moveNoteToFolder, gate],
  );


  /* ───── Scripture actions ───── */

  const handleScripturePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!IS_NATIVE_EDITOR) {
      // tentap: save cursor position before the sheet steals focus
      editor.injectJS(`window.__savedSelection = window.editor.state.selection.anchor;`);
    }
    // Native editor: scripture insert uses remount approach, no cursor save needed
    setShowScriptureSheet(true);
  }, [editor]);

  const handleScriptureInsert = useCallback(
    (data: { reference: string; text: string; scriptureRef: ScriptureRef }) => {
      setPendingScriptureInsert({
        reference: data.reference,
        text: data.text,
      });

      // Check for duplicate before updating state — avoids calling
      // updateNote inside the setScriptureRefs updater, which would
      // trigger a Zustand store mutation during React's render phase
      const exists = scriptureRefs.some(
        (r) =>
          r.bookId === data.scriptureRef.bookId &&
          r.chapter === data.scriptureRef.chapter &&
          r.verse === data.scriptureRef.verse &&
          r.verseEnd === data.scriptureRef.verseEnd,
      );

      if (!exists) {
        const updated = [...scriptureRefs, data.scriptureRef];
        setScriptureRefs(updated);

        if (noteId) {
          updateNote(noteId, { scriptureRefs: updated });
        }
      }

      setShowScriptureSheet(false);
    },
    [noteId, updateNote, scriptureRefs],
  );

  /** Auto-detect: native editor fires onScriptureRefs on every text change.
   *  Parse rawText → ScriptureRef, deduplicate, and persist new ones. */
  const handleNativeScriptureRefs = useCallback(
    (event: UnfoldEditorScriptureRefsEvent) => {
      const nativeRefs = event.nativeEvent.refs;

      const parsed: ScriptureRef[] = [];
      for (const nr of nativeRefs) {
        const route = referenceToRoute(nr.rawText);
        if (!route) continue;
        parsed.push({
          reference: routeToReference(route) ?? nr.rawText,
          bookId: route.bookId,
          chapter: route.chapter,
          verse: route.verse,
          verseEnd: route.verseEnd,
        });
      }

      // Only add refs not already tracked (additive — never removes manual refs)
      const newRefs = parsed.filter(
        (p) =>
          !scriptureRefs.some(
            (r) =>
              r.bookId === p.bookId &&
              r.chapter === p.chapter &&
              r.verse === p.verse &&
              r.verseEnd === p.verseEnd,
          ),
      );

      if (newRefs.length === 0) return;

      const updated = [...scriptureRefs, ...newRefs];
      setScriptureRefs(updated);

      if (noteId) {
        updateNote(noteId, { scriptureRefs: updated });
      }
    },
    [scriptureRefs, noteId, updateNote],
  );


  /* ───── Toolbar actions ───── */

  const handleUndo = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    IS_NATIVE_EDITOR ? editorRef.current?.undo() : editor.undo();
  }, [editor]);

  const handleRedo = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    IS_NATIVE_EDITOR ? editorRef.current?.redo() : editor.redo();
  }, [editor]);

  const handleBold = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    IS_NATIVE_EDITOR ? editorRef.current?.toggleBold() : editor.toggleBold();
  }, [editor]);

  const handleItalic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    IS_NATIVE_EDITOR ? editorRef.current?.toggleItalic() : editor.toggleItalic();
  }, [editor]);

  const handleBulletList = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (IS_NATIVE_EDITOR) {
      // Pull fresh state from native — `didChangeSelectionAt` doesn't
      // always fire on tap-to-reposition, so the cached selectionState
      // can be stale. This guarantees correct toggle direction.
      editorRef.current?.getSelectionState().then((state) => {
        const command = getNativeListCommand(state.listType, 'bullet');
        command.kind === 'clear-list'
          ? editorRef.current?.clearList()
          : editorRef.current?.setList(command.value);
      });
    } else {
      editor.toggleBulletList();
    }
  }, [editor]);

  const handleOrderedList = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (IS_NATIVE_EDITOR) {
      editorRef.current?.getSelectionState().then((state) => {
        const command = getNativeListCommand(state.listType, 'ordered');
        command.kind === 'clear-list'
          ? editorRef.current?.clearList()
          : editorRef.current?.setList(command.value);
      });
    } else {
      editor.toggleOrderedList();
    }
  }, [editor]);

  const handleTaskList = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (IS_NATIVE_EDITOR) {
      editorRef.current?.getSelectionState().then((state) => {
        const command = getNativeListCommand(state.listType, 'checklist');
        command.kind === 'clear-list'
          ? editorRef.current?.clearList()
          : editorRef.current?.setList(command.value);
      });
    } else {
      editor.toggleTaskList();
    }
  }, [editor]);

  const handleHeading = useCallback((level: 'h1' | 'h2' | 'h3') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (IS_NATIVE_EDITOR) {
      editorRef.current?.getSelectionState().then((state) => {
        const next = getNativeBlockTypeCommand(state.blockType, level);
        editorRef.current?.setBlockType(next);
      });
    } else {
      const numericLevel = level === 'h1' ? 1 : level === 'h2' ? 2 : 3;
      editor.toggleHeading(numericLevel);
    }
  }, [editor]);

  const handleH1 = useCallback(() => handleHeading('h1'), [handleHeading]);
  const handleH2 = useCallback(() => handleHeading('h2'), [handleHeading]);
  const handleH3 = useCallback(() => handleHeading('h3'), [handleHeading]);

  const handleIndent = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    IS_NATIVE_EDITOR ? editorRef.current?.indentList() : editor.sink();
  }, [editor]);

  const handleOutdent = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    IS_NATIVE_EDITOR ? editorRef.current?.outdentList() : editor.lift();
  }, [editor]);


  /* ───── Derived data ───── */

  // Use the reactive note from the store for metadata display (reflects live updates)
  const liveNote = useMemo(
    () => (noteId ? notes.find((n) => n.id === noteId) : undefined),
    [notes, noteId],
  );

  const currentDate = formatDate(
    liveNote?.createdAt ?? existingNote?.createdAt ?? new Date().toISOString(),
  );
  const currentFolder = useMemo(
    () => {
      const fId = liveNote?.folderId ?? existingNote?.folderId;
      return fId ? folders.find((f) => f.id === fId) : undefined;
    },
    [liveNote?.folderId, existingNote?.folderId, folders],
  );
  const isFavorite = liveNote?.isFavorite ?? existingNote?.isFavorite ?? false;

  // Get live scripture refs from the store
  const liveScriptureRefs = liveNote?.scriptureRefs ?? existingNote?.scriptureRefs ?? [];


  /* ───── Render: Note not found ───── */

  if (params.noteId && !existingNote && !isNewNote) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.flex} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.headerButton}
              activeOpacity={0.6}
            >
              <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
            </TouchableOpacity>
          </View>
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Note not found.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }


  /* ───── Render: Main screen ───── */

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.headerButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
          </TouchableOpacity>

          <View style={styles.headerRight}>
            {isKeyboardUp && (
              <>
                <TouchableOpacity
                  onPress={handleUndo}
                  disabled={!IS_NATIVE_EDITOR && !editorState.canUndo}
                  style={styles.headerButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={!IS_NATIVE_EDITOR && !editorState.canUndo ? 1 : 0.6}
                  accessibilityRole="button"
                  accessibilityLabel="Undo note edit"
                  accessibilityState={{ disabled: !IS_NATIVE_EDITOR && !editorState.canUndo }}
                >
                  <ArrowCounterClockwiseIcon
                    size={21}
                    color={!IS_NATIVE_EDITOR && !editorState.canUndo ? colors.textHint : colors.textMuted}
                    weight="light"
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleRedo}
                  disabled={!IS_NATIVE_EDITOR && !editorState.canRedo}
                  style={styles.headerButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={!IS_NATIVE_EDITOR && !editorState.canRedo ? 1 : 0.6}
                  accessibilityRole="button"
                  accessibilityLabel="Redo note edit"
                  accessibilityState={{ disabled: !IS_NATIVE_EDITOR && !editorState.canRedo }}
                >
                  <ArrowClockwiseIcon
                    size={21}
                    color={!IS_NATIVE_EDITOR && !editorState.canRedo ? colors.textHint : colors.textMuted}
                    weight="light"
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleMinimize}
                  style={styles.headerButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={1}
                  accessibilityRole="button"
                  accessibilityLabel="Minimize note"
                >
                  <ArrowsInSimpleIcon size={22} color={colors.textMuted} weight="light" />
                </TouchableOpacity>

                {/* Done — dismisses the keyboard and flushes the pending save */}
                <TouchableOpacity
                  onPress={handleDismissKeyboard}
                  style={styles.actionButton}
                  activeOpacity={1}
                  accessibilityRole="button"
                  accessibilityLabel="Done editing"
                >
                  <Text style={[styles.actionText, { color: colors.accent }]}>
                    Done
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* More menu button */}
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowMoreMenu(!showMoreMenu);
                setDeleteConfirm(false);
              }}
              style={styles.headerButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.6}
              testID="note-more-button"
              accessibilityRole="button"
              accessibilityLabel="More options"
            >
              <DotsThreeIcon size={24} color={colors.textMuted} weight="light" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Backdrop for more menu ── */}
        {showMoreMenu && (
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => {
              setShowMoreMenu(false);
              setDeleteConfirm(false);
            }}
          />
        )}

        {/* ── More menu dropdown ── */}
        {showMoreMenu && (
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.fast).easing(Ease.out)}
            style={[
              styles.moreMenu,
              {
                backgroundColor: colors.backgroundElevated,
                borderColor: colors.border,
                shadowColor: '#000',
              },
            ]}
          >
            {/* Favorite toggle */}
            <TouchableOpacity
              onPress={handleToggleFavorite}
              style={styles.menuItem}
              activeOpacity={0.6}
              accessible
              testID="note-more-toggle-favorite"
              accessibilityRole="button"
              accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              accessibilityHint={isFavorite ? 'Removes this note from favorites' : 'Marks this note as a favorite'}
              accessibilityState={{ selected: isFavorite }}
            >
              <StarIcon
                size={16}
                color={isFavorite ? colors.accent : colors.textMuted}
                weight={isFavorite ? 'fill' : 'light'}
              />
              <Text style={[styles.menuItemText, { color: colors.text }]}>
                {isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              </Text>
            </TouchableOpacity>

            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            {/* Move to folder */}
            <TouchableOpacity
              onPress={handleMoveToFolder}
              style={styles.menuItem}
              activeOpacity={0.6}
              accessible
              testID="note-more-move-to-folder"
              accessibilityRole="button"
              accessibilityLabel={currentFolder ? `Move note from ${currentFolder.name}` : 'Move to folder'}
              accessibilityHint="Opens the folder picker for this note"
            >
              <FolderSimpleIcon size={16} color={colors.textMuted} weight="light" />
              <Text style={[styles.menuItemText, { color: colors.text }]}>
                {currentFolder ? `Folder: ${currentFolder.name}` : 'Move to folder'}
              </Text>
            </TouchableOpacity>

            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            {/* Delete / Discard */}
            <TouchableOpacity
              onPress={handleDelete}
              style={styles.menuItem}
              activeOpacity={0.6}
              accessible
              testID="note-more-delete"
              accessibilityRole="button"
              accessibilityLabel={deleteConfirm ? 'Confirm delete note' : noteId ? 'Delete note' : 'Discard note'}
              accessibilityHint={deleteConfirm ? 'Deletes this note. Tap outside the menu to cancel.' : 'Shows a confirmation before deleting'}
            >
              <TrashIcon size={16} color={colors.error} weight="light" />
              <Text style={[styles.menuItemText, { color: colors.error }]}>
                {deleteConfirm ? 'Tap again to delete' : noteId ? 'Delete note' : 'Discard note'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Metadata row ── */}
        <View style={styles.metadataRow}>
          <Text style={[styles.metadataText, { color: colors.textHint }]}>
            {currentDate}
          </Text>
          {currentFolder && (
            <>
              <Text style={[styles.metadataDot, { color: colors.textHint }]}>
                {'\u00B7'}
              </Text>
              {currentFolder.color && (
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: currentFolder.color,
                  }}
                />
              )}
              <Text style={[styles.metadataText, { color: colors.textHint }]}>
                {currentFolder.name}
              </Text>
            </>
          )}
          {isFavorite && (
            <>
              <Text style={[styles.metadataDot, { color: colors.textHint }]}>
                {'\u00B7'}
              </Text>
              <StarIcon size={12} color={colors.accent} weight="fill" />
            </>
          )}

          <NoteDetailSaveIndicator
            isKeyboardUp={isKeyboardUp}
            saveState={saveState}
            reducedMotion={!!reducedMotion}
            textColor={colors.textMuted}
            iconColor={colors.textMuted}
          />
        </View>

        {/* ── Scripture references (keyboard down only, non-native — native uses chip strip) ── */}
        {!isKeyboardUp && !IS_NATIVE_EDITOR && liveScriptureRefs.length > 0 && (
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
            exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
            style={styles.scriptureSection}
          >
            {liveScriptureRefs.map((ref, idx) => (
              <View
                key={`${ref.reference}-${idx}`}
                style={[
                  styles.scriptureCard,
                  {
                    backgroundColor: alpha(colors.accent, 0.05),
                    borderColor: alpha(colors.accent, 0.18),
                  },
                ]}
              >
                <ScriptureRefPill reference={ref} size="regular" />
              </View>
            ))}
          </Animated.View>
        )}

        {/* ── Title — always a TextInput (read-only for non-premium) ── */}
        <TextInput
          ref={titleInputRef}
          testID="note-title-input"
          value={title}
          onChangeText={handleTitleChange}
          placeholder="Title"
          placeholderTextColor={colors.textMuted}
          editable={isPremium}
          autoFocus={isNewNote && isPremium}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          style={[
            styles.titleInput,
            { color: colors.text, fontFamily: titleFontFamily },
          ]}
          returnKeyType="next"
          onSubmitEditing={() => {
            IS_NATIVE_EDITOR ? editorRef.current?.focus() : editor.focus('end');
          }}
          blurOnSubmit={false}
          maxLength={200}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          accessibilityLabel="Note title"
          accessibilityHint={isPremium ? 'Edits the note title' : 'Shows the note title'}
          accessibilityValue={{ text: title }}
        />

        {/* ── Accent divider ── */}
        <View
          style={[
            styles.titleDivider,
            getTitleDividerPresentation({
              isKeyboardUp,
              accentColor: colors.accent,
              borderColor: colors.border,
            }),
          ]}
        />

        {/* ── Editor body ── */}
        <View style={[styles.editorContainer, { backgroundColor: colors.background }]}>
          {IS_NATIVE_EDITOR ? (
            <>
            <UnfoldEditor
              ref={editorRef}
              initialHtml={nativeInitialContent}
              onChangeHtml={(e: UnfoldEditorChangeHtmlEvent) => {
                latestHtmlRef.current = e.nativeEvent.html;
                scheduleAutoSave(e.nativeEvent.html);
              }}
              onScriptureRefs={handleNativeScriptureRefs}
              onEditorFocus={() => { /* native editor focused */ }}
              onEditorBlur={() => { /* native editor blurred */ }}
              onEditorSelectionChange={(e: { nativeEvent: UnfoldEditorSelectionState }) => {
                // Skip setState when only `start`/`end` changed (rapid typing
                // at a fixed format). Nothing in this screen reads them and
                // the toolbar only re-renders off the formatting fields — so
                // short-circuiting here avoids ~60 React re-renders per second
                // during fast typing (root cause of the visible micro-jump).
                const next = e.nativeEvent;
                setSelectionState(prev =>
                  shouldReuseSelectionFormattingState(prev, next)
                    ? prev
                    : next,
                );
              }}
              placeholder={'Start writing\u2026'}
              editable={isPremium}
              autoFocus={shouldAutoFocus && !isNewNote}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              colorScheme={isDark ? 'dark' : 'light'}
              keyboardToolbarHeight={nativeEditorToolbarInset}
              bottomOverlayInset={nativeEditorBottomOverlayInset}
              accessibilityLabel="Note body"
              accessibilityHint={isPremium ? 'Edits the note body' : 'Shows the note body'}
              accessibilityValue={{ text: stripHtml(latestHtmlRef.current) }}
              style={styles.richText}
            />
            {nativeEditorMasked && (
              <Animated.View
                exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
              />
            )}
            </>
          ) : (
            <>
              <RichText
                editor={editor}
                style={[styles.richText, { backgroundColor: colors.background }]}
              />
              {/* Solid overlay hides WebView white flash */}
              {!editorReady && (
                <Animated.View
                  exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
                />
              )}
            </>
          )}
        </View>

        {/* ── Tags section (keyboard down only) ── */}
        {!isKeyboardUp && liveNote && liveNote.tags.length > 0 && (
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
            exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
            style={styles.tagsSection}
          >
            <Text style={[styles.tagsSectionLabel, { color: colors.textSubtle }]}>
              Tags
            </Text>
            <View style={styles.tagsWrap}>
              {liveNote.tags.map((tag) => (
                <View
                  key={tag}
                  style={[
                    styles.tagPill,
                    {
                      backgroundColor: alpha(colors.accent, 0.08),
                      borderColor: alpha(colors.accent, 0.20),
                    },
                  ]}
                >
                  <Text style={[styles.tagPillText, { color: colors.accent }]}>
                    #{tag}
                  </Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {/* ── Toolbar (whenever the keyboard is up) ── */}
        {isPremium && (IS_NATIVE_EDITOR || editorState.isReady) && isKeyboardUp && (
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.toolbarRow}
            >
              <ToolbarButton
                onPress={handleBold}
                active={IS_NATIVE_EDITOR ? selectionState.bold : editorState.isBoldActive}
                label="Bold"
              >
                <TextBIcon
                  size={18}
                  color={(IS_NATIVE_EDITOR ? selectionState.bold : editorState.isBoldActive) ? colors.accent : colors.textMuted}
                  weight="regular"
                />
              </ToolbarButton>

              <ToolbarButton
                onPress={handleItalic}
                active={IS_NATIVE_EDITOR ? selectionState.italic : editorState.isItalicActive}
                label="Italic"
              >
                <TextItalicIcon
                  size={18}
                  color={(IS_NATIVE_EDITOR ? selectionState.italic : editorState.isItalicActive) ? colors.accent : colors.textMuted}
                  weight="regular"
                />
              </ToolbarButton>

              <ToolbarButton
                onPress={handleH1}
                active={IS_NATIVE_EDITOR ? selectionState.blockType === 'h1' : editorState.headingLevel === 1}
                label="Heading 1"
              >
                <TextHOneIcon
                  size={18}
                  color={(IS_NATIVE_EDITOR ? selectionState.blockType === 'h1' : editorState.headingLevel === 1) ? colors.accent : colors.textMuted}
                  weight="regular"
                />
              </ToolbarButton>

              <ToolbarButton
                onPress={handleH2}
                active={IS_NATIVE_EDITOR ? selectionState.blockType === 'h2' : editorState.headingLevel === 2}
                label="Heading 2"
              >
                <TextHTwoIcon
                  size={18}
                  color={(IS_NATIVE_EDITOR ? selectionState.blockType === 'h2' : editorState.headingLevel === 2) ? colors.accent : colors.textMuted}
                  weight="regular"
                />
              </ToolbarButton>

              <ToolbarButton
                onPress={handleH3}
                active={IS_NATIVE_EDITOR ? selectionState.blockType === 'h3' : editorState.headingLevel === 3}
                label="Heading 3"
              >
                <TextHThreeIcon
                  size={18}
                  color={(IS_NATIVE_EDITOR ? selectionState.blockType === 'h3' : editorState.headingLevel === 3) ? colors.accent : colors.textMuted}
                  weight="regular"
                />
              </ToolbarButton>

              <View style={[styles.toolbarSep, { backgroundColor: colors.border }]} />

              <ToolbarButton
                onPress={handleBulletList}
                active={IS_NATIVE_EDITOR ? selectionState.listType === 'bullet' : editorState.isBulletListActive}
                label="Bullet list"
              >
                <ListBulletsIcon
                  size={18}
                  color={(IS_NATIVE_EDITOR ? selectionState.listType === 'bullet' : editorState.isBulletListActive) ? colors.accent : colors.textMuted}
                  weight="light"
                />
              </ToolbarButton>

              <ToolbarButton
                onPress={handleOrderedList}
                active={IS_NATIVE_EDITOR ? selectionState.listType === 'ordered' : editorState.isOrderedListActive}
                label="Numbered list"
              >
                <ListNumbersIcon
                  size={18}
                  color={(IS_NATIVE_EDITOR ? selectionState.listType === 'ordered' : editorState.isOrderedListActive) ? colors.accent : colors.textMuted}
                  weight="light"
                />
              </ToolbarButton>

              <ToolbarButton
                onPress={handleTaskList}
                active={IS_NATIVE_EDITOR ? selectionState.listType === 'checklist' : editorState.isTaskListActive}
                label="Checklist"
              >
                <CheckSquareIcon
                  size={18}
                  color={(IS_NATIVE_EDITOR ? selectionState.listType === 'checklist' : editorState.isTaskListActive) ? colors.accent : colors.textMuted}
                  weight="light"
                />
              </ToolbarButton>

              <View style={[styles.toolbarSep, { backgroundColor: colors.border }]} />

              <ToolbarButton
                onPress={handleIndent}
                label="Indent"
                disabled={IS_NATIVE_EDITOR ? false : (!editorState.canSink && !editorState.canSinkTaskListItem)}
              >
                <ArrowLineRightIcon
                  size={18}
                  color={
                    !IS_NATIVE_EDITOR && !editorState.canSink && !editorState.canSinkTaskListItem
                      ? colors.textHint
                      : colors.textMuted
                  }
                  weight="light"
                />
              </ToolbarButton>

              <ToolbarButton
                onPress={handleOutdent}
                label="Outdent"
                disabled={IS_NATIVE_EDITOR ? false : (!editorState.canLift && !editorState.canLiftTaskListItem)}
              >
                <ArrowLineLeftIcon
                  size={18}
                  color={
                    !IS_NATIVE_EDITOR && !editorState.canLift && !editorState.canLiftTaskListItem
                      ? colors.textHint
                      : colors.textMuted
                  }
                  weight="light"
                />
              </ToolbarButton>

              <View style={[styles.toolbarSep, { backgroundColor: colors.border }]} />

              <ToolbarButton onPress={handleScripturePress} label="Add scripture">
                <BookBookmarkIcon size={18} color={colors.textMuted} weight="light" />
              </ToolbarButton>
            </ScrollView>
          </View>
        )}
      </SafeAreaView>

      {/* Scripture search bottom sheet */}
      <ScriptureSearchSheet
        visible={showScriptureSheet}
        onClose={() => setShowScriptureSheet(false)}
        onInsert={handleScriptureInsert}
        existingRefs={scriptureRefs}
      />

      {/* Move to Folder sheet */}
      <MoveFolderSheet
        visible={showMoveFolderSheet}
        onClose={() => setShowMoveFolderSheet(false)}
        folders={folders}
        currentFolderId={liveNote?.folderId ?? existingNote?.folderId}
        onSelect={handleMoveFolderSelect}
        onCreateFolder={handleCreateFolderFromSheet}
      />

      <CreateFolderSheet
        visible={showCreateFolderSheet}
        onClose={() => setShowCreateFolderSheet(false)}
        onSubmit={handleCreateFolderSubmit}
      />

      <ExclusiveOfferSheet
        visible={showExclusiveOffer}
        onDismiss={dismissOffer}
        context="churned"
      />
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
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!!disabled}
      style={[
        styles.toolbarButton,
        active && { backgroundColor: colors.accent + '33' },
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
 * Styles
 * ───────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1'],
  },
  actionButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['2'],
    paddingVertical: Spacing['2'],
  },
  actionText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.base,
  },
  moreMenu: {
    position: 'absolute',
    top: 56,
    right: 16,
    width: 240,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: Spacing['1.5'],
    zIndex: 200,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2.5'],
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
  },
  menuItemText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing['4'],
    marginVertical: Spacing['1'],
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1.5'],
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['2'],
    marginBottom: Spacing['1'],
  },
  metadataDot: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
  },
  metadataText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  scriptureSection: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['2'],
    marginBottom: Spacing['1'],
    gap: Spacing['2'],
  },
  scriptureCard: {
    paddingHorizontal: Spacing['3.5'],
    paddingVertical: Spacing['2.5'],
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  titleInput: {
    fontFamily: FontFamily.display,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.3,
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['4'],
    paddingBottom: Spacing['3'],
  },
  titleDivider: {
    width: 40,
    height: 1.5,
    borderRadius: 1,
    marginHorizontal: Spacing['6'],
    marginBottom: Spacing['1'],
  },
  editorContainer: {
    flex: 1,
    position: 'relative',
    paddingHorizontal: Spacing['2'],
  },
  richText: {
    flex: 1,
  },
  tagsSection: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['2'],
    paddingBottom: Spacing['6'],
  },
  tagsSectionLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 0.2,
    marginBottom: Spacing['3'],
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing['2'],
  },
  tagPill: {
    paddingHorizontal: Spacing['3'],
    paddingVertical: 5,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  tagPillText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.xs,
  },
  toolbar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: Platform.OS === 'ios' ? NOTEBOOK_TOOLBAR_BOTTOM_PADDING_IOS : 0,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: NOTEBOOK_TOOLBAR_ROW_HEIGHT,
    paddingHorizontal: Spacing['1.5'],
  },
  toolbarButton: {
    width: 44,
    height: 44,
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
