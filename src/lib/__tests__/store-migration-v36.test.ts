jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v5: jest.fn((value: string, namespace: string) => `uuidv5:${namespace}:${value}`),
}));

import { migrateUnfoldStore } from '../store-migrations';

describe('Store migration v35→v36', () => {
  it('adds lastMiddayCompletedDate with null default when missing', () => {
    const stateV35: Record<string, any> = {
      devotionals: [],
      middayCheckInEnabled: true,
    };

    const migrated = migrateUnfoldStore({ ...stateV35 }, 35) as Record<string, any>;

    expect(migrated.lastMiddayCompletedDate).toBe(null);
    expect(migrated.lastEveningCompletedDate).toBe(null);
    expect(migrated.middayCheckInEnabled).toBe(true);
  });

  it('preserves existing lastMiddayCompletedDate if already set', () => {
    const state: Record<string, any> = {
      lastMiddayCompletedDate: '2026-04-12',
    };

    const migrated = migrateUnfoldStore({ ...state }, 35) as Record<string, any>;

    expect(migrated.lastMiddayCompletedDate).toBe('2026-04-12');
    expect(migrated.lastEveningCompletedDate).toBe(null);
  });

  it('preserves existing lastEveningCompletedDate if already set', () => {
    const state: Record<string, any> = {
      lastEveningCompletedDate: '2026-04-11',
    };

    const migrated = migrateUnfoldStore({ ...state }, 35) as Record<string, any>;

    expect(migrated.lastMiddayCompletedDate).toBe(null);
    expect(migrated.lastEveningCompletedDate).toBe('2026-04-11');
  });

  it('does not overwrite null with null', () => {
    const state: Record<string, any> = {
      lastMiddayCompletedDate: null,
      lastEveningCompletedDate: null,
    };

    const migrated = migrateUnfoldStore({ ...state }, 35) as Record<string, any>;

    expect(migrated.lastMiddayCompletedDate).toBe(null);
    expect(migrated.lastEveningCompletedDate).toBe(null);
  });

  it('handles undefined gracefully', () => {
    const state: Record<string, any> = {
      lastMiddayCompletedDate: undefined,
      lastEveningCompletedDate: undefined,
    };

    const migrated = migrateUnfoldStore({ ...state }, 35) as Record<string, any>;

    expect(migrated.lastMiddayCompletedDate).toBe(null);
    expect(migrated.lastEveningCompletedDate).toBe(null);
  });
});
