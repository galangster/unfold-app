import {
  getNoteDetailSaveIndicatorLayout,
} from '../note-detail-save-indicator';

describe('note-detail save indicator layout', () => {
  it('reserves a stable slot while the keyboard is up even when autosave is idle', () => {
    expect(getNoteDetailSaveIndicatorLayout({ isKeyboardUp: true, saveState: 'idle' })).toEqual({
      showSlot: true,
      showLabel: false,
      slotWidth: 56,
      slotMinHeight: 16,
    });
  });

  it('shows the label inside the same reserved slot when autosave completes', () => {
    expect(getNoteDetailSaveIndicatorLayout({ isKeyboardUp: true, saveState: 'saved' })).toEqual({
      showSlot: true,
      showLabel: true,
      slotWidth: 56,
      slotMinHeight: 16,
    });
  });

  it('renders no slot while the keyboard is down', () => {
    expect(getNoteDetailSaveIndicatorLayout({ isKeyboardUp: false, saveState: 'saved' })).toEqual({
      showSlot: false,
      showLabel: false,
      slotWidth: 56,
      slotMinHeight: 16,
    });
  });
});
