/* eslint-disable @typescript-eslint/no-require-imports, import/first, @typescript-eslint/no-explicit-any */
import React from 'react';

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'Light' },
  impactAsync: jest.fn(),
}));
import { DarkColors } from '@/constants/colors';

const renderer = require('react-test-renderer');

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      backgroundElevated: '#141210',
      text: '#F5F0EB',
    },
  }),
}));

jest.mock('@/components/CompanionOrb', () => ({
  CompanionOrb: () => null,
}));

import { TodayCompanionBubble } from '../TodayCompanionBubble';

describe('TodayCompanionBubble', () => {
  it('renders the speech tail beside the glass blur', () => {
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(
        <TodayCompanionBubble colors={DarkColors} text="Stay with what is in front of you." />,
      );
    });

    expect(tree.root.findAll((node: { type?: unknown; props?: { testID?: string } }) => typeof node.type === 'string' && node.props?.testID === 'today-companion-tail')).toHaveLength(1);
    expect(tree.root.findAll((node: { type?: unknown; props?: { testID?: string } }) => typeof node.type === 'string' && node.props?.testID === 'today-companion-glass-blur')).toHaveLength(1);
  });
});
