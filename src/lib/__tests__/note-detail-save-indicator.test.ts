import {
  getNoteDetailSaveIndicatorLayout,
} from '../note-detail-save-indicator';

describe('note-detail save indicator layout', () => {
  it('reserves a stable slot in edit mode even when autosave is idle', () => {
    expect(getNoteDetailSaveIndicatorLayout({ isEditing: true, saveState: 'idle' })).toEqual({
      showSlot: true,
      showLabel: false,
      slotWidth: 56,
      slotMinHeight: 16,
    });
  });

  it('shows the label inside the same reserved slot when autosave completes', () => {
    expect(getNoteDetailSaveIndicatorLayout({ isEditing: true, saveState: 'saved' })).toEqual({
      showSlot: true,
      showLabel: true,
      slotWidth: 56,
      slotMinHeight: 16,
    });
  });

  it('renders no slot outside edit mode', () => {
    expect(getNoteDetailSaveIndicatorLayout({ isEditing: false, saveState: 'saved' })).toEqual({
      showSlot: false,
      showLabel: false,
      slotWidth: 56,
      slotMinHeight: 16,
    });
  });
});
