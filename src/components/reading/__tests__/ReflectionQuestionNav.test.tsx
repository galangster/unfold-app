import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';

const renderer = require('react-test-renderer');
const { act } = renderer;

import { ReflectionQuestionNav } from '../ReflectionQuestionNav';

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      text: '#FFFFFF',
      textSubtle: '#777777',
      border: '#333333',
    },
  }),
}));

describe('ReflectionQuestionNav', () => {
  it('uses 44-point targets and accessible names for Previous, Next, and Done', () => {
    let tree: any;

    act(() => {
      tree = renderer.create(
        <ReflectionQuestionNav
          questionIndex={0}
          questionCount={3}
          onPrevious={jest.fn()}
          onNext={jest.fn()}
          onDone={jest.fn()}
        />
      );
    });

    const previous = tree!.root.findByProps({ testID: 'reflection-nav-previous' });
    const next = tree!.root.findByProps({ testID: 'reflection-nav-next' });
    const done = tree!.root.findByProps({ testID: 'reflection-nav-done' });

    expect(previous.props.accessibilityLabel).toBe('Previous question');
    expect(next.props.accessibilityLabel).toBe('Next question');
    expect(done.props.accessibilityLabel).toBe('Done');
    expect(done.props.accessibilityHint).toBe('Saves this answer and closes the keyboard.');
    expect(previous.props.disabled).toBe(true);
    expect(next.props.disabled).toBe(false);

    act(() => tree!.unmount());
  });

  it('keeps compact 44-point targets in the toolbar source', () => {
    const source = readFileSync(
      join(__dirname, '../ReflectionQuestionNav.tsx'),
      'utf8'
    );
    expect(source).toContain('minWidth: 44');
    expect(source).toContain('minHeight: 44');
  });
});
