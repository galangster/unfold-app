import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSearchBible = jest.fn();

jest.mock('@/lib/bible-db', () => ({
  searchBible: (...args: unknown[]) => mockSearchBible(...args),
}));
jest.mock('@/hooks/useBibleDb', () => ({ useBibleDb: () => ({ isReady: true }) }));
jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn() } }));

import { useBibleSearch } from '../useBibleSearch';

const renderer = jest.requireActual('react-test-renderer');
const { act } = renderer;

let latest: ReturnType<typeof useBibleSearch>;

function Probe({ ready, translation = 'BSB' }: { ready?: boolean; translation?: 'BSB' | 'KJV' }) {
  latest = useBibleSearch({ translation, debounceMs: 10, databaseReady: ready });
  return null;
}

it('clears settled results as soon as the query changes', async () => {
  jest.useFakeTimers();
  mockSearchBible.mockResolvedValueOnce([{
    id: 1,
    bookId: 43,
    chapter: 3,
    verse: 16,
    text: 'For God so loved the world.',
    translation: 'BSB',
    snippet: 'For God so loved the world.',
  }]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree: { unmount: () => void };

  act(() => {
    tree = renderer.create(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
  });
  act(() => latest.setQuery('love'));
  await act(async () => { await jest.runAllTimersAsync(); });
  await act(async () => { await jest.runAllTimersAsync(); });
  expect(latest.results).toHaveLength(1);

  act(() => latest.setQuery('hope'));
  expect(latest.results).toEqual([]);
  expect(latest.isSearching).toBe(true);

  act(() => tree.unmount());
  client.clear();
  jest.useRealTimers();
});

it('starts searching when the caller finishes downloading without remounting', async () => {
  jest.useFakeTimers();
  mockSearchBible.mockReset();
  mockSearchBible.mockResolvedValue([]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree: { update: (node: React.ReactNode) => void; unmount: () => void };
  act(() => {
    tree = renderer.create(<QueryClientProvider client={client}><Probe ready={false} /></QueryClientProvider>);
  });
  act(() => latest.setQuery('micah 6:8'));
  await act(async () => { await jest.runAllTimersAsync(); });
  expect(mockSearchBible).not.toHaveBeenCalled();
  act(() => tree.update(<QueryClientProvider client={client}><Probe ready /></QueryClientProvider>));
  await act(async () => { await jest.runAllTimersAsync(); });
  expect(mockSearchBible).toHaveBeenCalledWith('micah 6:8', 'BSB', 50);
  act(() => tree.unmount());
  client.clear();
  jest.useRealTimers();
});
