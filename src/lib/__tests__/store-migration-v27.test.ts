jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v5: jest.fn((value: string, namespace: string) => `uuidv5:${namespace}:${value}`),
}));

import { migrateUnfoldStore } from '../store-migrations';

describe('Store migration v26→v27', () => {
  it('adds lastGenerationCutoffDate with empty string default when field is missing', () => {
    const stateV26: Record<string, any> = {
      devotionals: [],
      journalEntries: [],
      bookmarks: [],
    };

    const migrated = migrateUnfoldStore({ ...stateV26 }, 26) as Record<string, any>;

    expect(migrated.lastGenerationCutoffDate).toBeUndefined();
    expect(migrated.pendingJobId).toBe(null);
    expect(migrated.devotionals).toEqual([]);
  });

  it('preserves v27 cutoff when running only the v26→v27 step', () => {
    const state: Record<string, any> = {
      lastGenerationCutoffDate: '2026-03-27',
    };

    const migrated = migrateUnfoldStore({ ...state }, 26) as Record<string, any>;

    expect(migrated.lastGenerationCutoffDate).toBeUndefined();
    expect(migrated.pendingJobId).toBe(null);
  });

  it('removes undefined legacy generation cutoff by the current schema', () => {
    const state: Record<string, any> = {
      lastGenerationCutoffDate: undefined,
    };

    const migrated = migrateUnfoldStore({ ...state }, 26) as Record<string, any>;

    expect(migrated.lastGenerationCutoffDate).toBeUndefined();
    expect(migrated.pendingJobId).toBe(null);
  });
});
