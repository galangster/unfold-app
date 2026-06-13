import * as fs from 'fs';
import * as path from 'path';

/**
 * Contract tests for the Journal hub screen's de-slop changes (PR4 Tier-2):
 *   #12 — folder long-press OS Alert replaced by the branded bottom sheet
 *   #21 — undo toast after note deletion (kept wired)
 *
 * Source-contract style (matches the repo's other journal tests in this dir):
 * we assert on the screen source so the invariants survive refactors without
 * needing a full RN render harness.
 */
const screenSrc = fs.readFileSync(
  path.join(__dirname, '../../app/(tabs)/(journal)/index.tsx'),
  'utf-8',
);

describe('#12 — folder long-press uses the branded sheet, not the OS Alert', () => {
  it('no longer imports React Native Alert', () => {
    // The destructured RN import block must not pull in Alert.
    expect(screenSrc).not.toMatch(/^\s*Alert,\s*$/m);
  });

  it('never calls the stock Alert.alert / Alert.prompt for folder actions', () => {
    expect(screenSrc).not.toContain('Alert.alert');
    expect(screenSrc).not.toContain('Alert.prompt');
  });

  it('long-press opens the branded FolderActionsSheet instead of an Alert', () => {
    expect(screenSrc).toContain('function FolderActionsSheet');
    expect(screenSrc).toContain('<FolderActionsSheet');
    // The long-press handler routes into sheet state, not an Alert.
    expect(screenSrc).toMatch(/handleFolderLongPress[\s\S]*?setFolderForActions\(folder\)/);
  });

  it('reuses the shared branded Sheet primitive (no bespoke modal)', () => {
    expect(screenSrc).toContain("import { alpha, Sheet } from '@/components/ui'");
    expect(screenSrc).toMatch(/<Sheet[\s\S]*?visible=\{visible\}/);
  });

  it('exposes rename, add-subfolder, and delete actions through the sheet', () => {
    expect(screenSrc).toContain('onRename');
    expect(screenSrc).toContain('onAddSubfolder');
    expect(screenSrc).toContain('onDelete');
    // Rename input must exist for keyboard rename parity on Android (Alert.prompt was iOS-only).
    expect(screenSrc).toContain('testID="folder-rename-input"');
  });

  it('keeps the accent caret/selection on the rename input (no blue pixels)', () => {
    expect(screenSrc).toMatch(/folder-rename-input[\s\S]*?selectionColor=\{colors\.accent\}/);
    expect(screenSrc).toMatch(/folder-rename-input[\s\S]*?cursorColor=\{colors\.accent\}/);
  });

  it('uses the destructive token (colors.error) for delete, never a hardcoded red', () => {
    expect(screenSrc).toMatch(/label="Delete folder"[\s\S]*?destructive/);
    expect(screenSrc).toContain('colors.error');
    expect(screenSrc).not.toMatch(/color:\s*['"]red['"]/);
  });

  it('preserves the folder-delete undo wiring (delete pushes an undo action)', () => {
    expect(screenSrc).toMatch(/handleFolderDelete[\s\S]*?prepareJournalFolderDelete/);
    expect(screenSrc).toMatch(/handleFolderDelete[\s\S]*?plan\.undoAction/);
  });
});

describe('#21 — note deletion shows an undo toast (not silent)', () => {
  it('deleting a note pushes a note undo action before removing it', () => {
    expect(screenSrc).toMatch(
      /handleNoteDelete[\s\S]*?setUndoActions\(\(prev\) => \[\.\.\.prev, \{ type: 'note', note \}\]\)[\s\S]*?deleteNote\(note\.id\)/,
    );
  });

  it('renders the branded UndoToast with an Undo action and a finalize timer', () => {
    expect(screenSrc).toContain('<UndoToast');
    expect(screenSrc).toContain('onUndo={handleUndoAction}');
    // The auto-dismiss timer is what finalizes the delete if not undone.
    expect(screenSrc).toMatch(/handleNoteDelete[\s\S]*?setTimeout\([\s\S]*?setUndoActions\(\[\]\)/);
  });

  it('shows a "Note deleted" message for single note deletions', () => {
    expect(screenSrc).toContain("'Note deleted'");
  });
});
