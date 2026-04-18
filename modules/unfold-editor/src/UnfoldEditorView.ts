import { requireNativeView } from 'expo';
import type { ViewProps } from 'react-native';
import type { ComponentType, RefAttributes } from 'react';

/**
 * Scripture reference extracted from the editor body. `location`/`length` are
 * the byte offsets into the rendered plain text (same convention as
 * `NSRange`), suitable for positioning chips or navigation cues.
 */
export type UnfoldEditorScriptureRef = {
  rawText: string;
  location: number;
  length: number;
};

export type UnfoldEditorChangeHtmlEvent = {
  nativeEvent: { html: string };
};

export type UnfoldEditorScriptureRefsEvent = {
  nativeEvent: { refs: UnfoldEditorScriptureRef[] };
};

export type UnfoldEditorFocusEvent = {
  nativeEvent: Record<string, never>;
};

/**
 * Formatting + block state at the current cursor / selection start.
 * Inline booleans are suppressed/commandable (e.g. bold=false inside H1).
 */
export type UnfoldEditorSelectionState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  code: boolean;
  hasLink: boolean;
  linkUrl: string | null;
  blockType: UnfoldEditorBlockType;
  listType: UnfoldEditorListType | null;
  start: number;
  end: number;
};

export type UnfoldEditorSelectionChangeEvent = {
  nativeEvent: UnfoldEditorSelectionState;
};

/**
 * Props on the raw native view. Events follow the Expo Modules `onFoo`
 * convention — they are supplied as function props and fired with an
 * `{ nativeEvent }` shape.
 *
 * NOTE: focus/blur events are named `onEditorFocus`/`onEditorBlur` (not
 * `onFocus`/`onBlur`) because React Native already registers `topFocus`
 * and `topBlur` as both direct AND bubbling events — any module declaring
 * them would trip the "Event cannot be both direct and bubbling" invariant.
 */
export type UnfoldEditorKeyboardAppearance = 'default' | 'light' | 'dark';
export type UnfoldEditorColorScheme = 'dark' | 'light';

export type UnfoldEditorViewProps = Omit<ViewProps, 'onFocus' | 'onBlur'> & {
  initialHtml?: string;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
  keyboardAppearance?: UnfoldEditorKeyboardAppearance;
  keyboardToolbarHeight?: number;
  /** Overrides the native view's UIKit trait collection so dynamic colors
   *  resolve against the app's theme, not the system theme. */
  colorScheme?: UnfoldEditorColorScheme;
  onChangeHtml?: (event: UnfoldEditorChangeHtmlEvent) => void;
  onScriptureRefs?: (event: UnfoldEditorScriptureRefsEvent) => void;
  onEditorFocus?: (event: UnfoldEditorFocusEvent) => void;
  onEditorBlur?: (event: UnfoldEditorFocusEvent) => void;
  onEditorSelectionChange?: (event: UnfoldEditorSelectionChangeEvent) => void;
};

export type UnfoldEditorBlockType =
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'blockquote'
  | 'pre';

export type UnfoldEditorListType = 'bullet' | 'ordered' | 'checklist';

/**
 * Imperative handle exposed on the native view ref. Mirrors SPEC §10.B.4 —
 * every command routes to a view-scoped `AsyncFunction` declared inside the
 * `View(UnfoldEditorView.self) { }` block in `UnfoldEditorModule.swift`.
 */
export type UnfoldEditorViewRef = {
  // Bridge proof (Day 5)
  getHtml: () => Promise<string>;
  focus: () => Promise<void>;
  blur: () => Promise<void>;

  // Commands 4–14 (Day 6)
  toggleBold: () => Promise<void>;
  toggleItalic: () => Promise<void>;
  setBlockType: (type: UnfoldEditorBlockType) => Promise<void>;
  setList: (type: UnfoldEditorListType) => Promise<void>;
  clearList: () => Promise<void>;
  toggleChecklist: () => Promise<void>;
  indentList: () => Promise<void>;
  outdentList: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  insertImage: (uri: string) => Promise<void>;

  // Commands 15–17 (Day 7)
  toggleUnderline: () => Promise<void>;
  toggleStrikethrough: () => Promise<void>;
  insertLink: (url: string) => Promise<void>;

  // Selection state (Day 8)
  getSelectionState: () => Promise<UnfoldEditorSelectionState>;
};

const NativeView: ComponentType<UnfoldEditorViewProps & RefAttributes<UnfoldEditorViewRef>> =
  requireNativeView('UnfoldEditor');

export default NativeView;
