import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { RichMessageText, VERSE_PILL_PAD } from '../RichMessageText';

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('@/components/ui', () => ({ alpha: (color: string) => color }));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ isDark: true, colors: { accent: '#D4AF37', text: '#EEE' } }),
}));

/** Every string leaf in render order — the text a reader would actually see. */
function visibleText(json: any): string {
  if (json == null || typeof json === 'boolean') return '';
  if (typeof json === 'string') return json;
  if (Array.isArray(json)) return json.map(visibleText).join('');
  return visibleText(json.children);
}

function render(text: string) {
  let tree: any;
  act(() => {
    tree = renderer.create(<RichMessageText text={text} onVersePress={jest.fn()} />);
  });
  return tree;
}

describe('RichMessageText verse pills', () => {
  it('pads the reference with narrow no-break spaces so punctuation stays attached', () => {
    const source = 'Elijah heard it in 1 Kings 19:11-12? Then read Psalm 46:10, and rest.';
    const tree = render(source);

    const pills = tree.root
      .findAllByType(Text)
      .filter((node: any) => node.props.accessibilityRole === 'button');
    expect(pills.map((node: any) => node.props.children.join(''))).toEqual([
      `${VERSE_PILL_PAD}1 Kings 19:11-12${VERSE_PILL_PAD}`,
      `${VERSE_PILL_PAD}Psalm 46:10${VERSE_PILL_PAD}`,
    ]);

    // The glue is the only thing added: with it stripped, the rendered text
    // is exactly the source text — no ordinary spaces sneak in around pills.
    expect(visibleText(tree.toJSON()).split(VERSE_PILL_PAD).join('')).toBe(source);
  });

  it('uses a non-breaking glue character, never a word space', () => {
    expect(VERSE_PILL_PAD).toBe('\u202F');
    expect(/\s/.test(VERSE_PILL_PAD)).toBe(true); // still whitespace for layout
    expect(VERSE_PILL_PAD).not.toBe(' ');
  });
});
