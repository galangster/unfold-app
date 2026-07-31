import { readFileSync } from 'fs';
import { join } from 'path';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('notebook accessibility source contract', () => {
  it('keeps custom bottom tabs exposed as accessible labeled controls', () => {
    const source = readSource('src/app/(tabs)/_layout.tsx');

    expect(source).toContain('importantForAccessibility="yes"');
    expect(source).toContain('accessibilityRole="button"');
    expect(source).toContain('accessibilityLabel={`${options.tabBarAccessibilityLabel ?? label} tab`}');
    expect(source).toContain('testID={`bottom-tab-${label.toLowerCase()}`}');
  });

  it('keeps notebook more-menu rows targetable by label and test id', () => {
    const source = readSource('src/app/(tabs)/(journal)/note-detail.tsx');

    expect(source).toContain('testID="note-more-toggle-favorite"');
    expect(source).toContain("accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}");
    expect(source).toContain('testID="note-more-move-to-folder"');
    expect(source).toContain("accessibilityLabel={currentFolder ? `Move note from ${currentFolder.name}` : 'Move to folder'}");
    expect(source).toContain('testID="note-more-delete"');
    expect(source).toContain("accessibilityLabel={deleteConfirm ? 'Confirm delete note' : noteId ? 'Delete note' : 'Discard note'}");
  });

  it('uses the shared create-folder sheet for move-sheet folder creation', () => {
    const source = readSource('src/app/(tabs)/(journal)/note-detail.tsx');

    expect(source).toContain("import { CreateFolderSheet } from '@/components/notebook/CreateFolderSheet';");
    expect(source).toContain('<CreateFolderSheet');
    expect(source).toContain('visible={showCreateFolderSheet}');
    expect(source).not.toContain('Alert.prompt(\n      \'New Folder\'');
  });

  it('labels notebook title, body, and create-folder text fields with values', () => {
    const noteDetailSource = readSource('src/app/(tabs)/(journal)/note-detail.tsx');
    const createFolderSource = readSource('src/components/notebook/CreateFolderSheet.tsx');
    const nativeEditorSource = readSource('modules/unfold-editor/ios/UnfoldEditorController.swift');

    expect(noteDetailSource).toContain('accessibilityValue={{ text: title }}');
    expect(noteDetailSource).toContain('accessibilityLabel="Note title"');
    expect(noteDetailSource).toContain('accessibilityLabel="Note body"');
    expect(noteDetailSource).toContain('accessibilityValue={{ text: stripHtml(latestHtmlRef.current) }}');

    expect(createFolderSource).toContain('testID="create-folder-name-input"');
    expect(createFolderSource).toContain("accessibilityLabel={parentFolderName ? 'New subfolder name' : 'New folder name'}");
    expect(createFolderSource).toContain('accessibilityValue={{ text: folderName }}');
    expect(createFolderSource).toContain('onPressIn={() => inputRef.current?.focus()}');
    expect(createFolderSource).toContain('autoFocus');
    expect(createFolderSource).toContain('showSoftInputOnFocus');
    expect(createFolderSource.indexOf('</GestureDetector>')).toBeLessThan(createFolderSource.indexOf('<TextInput\n'));

    expect(nativeEditorSource).toContain('private func refreshEditorAccessibility()');
    expect(nativeEditorSource).toContain('textView.accessibilityLabel = "Note body"');
    expect(nativeEditorSource).toContain('textView.accessibilityValue = value');
  });

  // WR-21: empty-editor prompt reaches VoiceOver; placeholder and save
  // status use readable (muted, not hint-level) contrast.
  it('surfaces the empty-editor prompt and readable placeholder/save-status colors', () => {
    const noteDetailSource = readSource('src/app/(tabs)/(journal)/note-detail.tsx');
    const nativeEditorSource = readSource('modules/unfold-editor/ios/UnfoldEditorController.swift');

    expect(nativeEditorSource).toContain(
      'value = placeholderPrompt.isEmpty ? "Empty" : "Empty. \\(placeholderPrompt)"',
    );

    expect(noteDetailSource).not.toContain('placeholderTextColor={colors.textHint}');
    expect(noteDetailSource).toContain('textColor={colors.textMuted}');
    expect(noteDetailSource).not.toContain('textColor={colors.textHint}');
  });
});
