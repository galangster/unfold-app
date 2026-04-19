export type NoteDetailSaveState = 'idle' | 'saving' | 'saved';

const SAVE_INDICATOR_SLOT_WIDTH = 56;
const SAVE_INDICATOR_SLOT_MIN_HEIGHT = 16;

export function getNoteDetailSaveIndicatorLayout({
  isEditing,
  saveState,
}: {
  isEditing: boolean;
  saveState: NoteDetailSaveState;
}) {
  return {
    showSlot: isEditing,
    showLabel: isEditing && saveState === 'saved',
    slotWidth: SAVE_INDICATOR_SLOT_WIDTH,
    slotMinHeight: SAVE_INDICATOR_SLOT_MIN_HEIGHT,
  };
}
