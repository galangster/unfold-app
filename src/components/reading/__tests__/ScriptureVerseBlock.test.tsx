/**
 * Devotional scripture block, highlightable by verse. Drives the real store:
 * a verse tap opens the colour row, a colour writes a BibleHighlight the
 * Bible reader would render, Remove takes it back out.
 */
import React from 'react';

import { ScriptureVerseBlock } from '../ScriptureVerseBlock';
import type { VersePassage } from '@/lib/bible-api';
import { useUnfoldStore } from '@/lib/store';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer');
const { act } = renderer;

let mockPolicy: 'granted' | 'denied' = 'granted';
jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => mockPolicy,
}));
jest.mock('@/components/PremiumFeatureSheet', () => {
  const ReactActual = jest.requireActual('react');
  return {
    PremiumFeatureSheet: ({ visible }: { visible: boolean }) =>
      visible ? ReactActual.createElement('PremiumSheet') : null,
  };
});
jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()) }));
jest.mock('@/lib/bug-logger', () => ({ logBugError: jest.fn() }));
jest.mock('@/lib/sync-ids', () => ({
  newId: jest.fn(() => `test-id-${Math.random().toString(36).slice(2, 8)}`),
  compositeId: jest.fn((...parts: unknown[]) => parts.join(':')),
}));
jest.mock('@/lib/mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => store.set(key, value)),
      removeItem: jest.fn((key: string) => store.delete(key)),
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
  };
});
jest.mock('@/components/icons', () => ({ LockSimpleIcon: () => null, XIcon: () => null }));
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'Light' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning' },
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
}));

const passage: VersePassage = {
  bookId: 43,
  bookName: 'John',
  chapter: 3,
  translation: 'BSB',
  verses: [
    { verse: 16, text: 'For God so loved the world.' },
    { verse: 17, text: 'For God did not send His Son to condemn.' },
  ],
};

function render() {
  let root: any;
  act(() => {
    root = renderer.create(
      <ScriptureVerseBlock
        passage={passage}
        textStyle={{ fontFamily: 'Serif', fontSize: 18, lineHeight: 30, color: '#000' }}
        mutedColor="#666"
        isDark={false}
      />,
    );
  });
  return root;
}

const byTestID = (root: any, id: string) => root.root.findAll((n: any) => n.props.testID === id)[0];
const press = (node: any) => act(() => { node.props.onPress(); });

beforeEach(() => {
  mockPolicy = 'granted';
  act(() => { useUnfoldStore.getState().reset(); });
});

describe('ScriptureVerseBlock', () => {
  it('shows the colour row only after a verse is selected', () => {
    const root = render();
    expect(byTestID(root, 'scripture-verse-actions')).toBeUndefined();
    press(byTestID(root, 'scripture-verse-16'));
    expect(byTestID(root, 'scripture-verse-actions')).toBeDefined();
    expect(byTestID(root, 'scripture-highlight-remove')).toBeUndefined();
  });

  it('writes a Bible highlight for the selected verse, then removes it', () => {
    const root = render();
    press(byTestID(root, 'scripture-verse-17'));
    press(byTestID(root, 'scripture-highlight-color-green'));

    const [h] = useUnfoldStore.getState().bibleHighlights;
    expect(h).toMatchObject({
      bookId: 43, bookName: 'John', chapter: 3, verseStart: 17, verseEnd: 17,
      color: 'green', translation: 'BSB', text: 'For God did not send His Son to condemn.',
    });
    expect(byTestID(root, 'scripture-verse-actions')).toBeUndefined();
    expect(byTestID(root, 'scripture-verse-17').props.accessibilityLabel).toContain('highlighted green');

    press(byTestID(root, 'scripture-verse-17'));
    press(byTestID(root, 'scripture-highlight-remove'));
    expect(useUnfoldStore.getState().bibleHighlights).toHaveLength(0);
  });

  it('gates non-yellow colours behind premium like the Bible reader', () => {
    mockPolicy = 'denied';
    const root = render();
    press(byTestID(root, 'scripture-verse-16'));
    press(byTestID(root, 'scripture-highlight-color-blue'));
    expect(useUnfoldStore.getState().bibleHighlights).toHaveLength(0);
    expect(root.root.findAll((n: any) => n.type === 'PremiumSheet')).toHaveLength(1);

    press(byTestID(root, 'scripture-highlight-color-yellow'));
    expect(useUnfoldStore.getState().bibleHighlights).toHaveLength(1);
  });
});
