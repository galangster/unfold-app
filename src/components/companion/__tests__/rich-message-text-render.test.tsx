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

  it('gives the pill at least 6px of horizontal padding and room to breathe vertically', () => {
    const tree = render('See 1 Kings 19:11-12 for the full account.');
    const pill = tree.root
      .findAllByType(Text)
      .find((node: any) => node.props.accessibilityRole === 'button');

    expect(pill.props.style.paddingHorizontal).toBeGreaterThanOrEqual(6);
    expect(pill.props.style.paddingVertical).toBeGreaterThan(0);
    // Line height comfortably taller than the pill's own font size, not a
    // cramped 1x \u2014 the earlier padding-only fix did nothing for tap comfort
    // since nested Text ignores padding on iOS/Android.
    expect(pill.props.style.lineHeight).toBeGreaterThan(pill.props.style.fontSize * 1.4);
  });
});
