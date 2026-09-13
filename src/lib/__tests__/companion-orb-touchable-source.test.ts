/**
 * CompanionOrb always rendered a TouchableOpacity with accessibilityRole
 * "button", even for decorative orbs that pass no onPress — VoiceOver
 * announced "Companion orb, button" for something you can't actually press.
 * It should fall back to a plain, non-accessible View when onPress is absent.
 * Ask keeps one decorative orb in the toolbar.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, '../../components/CompanionOrb.tsx'), 'utf8');

describe('CompanionOrb touchable-only-when-pressable source contract', () => {
  it('only wraps the orb in a TouchableOpacity when onPress is provided', () => {
    expect(source).toMatch(/\{onPress \? \(\s*<TouchableOpacity/);
  });

  it('renders a plain View with no accessibility role/label as the non-pressable fallback', () => {
    const fallbackStart = source.indexOf('<View style={{ width: size, height: size }}>');
    const fallbackBlock = source.slice(fallbackStart, fallbackStart + 160);
    expect(fallbackStart).toBeGreaterThan(-1);
    expect(fallbackBlock).toContain('{face}');
    expect(fallbackBlock).not.toContain('accessibilityRole');
    expect(fallbackBlock).not.toContain('accessibilityLabel');
  });

  it('the Ask toolbar keeps one non-pressable CompanionOrb paused when the tab is hidden', () => {
    const typingIndicator = readFileSync(
      join(__dirname, '../../components/companion/TypingIndicator.tsx'),
      'utf8',
    );
    const messageContent = readFileSync(
      join(__dirname, '../../components/companion/CompanionMessageContent.tsx'),
      'utf8',
    );
    const askIndex = readFileSync(join(__dirname, '../../app/(tabs)/(ask)/index.tsx'), 'utf8');

    expect(typingIndicator).not.toContain('CompanionOrb');
    expect(messageContent).not.toContain('CompanionOrb');
    expect(messageContent).toContain('testID="companion-pending-ellipsis"');
    expect(askIndex.match(/<CompanionOrb/g)).toHaveLength(1);
    const toolbarOrb = askIndex.match(/<CompanionOrb\b[\s\S]*?\/>/)?.[0] ?? '';
    expect(toolbarOrb).toContain('size={HEADER_COMPANION_SIZE}');
    expect(toolbarOrb).toContain('thinking={isStreaming}');
    expect(toolbarOrb).toContain('active={isFocused && !drawerOpen}');
    expect(toolbarOrb).not.toContain('onPress');
    expect(askIndex).toContain('const HEADER_COMPANION_SIZE = 64');
    expect(askIndex).toContain('const TOOLBAR_SIDE_SLOT_WIDTH = 84');
    expect(askIndex).not.toContain('showCompanionPresence');
    expect(askIndex).not.toMatch(/isActive=\{isStreaming\}/);
  });
});
