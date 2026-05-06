function getMockMmkvStore(): Map<string, string> {
  return (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
    .__unfoldMockMmkvStore;
}

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => {
    const mockMmkvStore = new Map<string, string>();
    (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
      .__unfoldMockMmkvStore = mockMmkvStore;
    return {
    getString: jest.fn((key: string) => mockMmkvStore.get(key)),
    set: jest.fn((key: string, value: string) => {
      mockMmkvStore.set(key, value);
      return true;
    }),
    delete: jest.fn((key: string) => mockMmkvStore.delete(key)),
  };
  }),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v5: jest.fn((value: string) => `uuid-v5:${value}`),
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
}));

// eslint-disable-next-line import/first -- store import must run after Jest module mocks are registered.
import { useUnfoldStore, type NoteFolder } from '../store';

function folder(overrides: Partial<NoteFolder> = {}): NoteFolder {
  return {
    id: 'folder-1',
    name: 'Folder 1',
    color: '#C9A45A',
    parentId: undefined,
    sortOrder: 0,
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('store folder actions', () => {
  beforeEach(() => {
    getMockMmkvStore().clear();
    useUnfoldStore.getState().reset();
  });

  it('preserves folders omitted from a sibling reorder payload', () => {
    const root = folder({ id: 'root', name: 'Root', sortOrder: 0 });
    const otherRoot = folder({ id: 'other-root', name: 'Other Root', sortOrder: 1 });
    const childA = folder({ id: 'child-a', name: 'Child A', parentId: 'root', sortOrder: 0 });
    const childB = folder({ id: 'child-b', name: 'Child B', parentId: 'root', sortOrder: 1 });

    useUnfoldStore.setState({ folders: [root, childA, childB, otherRoot] });

    useUnfoldStore.getState().reorderFolders(['child-b', 'child-a']);

    const foldersById = Object.fromEntries(
      useUnfoldStore.getState().folders.map((existingFolder) => [existingFolder.id, existingFolder]),
    );
    expect(Object.keys(foldersById).sort()).toEqual(['child-a', 'child-b', 'other-root', 'root']);
    expect(foldersById['child-b']).toMatchObject({ parentId: 'root', sortOrder: 0 });
    expect(foldersById['child-a']).toMatchObject({ parentId: 'root', sortOrder: 1 });
    expect(foldersById.root).toMatchObject({ parentId: undefined, sortOrder: 0 });
    expect(foldersById['other-root']).toMatchObject({ parentId: undefined, sortOrder: 1 });
  });
});
