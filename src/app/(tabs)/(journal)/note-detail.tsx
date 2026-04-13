import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  AccessibilityInfo,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import * as Haptics from 'expo-haptics';
import {
  CaretLeftIcon,
  DotsThreeIcon,
  TrashIcon,
  StarIcon,
  FolderSimpleIcon,
  CheckIcon,
  BookBookmarkIcon,
  ListBulletsIcon,
  ListNumbersIcon,
  CheckSquareIcon,
  TextBIcon,
  TextItalicIcon,
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  QuotesIcon,
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
  BridgeExtension,
} from '@10play/tentap-editor';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, type Note, type NoteCategory, type ScriptureRef } from '@/lib/store';
import { ScriptureSearchSheet } from '@/components/notebook/ScriptureSearchSheet';
import { MoveFolderSheet } from '@/components/notebook/MoveFolderSheet';
import { isHtmlContent } from '@/components/notebook/html-utils';
import { logger } from '@/lib/logger';
import { alpha } from '@/components/ui';
import { useCreationGate } from '@/hooks/useCreationGate';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';


/* ─────────────────────────────────────────────────────────
 * Scripture ACK bridge
 *
 * Fire-and-forget `injectJS` has no error channel. When the WebView is
 * reloading (tentap force-reloads once on iOS init), in a transitional
 * state, or the injected chain throws, the RN side never sees the drop
 * — state says "done", the document is unchanged, no retry possible. We
 * fix that by having the injected JS post a structured ack back via
 * `window.ReactNativeWebView.postMessage` and routing it through this
 * BridgeExtension to a module-level handler ref owned by the currently
 * mounted note-detail instance.
 *
 * See:
 *   - ~/vault/gotchas/tentap-editor-bridge-quirks.md
 *   - ~/vault/standards/ack-before-clearing-pending-state.md
 * ───────────────────────────────────────────────────────── */
type ScriptureAckPayload = {
  ok: boolean;
  reference: string;
  attempts: number;
  error?: string;
};

type ScriptureAckMessage = {
  type: 'scriptureInserted';
  payload: ScriptureAckPayload;
};

