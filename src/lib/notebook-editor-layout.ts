export const NOTEBOOK_TOOLBAR_ROW_HEIGHT = 44;
export const NOTEBOOK_TOOLBAR_BOTTOM_PADDING_IOS = 4;
export const NOTEBOOK_TOOLBAR_TOTAL_HEIGHT =
  NOTEBOOK_TOOLBAR_ROW_HEIGHT + NOTEBOOK_TOOLBAR_BOTTOM_PADDING_IOS;

export type SelectionFormattingState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  code: boolean;
  hasLink: boolean;
  linkUrl: string | null;
  blockType: string;
  listType: string | null;
  start: number;
  end: number;
};

export function getNativeEditorToolbarInset({
  isEditing,
  isKeyboardUp,
}: {
  isEditing: boolean;
  isKeyboardUp: boolean;
}): number {
  return isEditing && isKeyboardUp ? NOTEBOOK_TOOLBAR_TOTAL_HEIGHT : 0;
}

export function shouldReuseSelectionFormattingState(
  prev: SelectionFormattingState,
  next: SelectionFormattingState,
): boolean {
  return (
    prev.bold === next.bold &&
    prev.italic === next.italic &&
    prev.underline === next.underline &&
    prev.strikethrough === next.strikethrough &&
    prev.code === next.code &&
    prev.hasLink === next.hasLink &&
    prev.linkUrl === next.linkUrl &&
    prev.blockType === next.blockType &&
    prev.listType === next.listType
  );
}
