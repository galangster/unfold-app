jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v5: jest.fn((value: string, namespace: string) => `uuidv5:${namespace}:${value}`),
}));

import { migrateUnfoldStore } from '../store-migrations';

describe('Store migration v27→v28', () => {
  it('adds then removes legacy evening generation date when migrating to current schema', () => {
    const stateV27: Record<string, any> = {
      devotionals: [],
      lastGenerationCutoffDate: '2026-03-27',
    };

    const migrated = migrateUnfoldStore({ ...stateV27 }, 27) as Record<string, any>;

    expect(migrated.lastEveningGenerationDate).toBeUndefined();
    expect(migrated.lastGenerationCutoffDate).toBeUndefined();
    expect(migrated.pendingJobId).toBe(null);
  });

  it('removes existing legacy evening generation date when migrating past v30', () => {
    const state: Record<string, any> = {
      lastEveningGenerationDate: '2026-03-27',
    };

    const migrated = migrateUnfoldStore({ ...state }, 27) as Record<string, any>;

    expect(migrated.lastEveningGenerationDate).toBeUndefined();
    expect(migrated.pendingJobId).toBe(null);
  });

  it('handles undefined legacy evening generation date gracefully', () => {
    const state: Record<string, any> = {
      lastEveningGenerationDate: undefined,
    };

    const migrated = migrateUnfoldStore({ ...state }, 27) as Record<string, any>;

    expect(migrated.lastEveningGenerationDate).toBeUndefined();
    expect(migrated.pendingJobId).toBe(null);
  });
});
