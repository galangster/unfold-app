import * as React from 'react';

import NativeView, {
  type UnfoldEditorBlockType,
  type UnfoldEditorListType,
  type UnfoldEditorViewProps,
  type UnfoldEditorViewRef,
} from './UnfoldEditorView';

/**
 * Public component for the native notebook editor. Wraps the raw native
 * view and re-exposes the full imperative command surface (§10.B.4) through
 * a `useImperativeHandle`.
 *
 * Phase B §10.B.6 rule: `initialHtml` is applied exactly once on first
 * mount. Pushing a new value later is a no-op — to replace content,
 * unmount and remount.
 */
export type UnfoldEditorProps = UnfoldEditorViewProps;
export type UnfoldEditorRef = UnfoldEditorViewRef;
export type {
  UnfoldEditorBlockType,
  UnfoldEditorListType,
  UnfoldEditorKeyboardAppearance,
} from './UnfoldEditorView';

const UnfoldEditor = React.forwardRef<UnfoldEditorRef, UnfoldEditorProps>(
  function UnfoldEditor(props, ref) {
    const viewRef = React.useRef<UnfoldEditorViewRef>(null);

    React.useImperativeHandle(
      ref,
      () => ({
        getHtml: async () => (await viewRef.current?.getHtml()) ?? '',
        focus: async () => {
          await viewRef.current?.focus();
        },
        blur: async () => {
          await viewRef.current?.blur();
        },
        toggleBold: async () => {
          await viewRef.current?.toggleBold();
        },
        toggleItalic: async () => {
          await viewRef.current?.toggleItalic();
        },
        setBlockType: async (type: UnfoldEditorBlockType) => {
          await viewRef.current?.setBlockType(type);
        },
        setList: async (type: UnfoldEditorListType) => {
          await viewRef.current?.setList(type);
        },
        clearList: async () => {
          await viewRef.current?.clearList();
        },
        toggleChecklist: async () => {
          await viewRef.current?.toggleChecklist();
        },
        indentList: async () => {
          await viewRef.current?.indentList();
        },
        outdentList: async () => {
          await viewRef.current?.outdentList();
        },
        undo: async () => {
          await viewRef.current?.undo();
        },
        redo: async () => {
          await viewRef.current?.redo();
        },
        insertImage: async (uri: string) => {
          await viewRef.current?.insertImage(uri);
        },
        toggleUnderline: async () => {
          await viewRef.current?.toggleUnderline();
        },
        toggleStrikethrough: async () => {
          await viewRef.current?.toggleStrikethrough();
        },
        insertLink: async (url: string) => {
          await viewRef.current?.insertLink(url);
        },
      }),
      []
    );

    return <NativeView {...props} ref={viewRef} />;
  }
);

export default UnfoldEditor;
