import {
  NOTEBOOK_TOOLBAR_TOTAL_HEIGHT,
  getNativeEditorToolbarInset,
  shouldReuseSelectionFormattingState,
} from '../notebook-editor-layout';

describe('notebook editor layout helpers', () => {
  it('exposes the shared notebook toolbar total height', () => {
    expect(NOTEBOOK_TOOLBAR_TOTAL_HEIGHT).toBe(48);
  });

  it('only reserves native toolbar inset while the keyboard is up', () => {
    expect(getNativeEditorToolbarInset({ isKeyboardUp: true })).toBe(48);
    expect(getNativeEditorToolbarInset({ isKeyboardUp: false })).toBe(0);
  });

  it('reuses previous selection state when only the range changed', () => {
    const prev = {
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      code: false,
      hasLink: false,
      linkUrl: null,
      blockType: 'p',
      listType: null,
      start: 10,
      end: 10,
    } as const;

    const next = {
      ...prev,
      start: 11,
      end: 11,
    } as const;

    expect(shouldReuseSelectionFormattingState(prev, next)).toBe(true);
  });

  it('forces a state update when formatting changed', () => {
    const prev = {
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      code: false,
      hasLink: false,
      linkUrl: null,
      blockType: 'p',
      listType: null,
      start: 10,
      end: 10,
    } as const;

    const next = {
      ...prev,
      blockType: 'h1' as const,
      start: 11,
      end: 11,
    };

    expect(shouldReuseSelectionFormattingState(prev, next)).toBe(false);
  });
});
