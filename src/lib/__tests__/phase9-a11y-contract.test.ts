import { readFileSync } from 'fs';
import { join } from 'path';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

function extractBlock(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('Phase 9 accessibility source contracts', () => {
  it('keeps the closed CompanionDrawer out of touch and accessibility traversal', () => {
    const source = readSource('src/components/companion/CompanionDrawer.tsx');
    const drawerPanel = extractBlock(source, '{/* Drawer panel */}', '</Animated.View>\n    </>');

    expect(drawerPanel).toContain("pointerEvents={isOpen ? 'auto' : 'none'}");
    expect(drawerPanel).toContain('accessibilityElementsHidden={!isOpen}');
    expect(drawerPanel).toContain("importantForAccessibility={isOpen ? 'yes' : 'no-hide-descendants'}");
  });

  it('keeps Companion action controls accessible and non-system', () => {
    const source = readSource('src/components/companion/CompanionDrawer.tsx');
    const actionPanel = extractBlock(source, 'function ConversationActionPanel', '// ── CompanionDrawer');

    expect(source).toContain('accessibilityLabel={`Conversation options for ${title}`}');
    expect(source).toContain('onLongPress={handleLongPress}');
    expect(actionPanel).toContain('accessibilityRole="button"');
    expect(actionPanel).toContain('accessibilityState={{ disabled: !canSaveRename }}');
    expect(actionPanel).toContain('accessibilityLabel="Permanently delete conversation"');
    expect(source).not.toContain('ActionSheetIOS');
    expect(source).not.toContain('Alert.prompt');
    expect(source).toContain('Search conversation titles');
    expect(source).toContain('No conversations match that title');
    expect(source).toContain('accessibilityLabel="Close history"');
    expect(source).toContain('accessibilityLabel="Close options"');
    expect(source).toContain('accessibilityRole="header"');
    expect(source).toContain('Chats');
    expect(source).toContain('New Chat');
    expect(source).toContain('numberOfLines={2}');
    expect(source).toContain('searchClear');
    expect(source).toContain('width: 44');
    expect(source).toContain('height: 44');
    expect(source).toContain('accessibilityElementsHidden={activeActionConversation != null}');
    expect(source).toContain("importantForAccessibility={activeActionConversation ? 'no-hide-descendants' : 'auto'}");
    expect(source).toContain('keyboardShouldPersistTaps="handled"');
    expect(actionPanel).toContain('<Sheet visible onClose={onClose}');
    expect(source).toContain('Keyboard.dismiss');
    expect(source).toContain('handleDrawerNewChat');
    expect(source).not.toContain('onClose();\n            onNewChat();');
    expect(actionPanel).not.toContain('KeyboardAvoidingView');
  });

  it('keeps touched reader/settings controls on the shared 44pt accessible-control contract', () => {
    const appearanceSource = readSource('src/components/reader/ReaderAppearanceControls.tsx');
    const libraryRowSource = readSource('src/components/reader/ReaderLibraryRow.tsx');
    const bibleSheetSource = readSource('src/components/bible/ReadingSettingsSheet.tsx');

    expect(appearanceSource).toContain('minHeight: 44');
    expect(appearanceSource).toContain('width: 44');
    expect(appearanceSource).toContain('height: 44');
    expect(appearanceSource).toContain('accessibilityRole="button"');
    expect(appearanceSource).toContain('accessibilityLabel={accessibilityLabel}');
    expect(appearanceSource).toContain('accessibilityState={{ selected }}');
    expect(appearanceSource).toContain('accessibilityState={{ disabled: false }}');
    expect(appearanceSource).toContain('accessibilityRole="adjustable"');

    expect(libraryRowSource).toContain('minHeight: 44');
    expect(libraryRowSource).toContain('accessibilityRole="button"');
    expect(libraryRowSource).toContain('accessibilityLabel={accessibilityLabel');
    expect(libraryRowSource).toContain('accessibilityState={{ disabled: false }}');

    expect(bibleSheetSource).toContain('minHeight: 44');
    expect(bibleSheetSource).toContain('accessibilityRole="button"');
    expect(bibleSheetSource).toContain('accessibilityState={{ selected }}');
  });
});
