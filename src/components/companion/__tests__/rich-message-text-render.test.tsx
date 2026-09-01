import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { RichMessageText } from '../RichMessageText';

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
  it('renders the bare reference inside the pill so surrounding punctuation stays attached', () => {
    const source = 'Elijah heard it in 1 Kings 19:11-12? Then read Psalm 46:10, and rest.';
    const tree = render(source);

    const pills = tree.root
      .findAllByType(Text)
      .filter((node: any) => node.props.accessibilityRole === 'button');
    expect(pills.map((node: any) => node.props.children)).toEqual(['1 Kings 19:11-12', 'Psalm 46:10']);

    // No spacing characters are inserted around the pills: the rendered
    // text is exactly the source text.
    expect(visibleText(tree.toJSON())).toBe(source);
  });

  it('gives the pill its own horizontal padding instead', () => {
    const tree = render('Romans 5:8 stands on its own.');
    const [pill] = tree.root
      .findAllByType(Text)
      .filter((node: any) => node.props.accessibilityRole === 'button');
    expect(pill.props.style.paddingHorizontal).toBeGreaterThan(0);
  });
});
