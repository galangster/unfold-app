jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
}));

jest.mock('../sync-ids', () => ({
  newId: jest.fn(() => `test-id-${Math.random().toString(36).slice(2, 8)}`),
  compositeId: jest.fn((...parts: unknown[]) => parts.join(':')),
}));

jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => store.set(key, value)),
      removeItem: jest.fn((key: string) => store.delete(key)),
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    __clearMockStorage: () => store.clear(),
  };
});

import { highlightPosKey, useUnfoldStore } from '../store';
import { peekSyncOutbox } from '../sync-outbox';

const meta = { devotionalId: 'dev-1', devotionalTitle: 'Quiet Path', dayNumber: 2, dayTitle: 'Strength for the Middle' };

const serial = (start: number, end: number, color = 'yellow', id = 1) => `${start}$${end}$${id}$rangy-highlight-${color}$`;

describe('highlightPosKey', () => {
  it('ignores the per-session rangy id and rejects malformed serials', () => {
    expect(highlightPosKey(serial(10, 20, 'yellow', 1))).toBe('10-20-rangy-highlight-yellow');
    expect(highlightPosKey(serial(10, 20, 'yellow', 99))).toBe('10-20-rangy-highlight-yellow');
    expect(highlightPosKey('')).toBeNull();
    expect(highlightPosKey('10$20')).toBeNull();
    expect(highlightPosKey(undefined)).toBeNull();
  });
});

describe('reconcileDayHighlights', () => {
  beforeEach(() => {
    useUnfoldStore.setState({ highlights: [] });
  });

  it('adds new spans, drops removed spans, and leaves other days alone in one write', () => {
    useUnfoldStore.getState().addHighlight({ ...meta, highlightedText: 'old one', serializedRange: serial(0, 7), color: 'yellow' });
    useUnfoldStore.getState().addHighlight({ ...meta, dayNumber: 3, highlightedText: 'other day', serializedRange: serial(0, 7), color: 'yellow' });

    const listener = jest.fn();
    const unsubscribe = useUnfoldStore.subscribe(listener);
    useUnfoldStore.getState().reconcileDayHighlights(
      meta,
      [{ serial: serial(0, 7, 'yellow', 42), text: 'old one', color: 'yellow' }],
      [{ serial: serial(10, 20, 'blue'), text: 'grace upon', color: 'blue', context: 'x'.repeat(200) }],
    );
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    const { highlights } = useUnfoldStore.getState();
    expect(highlights.map((h) => [h.dayNumber, h.highlightedText, h.color])).toEqual([
      [2, 'grace upon', 'blue'],
      [3, 'other day', 'yellow'],
    ]);
    expect(highlights[0].contextBefore).toHaveLength(100);
    expect(highlights[0].devotionalTitle).toBe('Quiet Path');
  });

  it('removes range-less ghost records by text and colour, and dedupes added spans by position', () => {
    useUnfoldStore.getState().addHighlight({ ...meta, highlightedText: 'ghost', serializedRange: '', color: 'red' });
    useUnfoldStore.getState().addHighlight({ ...meta, highlightedText: 'kept', serializedRange: serial(30, 34, 'green'), color: 'green' });

    useUnfoldStore.getState().reconcileDayHighlights(
      meta,
      [{ serial: '', text: 'ghost', color: 'red' }],
      [{ serial: serial(30, 34, 'green', 7), text: 'kept', color: 'green' }],
    );

    const { highlights } = useUnfoldStore.getState();
    expect(highlights).toHaveLength(1);
    expect(highlights[0].highlightedText).toBe('kept');
  });

  it('queues a tombstone for the removed record and an upsert for the added one', () => {
    useUnfoldStore.getState().addHighlight({ ...meta, highlightedText: 'old one', serializedRange: serial(0, 7), color: 'yellow' });
    const oldId = useUnfoldStore.getState().highlights[0].id;

    useUnfoldStore.getState().reconcileDayHighlights(
      meta,
      [{ serial: serial(0, 7), text: 'old one', color: 'yellow' }],
      [{ serial: serial(10, 20), text: 'new', color: 'yellow' }],
    );

    const newId = useUnfoldStore.getState().highlights[0].id;
    const byId = new Map(peekSyncOutbox().filter((c) => c.table === 'highlights').map((c) => [c.id, c.deleted]));
    expect(byId.get(oldId)).toBe(true);
    expect(byId.get(newId)).toBe(false);
  });
});
