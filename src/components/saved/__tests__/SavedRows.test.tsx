import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { BookmarkRow } from '../SavedRows';
import { SavedSegment } from '../SavedSegment';
import { toBookmarkSavedItem } from '@/lib/saved-items';
import type { Bookmark } from '@/lib/store';

const mockRouterPush = jest.fn();
let mockBookmarks: Bookmark[] = [];

jest.mock('@/components/icons', () => ({
  BookmarkSimpleIcon: () => null,
  HighlighterIcon: () => null,
  PencilLineIcon: () => null,
}));
jest.mock('@/components/ui', () => ({ alpha: (color: string) => color }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockRouterPush }) }));
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#8A6B2F',
      inputBackground: '#F7F2E8',
      text: '#211D18',
      textSubtle: '#746B60',
      textMuted: '#5F574D',
      background: '#FFFFFF',
      border: '#DDD6CA',
    },
    isDark: false,
  }),
}));
jest.mock('@/lib/store', () => {
  const useUnfoldStore = (selector: (state: unknown) => unknown) => selector({
    highlights: [],
    bibleHighlights: [],
    bookmarks: mockBookmarks,
    devotionals: [],
    removeHighlight: jest.fn(),
    removeBibleHighlight: jest.fn(),
    removeBookmark: jest.fn(),
  });
  useUnfoldStore.setState = jest.fn();
  return { useUnfoldStore };
});
jest.mock('../SwipeToDeleteRow', () => {
  const ReactActual = jest.requireActual('react');
  const { TouchableOpacity } = jest.requireActual('react-native');
  return {
    SwipeToDeleteRow: ({ children, onPress, accessibilityLabel }: any) => ReactActual.createElement(
      TouchableOpacity,
      { onPress, accessibilityLabel, accessibilityRole: 'button' },
      children,
    ),
  };
});
jest.mock('@/lib/sync-outbox', () => ({
  enqueueSyncChanges: jest.fn(),
  removeSyncChangesForRecords: jest.fn(),
}));

const colors = {
  accent: '#8A6B2F',
  inputBackground: '#F7F2E8',
  text: '#211D18',
  textSubtle: '#746B60',
  textMuted: '#5F574D',
} as never;

it('renders a Scripture bookmark with its reference and displayed passage text', () => {
  const bookmark: Bookmark = {
    id: 'scripture-1',
    devotionalId: 'devotional-1',
    devotionalTitle: 'A Quiet Path',
    dayNumber: 2,
    dayTitle: 'Held in Grace',
    scriptureReference: 'Isaiah 40:31',
    scriptureText: 'Those who wait upon the LORD will renew their strength.',
    quotedText: 'A stale day quotable line',
    savedAt: '2026-09-28T00:00:00.000Z',
  };
  const item = toBookmarkSavedItem(bookmark);
  const view = render(<BookmarkRow item={item} colors={colors} onPress={jest.fn()} />);

  expect(view.getByText('· Isaiah 40:31')).toBeTruthy();
  expect(view.getByText('"Those who wait upon the LORD will renew their strength."')).toBeTruthy();
  expect(view.queryByText(/stale day quotable line/i)).toBeNull();
});

it.each([
  ['main Scripture', 'main-scripture', 'John 3:16', 'Saved main passage.', 'BSB'],
  ['Related Scripture after a translation change', 'related-scripture', 'Romans 8:28', 'Saved related passage.', 'KJV'],
])('navigates a %s row to its exact bookmark target', (_label, id, reference, scriptureText, translation) => {
  mockRouterPush.mockClear();
  mockBookmarks = [{
    id,
    devotionalId: 'devotional-1',
    devotionalTitle: 'A Quiet Path',
    dayNumber: 2,
    dayTitle: 'Held in Grace',
    kind: 'scripture',
    key: reference,
    scriptureReference: reference,
    scriptureText,
    translation,
    savedAt: '2026-09-28T00:00:00.000Z',
  }];

  const view = render(<SavedSegment searchQuery="" onRemove={jest.fn()} />);
  fireEvent.press(view.getByLabelText(`Bookmark, Held in Grace, ${reference}: ${scriptureText}`));

  expect(mockRouterPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/(today)/reading',
    params: {
      devotionalId: 'devotional-1',
      dayNumber: '2',
      bookmarkId: id,
    },
  });
});