const scriptureAckHandlerRef: {
  current: ((payload: ScriptureAckPayload) => void) | null;
} = { current: null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ScriptureAckBridge = new BridgeExtension<any, any, ScriptureAckMessage>({
  forceName: 'ScriptureAck',
  onEditorMessage: (message) => {
    if (
      message &&
      typeof message === 'object' &&
      message.type === 'scriptureInserted' &&
      message.payload &&
      typeof message.payload === 'object' &&
      typeof message.payload.ok === 'boolean' &&
      typeof message.payload.reference === 'string' &&
      typeof message.payload.attempts === 'number'
    ) {
      scriptureAckHandlerRef.current?.(message.payload);
    }
    return false; // let tentap's default handling continue
  },
});

const MAX_SCRIPTURE_INSERT_ATTEMPTS = 3;
const SCRIPTURE_INSERT_TIMEOUT_MS = 3000;


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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEditorCSS(colors: any, isEditing: boolean): string {
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
      cursor: ${isEditing ? 'pointer' : 'default'};
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
    /* Blockquote — also serves as the scripture callout when populated by
       the scripture insertion flow. Two paragraphs (verse + reference) get
       the callout treatment; single-paragraph user blockquotes stay simple
       italic quotes via the :last-child:not(:first-child) guard.

       Design constraint: NO transparency. All surface and text colors are
       solid hex values from the design system. The lifted feel comes from
       backgroundElevated (a real second surface), not an alpha overlay. */
    blockquote {
      border-left: 3px solid ${colors.accent};
      padding: 14px 18px;
      margin: 16px 0;
      background-color: ${colors.backgroundElevated};
      border-radius: 0 10px 10px 0;
      color: ${colors.text};
    }
    blockquote p {
      margin: 0;
      font-style: italic;
      line-height: 1.55;
      color: ${colors.text};
    }
    blockquote p + p {
      margin-top: 10px;
    }
    /* Scripture reference: the second paragraph in a multi-paragraph
       blockquote. Upright, smaller, slightly tracked — the typical
       "— Reference" cap on a callout. Differentiated from the verse
       text by size, weight, and style (NOT by opacity), so the design
       contains no transparent values. Single-paragraph blockquotes
       (where p is both first and last) are not affected. */
    blockquote p:last-child:not(:first-child) {
      font-style: normal;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.2px;
      color: ${colors.text};
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
 * Unified Note Screen — reads AND edits in one view
 *
 * Existing notes open in READ mode (editable: false).
 * New notes (no noteId) open in EDIT mode (editable: true).
 * Toggle between modes with Edit/Done header button.
 * Uses @10play/tentap-editor for both read + edit rendering.
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

  const { isPremium, gate, showExclusiveOffer, dismissOffer } = useCreationGate();

  // Store selectors
  const notes = useUnfoldStore((s) => s.notes);
  const addNote = useUnfoldStore((s) => s.addNote);
  const updateNote = useUnfoldStore((s) => s.updateNote);
  const deleteNote = useUnfoldStore((s) => s.deleteNote);
  const folders = useUnfoldStore((s) => s.folders);
  const addFolder = useUnfoldStore((s) => s.addFolder);
  const moveNoteToFolder = useUnfoldStore((s) => s.moveNoteToFolder);

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

  // Editing state — new notes start in edit mode, existing in read mode
  // Non-premium users cannot create or edit notes (defense-in-depth behind navigation gate)
  const isNewNote = !params.noteId;
  const shouldStartEditing = isPremium && (isNewNote || params.startEditing === 'true');
  const [isEditing, setIsEditing] = useState(shouldStartEditing);

  // Title state
  const [title, setTitle] = useState(existingNote?.title ?? '');
  const latestTitleRef = useRef(existingNote?.title ?? '');

  // Auto-save indicator
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedResetRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Menu state
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMoveFolderSheet, setShowMoveFolderSheet] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Scripture search & insert state
  const [showScriptureSheet, setShowScriptureSheet] = useState(false);
  const [pendingScriptureInsert, setPendingScriptureInsert] = useState<{
    reference: string;
    text: string;
    status: 'queued' | 'firing';
    attempts: number;
  } | null>(null);
  const [scriptureRefs, setScriptureRefs] = useState<ScriptureRef[]>(
    existingNote?.scriptureRefs ?? [],
  );

  // Latest content ref for Done button
  const latestContentRef = useRef<{ title: string; content: string }>({
    title: existingNote?.title ?? '',
    content: existingNote?.content ?? '',
  });

  // Convert legacy plain-text/markdown to HTML for TipTap
  const initialContent = existingNote?.content
    ? isHtmlContent(existingNote.content)
      ? existingNote.content
      : legacyMarkdownToHtml(existingNote.content)
    : '<p></p>';

  /* ───── TipTap editor bridge ───── */

  // IMPORTANT: avoidIosKeyboard is FALSE because we manage keyboard padding
  // ourselves (accounting for the custom toolbar height). The library's internal
  // padding logic does NOT know about our toolbar and would set paddingBottom to
  // just keyboardHeight+10, causing text to scroll behind the toolbar after ~12 lines.
  const editor = useEditorBridge({
    avoidIosKeyboard: false,
    autofocus: false,
    editable: shouldStartEditing,
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
      ScriptureAckBridge,
    ],
    onChange: () => {
      if (isEditingRef.current) {
        scheduleAutoSave();
      }
    },
  });

  const editorState = useBridgeState(editor);
  const { keyboardHeight, isKeyboardUp } = useKeyboard();

  // Keep a ref for isEditing so the onChange callback always has the latest value
  const isEditingRef = useRef(isEditing);
  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  // Overlay covers the WebView until CSS is painted
  const [editorReady, setEditorReady] = useState(false);

  // Fallback: remove overlay after 1.5s
  useEffect(() => {
    const fallback = setTimeout(() => {
      setEditorReady(true);
      editor.injectCSS(buildEditorCSS(colors, isEditingRef.current));
    }, 1500);
    return () => clearTimeout(fallback);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Inject CSS once editor is ready
  useEffect(() => {
    if (!editorState.isReady) return;
    editor.injectCSS(buildEditorCSS(colors, isEditing));
    // Delay removing overlay until CSS has had time to paint
    setTimeout(() => {
      setEditorReady(true);
    }, 120);

    // If new note, auto-focus the editor after it's ready
    if (shouldStartEditing && isNewNote) {
      setTimeout(() => {
        editor.focus('end');
      }, 300);
    }
  }, [editorState.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manage keyboard padding ourselves since avoidIosKeyboard is false.
  // We account for the custom toolbar (48px) that sits above the keyboard.
  // Without this, text scrolls behind the toolbar after ~12 lines.
  const TOOLBAR_TOTAL_HEIGHT = 48; // 44px row + 4px paddingBottom
  useEffect(() => {
    if (!editorState.isReady) return;
    if (isEditing && isKeyboardUp && keyboardHeight > 0) {
      // Toolbar sits above the keyboard, so total occlusion is keyboard + toolbar
      const totalPadding = keyboardHeight + TOOLBAR_TOTAL_HEIGHT + 20;
      editor.injectJS(`
        (function() {
          var doc = document.querySelector('.ProseMirror');
          if (doc) doc.style.paddingBottom = '${totalPadding}px';
        })();
      `);
      editor.updateScrollThresholdAndMargin(totalPadding);
    } else if (isKeyboardUp && keyboardHeight > 0) {
      // Read mode with keyboard (e.g., search) — just keyboard padding
      const padding = keyboardHeight + 10;
      editor.injectJS(`
        (function() {
          var doc = document.querySelector('.ProseMirror');
          if (doc) doc.style.paddingBottom = '${padding}px';
        })();
      `);
      editor.updateScrollThresholdAndMargin(padding);
    } else {
      editor.injectJS(`
        (function() {
          var doc = document.querySelector('.ProseMirror');
          if (doc) doc.style.paddingBottom = '0px';
        })();
      `);
      editor.updateScrollThresholdAndMargin(0);
    }
  }, [isEditing, isKeyboardUp, keyboardHeight, editorState.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedResetRef.current) clearTimeout(savedResetRef.current);
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    };
  }, []);


  /* ───── Scripture insertion via pending prop ─────
   *
   * Inserts a scripture as a blockquote callout at the user's cursor
   * position. The blockquote contains TWO paragraphs:
   *   1. The verse text (rendered italic via CSS)
   *   2. The reference, prefixed with an em-dash (rendered upright/muted
   *      via `blockquote p:last-child:not(:first-child)` in buildEditorCSS)
   *
   * After the blockquote we insert an EMPTY trailing paragraph so the
   * cursor has a clean landing pad outside the callout — without it,
   * the cursor stays trapped at the end of the reference paragraph and
   * the user's next keystroke extends the reference instead of starting
   * a new line of body text.
   *
   * We use JSON.stringify on the entire content array to escape every
   * special character (quotes, backslashes, unicode) in one step, rather
   * than maintaining a hand-rolled escape function that would silently
   * break on the first verse containing an embedded apostrophe or smart
   * quote we forgot about.
   *
   * Display behavior is intentionally split from data persistence:
   *   - The blockquote is the IN-CONTEXT visual (editable, in the body,
   *     where the user typed it).
   *   - `scriptureRefs[]` (set in handleScriptureInsert) is the SEMANTIC
   *     metadata — used by getNotesForScripture() cross-linking, NoteCard
   *     pill rendering, and the journal search filter. We never delete
   *     that metadata; only the chip strip above the title was removed.
   *     See ~/vault/standards/grep-read-path-when-touching-ui.md
   */

  // Refs used by the scripture insert ACK pipeline. See the ack handler
  // effect below for details on why each one exists.
  const pendingScriptureInsertRef = useRef(pendingScriptureInsert);
  useEffect(() => {
    pendingScriptureInsertRef.current = pendingScriptureInsert;
  }, [pendingScriptureInsert]);

  // Fire-once guard: key is `${reference}|${attempts}`. Prevents the fire
  // effect from double-firing the same attempt even if deps re-run.
  const scriptureFiredForRef = useRef<string | null>(null);

  // Timeout handle for the ack deadline. Cleared on ack arrival or
  // unmount. If it fires, we retry (or fail once we hit MAX attempts).
  const scriptureTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // scheduleAutoSave is declared later in this component. We mirror it
  // into a ref so the ack handler (registered once on mount) can always
  // reach the latest callback without re-registering.
  const scheduleAutoSaveRef = useRef<(() => void) | null>(null);

  // Register the module-level ack handler. The handler reads the latest
  // pending state via refs (no stale closures) and uses a `reference +
  // attempts` match to ignore late acks from previous attempts. On
  // successful ack it clears state and fires auto-save. On failure ack it
  // alerts the user and clears state. On unmount it only clears the
  // module-level ref if it still points at this instance's handler —
  // that way A's cleanup can't stomp B's handler when two instances
  // transiently coexist during navigation.
  useEffect(() => {
    const handler = (payload: ScriptureAckPayload) => {
      const pending = pendingScriptureInsertRef.current;
      if (!pending) return;
      if (
        pending.reference !== payload.reference ||
        pending.attempts !== payload.attempts ||
        pending.status !== 'firing'
      ) {
        return; // stale ack — belongs to a previous attempt or wrong insert
      }
      if (scriptureTimeoutRef.current) {
        clearTimeout(scriptureTimeoutRef.current);
        scriptureTimeoutRef.current = undefined;
      }
      if (payload.ok) {
        setPendingScriptureInsert(null);
        scriptureFiredForRef.current = null;
        scheduleAutoSaveRef.current?.();
        return;
      }
      logger.error('[Scripture] Insert failed on webview side', {
        reference: payload.reference,
        attempts: payload.attempts,
        error: payload.error,
      });
      Alert.alert(
        'Scripture insert failed',
        'Could not add the scripture to your note. Please try again.',
      );
      setPendingScriptureInsert(null);
      scriptureFiredForRef.current = null;
    };
    scriptureAckHandlerRef.current = handler;
    return () => {
      if (scriptureAckHandlerRef.current === handler) {
        scriptureAckHandlerRef.current = null;
      }
    };
  }, []);

  // Cleanup any pending ack timeout on unmount so a stale timer can't
  // fire against a dead component.
  useEffect(() => {
    return () => {
      if (scriptureTimeoutRef.current) {
        clearTimeout(scriptureTimeoutRef.current);
        scriptureTimeoutRef.current = undefined;
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingScriptureInsert || !editorState.isReady) return;
    if (pendingScriptureInsert.status !== 'queued') return;
    const { reference, text, attempts } = pendingScriptureInsert;
    const nextAttempts = attempts + 1;
    const fireKey = `${reference}|${nextAttempts}`;
    if (scriptureFiredForRef.current === fireKey) return;
    scriptureFiredForRef.current = fireKey;

    // Normalize whitespace in the verse text — TipTap paragraphs render as
    // a single line, so collapse any embedded newlines from the API to spaces.
    const verseText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const referenceLine = `\u2014 ${reference}`;

    // Use JSON.stringify on the full content array to safely escape every
    // special character. JSON output is a strict subset of JS literal
    // syntax, so it embeds cleanly inside the WebView script template.
    const contentJson = JSON.stringify([
      {
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: verseText }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: referenceLine }],
          },
        ],
      },
      // Trailing empty paragraph — the cursor lands here after insertion,
      // outside the blockquote, so the user can keep typing without their
      // next keystroke being captured by the reference paragraph.
      { type: 'paragraph' },
    ]);

    // JSON literals for the values we interpolate into the WebView script.
    // `referenceJs` and `attemptsJs` are embedded verbatim so the injected
    // JS can include them in its ack payload.
    const referenceJs = JSON.stringify(reference);
    const attemptsJs = JSON.stringify(nextAttempts);

    // Restore the saved cursor position before inserting so the blockquote
    // lands where the user's cursor was, not at the top of the document.
    // Falls back to the end of the document if no position was saved.
    //
    // The injected JS posts a structured ack via
    // `ReactNativeWebView.postMessage` — `ScriptureAckBridge.onEditorMessage`
    // routes it to the module-level handler ref registered by the ack
    // handler effect above. See
    // ~/vault/standards/ack-before-clearing-pending-state.md.
    editor.injectJS(`
      (function() {
        var reference = ${referenceJs};
        var attempts = ${attemptsJs};
        try {
          var preDocSize = window.editor.state.doc.content.size;
          var savedSelection = window.__savedSelection;
          var pos = typeof savedSelection === 'number'
            ? savedSelection
            : preDocSize - 1;
          var maxPos = preDocSize > 0 ? preDocSize - 1 : 0;
          if (pos > maxPos) pos = maxPos;
          if (pos < 0) pos = 0;

          var chainResult = window.editor
            .chain()
            .focus()
            .setTextSelection(pos)
            .insertContent(${contentJson})
            .run();

          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'scriptureInserted',
            payload: {
              ok: !!chainResult,
              reference: reference,
              attempts: attempts,
              error: chainResult ? undefined : 'chain().run() returned false'
            }
          }));
        } catch (e) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'scriptureInserted',
              payload: {
                ok: false,
                reference: reference,
                attempts: attempts,
                error: String(e)
              }
            }));
          } catch (postErr) { /* no-op */ }
        } finally {
          delete window.__savedSelection;
        }
      })();
    `);

    // Transition state to 'firing' and schedule an ack deadline. The ack
    // handler clears this timeout on arrival; otherwise we retry (or fail
    // once we hit MAX_SCRIPTURE_INSERT_ATTEMPTS).
    setPendingScriptureInsert({
      reference,
      text,
      status: 'firing',
      attempts: nextAttempts,
    });

    if (scriptureTimeoutRef.current) {
      clearTimeout(scriptureTimeoutRef.current);
    }
    scriptureTimeoutRef.current = setTimeout(() => {
      scriptureTimeoutRef.current = undefined;
      const pending = pendingScriptureInsertRef.current;
      if (
        !pending ||
        pending.reference !== reference ||
        pending.attempts !== nextAttempts ||
        pending.status !== 'firing'
      ) {
        return;
      }
      if (nextAttempts >= MAX_SCRIPTURE_INSERT_ATTEMPTS) {
        logger.error('[Scripture] Insert timed out, giving up', {
          reference,
          attempts: nextAttempts,
        });
        Alert.alert(
          'Scripture insert failed',
          'Could not add the scripture to your note. Please try again.',
        );
        setPendingScriptureInsert(null);
        scriptureFiredForRef.current = null;
        return;
      }
      logger.warn('[Scripture] Insert timed out, retrying', {
        reference,
        attempt: nextAttempts,
      });
      setPendingScriptureInsert({
        reference,
        text,
        status: 'queued',
        attempts: nextAttempts,
      });
    }, SCRIPTURE_INSERT_TIMEOUT_MS);
  }, [pendingScriptureInsert, editorState.isReady]); // eslint-disable-line react-hooks/exhaustive-deps


  /* ───── Debounced auto-save ───── */

  const scheduleAutoSave = useCallback(() => {
    if (!gate()) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (savedResetRef.current) clearTimeout(savedResetRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      const html = await editor.getHTML();
      const titleVal = latestTitleRef.current;

      if (!titleVal.trim() && (!html || html === '<p></p>')) return;

      // Update the content ref
      latestContentRef.current = { title: titleVal, content: html };

      setSaveState('saving');

      if (noteId) {
        updateNote(noteId, {
          title: titleVal,
          content: html,
          category,
        });
      } else {
        const id = addNote({
          title: titleVal,
          content: html,
          category,
          tags: [],
          isFavorite: false,
          scriptureRefs,
          devotionalId: params.devotionalId,
          dayNumber: params.dayNumber ? Number(params.dayNumber) : undefined,
          bibleBookId: params.bookId ? Number(params.bookId) : undefined,
          bibleChapter: params.chapter ? Number(params.chapter) : undefined,
          folderId: initialFolderIdRef.current,
        });
        setNoteId(id);
        logger.log('[NoteDetail] Auto-saved new note:', id);
      }

      setTimeout(() => {
        setSaveState('saved');
        AccessibilityInfo.announceForAccessibility('Note saved');
        savedResetRef.current = setTimeout(() => setSaveState('idle'), 2000);
      }, 150);
    }, 800);
  }, [editor, noteId, category, scriptureRefs, params, addNote, updateNote, gate]);

  // Mirror scheduleAutoSave into a ref so the ack handler effect (which is
  // registered once on mount with empty deps) can always reach the latest
  // callback without re-registering and without stale closures.
  useEffect(() => {
    scheduleAutoSaveRef.current = scheduleAutoSave;
  }, [scheduleAutoSave]);

  const handleTitleChange = useCallback(
    (text: string) => {
      latestTitleRef.current = text;
      setTitle(text);
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );


  /* ───── Mode switching ───── */

  const handleEdit = useCallback(() => {
    if (!gate()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsEditing(true);
    editor.setEditable(true);
    editor.injectCSS(buildEditorCSS(colors, true));
    setTimeout(() => {
      editor.focus('end');
    }, 100);
  }, [editor, colors, gate]);


  const handleDone = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Get the final content from the editor
    const html = await editor.getHTML();
    const titleVal = latestTitleRef.current;

    // Persist
    if (titleVal.trim() || (html && html !== '<p></p>')) {
      if (noteId) {
        updateNote(noteId, {
          title: titleVal,
          content: html,
          category,
          scriptureRefs,
        });
      } else {
        const id = addNote({
          title: titleVal,
          content: html,
          category,
          tags: [],
          isFavorite: false,
          scriptureRefs,
          devotionalId: params.devotionalId,
          dayNumber: params.dayNumber ? Number(params.dayNumber) : undefined,
          bibleBookId: params.bookId ? Number(params.bookId) : undefined,
          bibleChapter: params.chapter ? Number(params.chapter) : undefined,
          folderId: initialFolderIdRef.current,
        });
        setNoteId(id);
        logger.log('[NoteDetail] Created new note on Done:', id);
      }
    } else if (!noteId) {
      // Empty new note — just go back
      router.back();
      return;
    }

    // Switch to read mode
    editor.blur();
    editor.setEditable(false);
    editor.injectCSS(buildEditorCSS(colors, false));
    setIsEditing(false);

    // Clear any pending save timers
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveState('idle');
  }, [editor, noteId, category, scriptureRefs, params, addNote, updateNote, router, colors]);


  /* ───── Navigation ───── */

  const handleBack = useCallback(async () => {
    // If editing, save before going back
    if (isEditingRef.current) {
      const html = await editor.getHTML();
      const titleVal = latestTitleRef.current;

      if (titleVal.trim() || (html && html !== '<p></p>')) {
        if (noteId) {
          updateNote(noteId, {
            title: titleVal,
            content: html,
            category,
            scriptureRefs,
          });
        } else {
          const id = addNote({
            title: titleVal,
            content: html,
            category,
            tags: [],
            isFavorite: false,
            scriptureRefs,
            devotionalId: params.devotionalId,
            dayNumber: params.dayNumber ? Number(params.dayNumber) : undefined,
            bibleBookId: params.bookId ? Number(params.bookId) : undefined,
            bibleChapter: params.chapter ? Number(params.chapter) : undefined,
            folderId: initialFolderIdRef.current,
          });
          setNoteId(id);
          logger.log('[NoteDetail] Saved new note on back:', id);
        }
      }
    }

    router.back();
  }, [editor, noteId, category, scriptureRefs, params, addNote, updateNote, router]);


  /* ───── Menu actions ───── */

  /**
   * Ensure the note has been persisted to the store and return its ID.
   * If the note hasn't been saved yet (new/empty), creates it immediately.
   */
  const ensureNoteSaved = useCallback(async (): Promise<string> => {
    if (noteId) return noteId;
    const html = await editor.getHTML();
    const titleVal = latestTitleRef.current;
    const id = addNote({
      title: titleVal,
      content: html || '<p></p>',
      category,
      tags: [],
      isFavorite: false,
      scriptureRefs,
      devotionalId: params.devotionalId,
      dayNumber: params.dayNumber ? Number(params.dayNumber) : undefined,
      bibleBookId: params.bookId ? Number(params.bookId) : undefined,
      bibleChapter: params.chapter ? Number(params.chapter) : undefined,
      folderId: initialFolderIdRef.current,
    });
    setNoteId(id);
    logger.log('[NoteDetail] Saved note via menu action:', id);
    return id;
  }, [noteId, editor, category, scriptureRefs, params, addNote]);

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
    Alert.prompt(
      'New Folder',
      'Enter a name for the new folder.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async (name?: string) => {
            const trimmed = name?.trim();
            if (!trimmed) return;
            const folderId = addFolder(trimmed);
            const id = await ensureNoteSaved();
            moveNoteToFolder(id, folderId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
      'plain-text',
      '',
      'default',
    );
  }, [addFolder, ensureNoteSaved, moveNoteToFolder, gate]);


  /* ───── Scripture actions ───── */

  const handleScripturePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Save the current cursor position before the sheet opens and steals focus.
    // Without this, .focus() defaults to the start of the document on re-entry.
    editor.injectJS(`window.__savedSelection = window.editor.state.selection.anchor;`);
    setShowScriptureSheet(true);
  }, [editor]);

  const handleScriptureInsert = useCallback(
    (data: { reference: string; text: string; scriptureRef: ScriptureRef }) => {
      // Reset the fire-once guard so a repeat insert of the same reference
      // (e.g. after a previous successful insertion) isn't blocked by a
      // stale key from the prior run.
      scriptureFiredForRef.current = null;
      setPendingScriptureInsert({
        reference: data.reference,
        text: data.text,
        status: 'queued',
        attempts: 0,
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


  /* ───── Toolbar actions ───── */

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


  /* ───── Derived data ───── */

  // Use the reactive note from the store for metadata display (reflects live updates)
  const liveNote = useMemo(
    () => (noteId ? notes.find((n) => n.id === noteId) : undefined),
    [notes, noteId],
  );

  const displayTitle = title.trim() || 'Untitled';
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
            {/* Edit / Done toggle */}
            {isEditing ? (
              <TouchableOpacity
                onPress={handleDone}
                style={styles.actionButton}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel="Done editing"
              >
                <Text style={[styles.actionText, { color: colors.accent }]}>
                  Done
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleEdit}
                style={styles.actionButton}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel="Edit note"
              >
                <Text style={[styles.actionText, { color: colors.accent }]}>
                  Edit
                </Text>
              </TouchableOpacity>
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
                {currentFolder.name.toUpperCase()}
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

          {/* Auto-save indicator (shown in edit mode) */}
          {isEditing && saveState === 'saved' && (
            <View style={styles.saveIndicatorSpacer} />
          )}
          {isEditing && saveState === 'saved' && (
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

        {/* ── Title ── */}
        {/* NOTE: There used to be a "scripture references" chip strip here
            that displayed reference-only pills above the title in read
            mode. It was the proximate cause of the bug where inserted
            scriptures appeared "above the journal entry, outside of the
            writing context, with only the reference visible." Scriptures
            now render in-context as blockquote callouts via the TipTap
            insertion path (see useEffect above) — that's the user's
            mental model: scripture appears where they typed it.

            The semantic `scriptureRefs[]` data is still persisted on the
            note (set in handleScriptureInsert) and read by:
              - getNotesForScripture() for Bible→Notes cross-linking
              - NoteCard.tsx pill on note list cards
              - journal index search filter
            We removed the rendering, NOT the data. */}
        {isEditing ? (
          <TextInput
            value={title}
            onChangeText={handleTitleChange}
            placeholder="Title"
            placeholderTextColor={colors.textHint}
            editable
            style={[
              styles.titleInput,
              { color: colors.text },
            ]}
            returnKeyType="next"
            onSubmitEditing={() => editor.focus('end')}
            blurOnSubmit={false}
            maxLength={200}
            accessibilityLabel="Note title"
          />
        ) : (
          <TouchableOpacity
            onPress={handleEdit}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Tap to edit note title"
          >
            <Text
              style={[
                styles.titleInput,
                styles.titleInputReadOnly,
                { color: title ? colors.text : colors.textHint },
              ]}
              numberOfLines={3}
            >
              {title || 'Title'}
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Accent divider ── */}
        <View
          style={[
            styles.titleDivider,
            { backgroundColor: isEditing ? colors.border : colors.accent },
            isEditing && { marginHorizontal: 24, height: StyleSheet.hairlineWidth },
          ]}
        />

        {/* ── TipTap rich text body ── */}
        <View style={[styles.editorContainer, { backgroundColor: colors.background }]}>
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
          {/* Tap-to-edit overlay — covers WebView in read mode so taps enter edit mode.
              WebView swallows all touches, so GestureDetector cannot intercept taps.
              This transparent overlay sits above the WebView and captures taps instead. */}
          {!isEditing && editorReady && (
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={handleEdit}
              accessibilityRole="button"
              accessibilityLabel="Tap to edit note"
            />
          )}
        </View>

        {/* ── Tags section (read mode only) ── */}
        {!isEditing && liveNote && liveNote.tags.length > 0 && (
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).easing(Ease.out)}
            style={styles.tagsSection}
          >
            <Text style={[styles.tagsSectionLabel, { color: colors.textSubtle }]}>
              TAGS
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

        {/* ── Toolbar (edit mode only, when keyboard is up) ── */}
        {isEditing && editorState.isReady && isKeyboardUp && (
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
    width: 40,
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
    ...StyleSheet.absoluteFillObject,
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
    fontFamily: FontFamily.mono,
    fontSize: 11,
  },
  metadataText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  saveIndicatorSpacer: {
    flex: 1,
  },
  saveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1'],
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
  titleInputReadOnly: {
    // Make the disabled TextInput look like a regular Text
    opacity: 1,
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
    paddingHorizontal: Spacing['5'],
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
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
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
    paddingBottom: Platform.OS === 'ios' ? Spacing['1'] : Spacing['0'],
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['1.5'],
    height: 44,
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
