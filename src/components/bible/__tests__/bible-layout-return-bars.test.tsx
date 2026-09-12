import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { BibleTabReturnBars } from '@/app/(tabs)/(bible)/_layout';
import {
  clearQaMethodReadingReturn,
  setQaMethodReadingReturn,
} from '@/lib/qa-method-reading-return';

jest.mock('expo-router', () => ({
  Stack: Object.assign(
    ({ children }: { children?: React.ReactNode }) => children ?? null,
    { Screen: () => null },
  ),
}));

jest.mock('@/lib/scripture-practice-feature', () => ({
  isScripturePracticeEnabled: () => true,
}));

jest.mock('@/components/bible/DevotionalReturnBar', () => ({
  DevotionalReturnBar: () => {
    const { View } = require('react-native');
    return <View testID="devotional-return-bar" />;
  },
}));

jest.mock('@/components/bible/QaMethodReadingReturnBar', () => ({
  QaMethodReadingReturnBar: () => {
    const { View } = require('react-native');
    return <View testID="qa-method-reading-return-bar" />;
  },
}));

describe('Bible tab return bars', () => {
  beforeEach(() => {
    clearQaMethodReadingReturn();
  });

  it('shows only the sample bar while a QA return is active and restores the production bar after dismiss', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<BibleTabReturnBars />);
    });
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'devotional-return-bar')).toHaveLength(1);
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'qa-method-reading-return-bar')).toHaveLength(0);

    await act(async () => {
      expect(setQaMethodReadingReturn('lectio_divina')).toBe(true);
    });
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'qa-method-reading-return-bar')).toHaveLength(1);
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'devotional-return-bar')).toHaveLength(0);

    await act(async () => {
      clearQaMethodReadingReturn();
    });
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'devotional-return-bar')).toHaveLength(1);
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'qa-method-reading-return-bar')).toHaveLength(0);
  });
});
