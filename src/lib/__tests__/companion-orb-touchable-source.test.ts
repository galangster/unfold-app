/**
 * CompanionOrb always rendered a TouchableOpacity with accessibilityRole
 * "button", even for decorative orbs that pass no onPress — VoiceOver
 * announced "Companion orb, button" for something you can't actually press.
 * It should fall back to a plain, non-accessible View when onPress is absent.
 * Ask keeps one decorative orb in the conversation slot.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, '../../components/CompanionOrb.tsx'), 'utf8');

describe('CompanionOrb touchable-only-when-pressable source contract', () => {
  it('only wraps the orb in a TouchableOpacity when onPress is provided', () => {
    expect(source).toMatch(/\{onPress \? \(\s*<TouchableOpacity/);
  });

  it('renders a plain View with no accessibility role/label as the non-pressable fallback', () => {
    const fallbackBlock = source.match(/\) : \([\s\S]{0,200}?\)\}/)?.[0] ?? '';
    expect(fallbackBlock).toContain('<View');
    expect(fallbackBlock).not.toContain('accessibilityRole');
    expect(fallbackBlock).not.toContain('accessibilityLabel');
  });

  it('the Ask screen keeps one non-pressable CompanionOrb paused when the tab is hidden', () => {
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
    expect(askIndex.match(/<CompanionOrb/g)).toHaveLength(1);
    expect(askIndex).toMatch(/<CompanionOrb\s+accentColor=\{colors\.accent\}\s+size=\{32\}\s+isActive=\{isStreaming\}\s+active=\{isFocused\}\s*\/>/);
  });
});
