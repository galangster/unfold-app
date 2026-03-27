/**
 * Extract the migration logic from store.ts into a testable function.
 * The migrate function in store.ts applies migrations sequentially.
 * We test the v26→v27 migration by simulating the same pattern.
 */
function applyMigrationV27(state: Record<string, any>): Record<string, any> {
  // This mirrors the exact migration code in store.ts
  state.lastGenerationCutoffDate = state.lastGenerationCutoffDate ?? '';
  return state;
}

describe('Store migration v26→v27', () => {
  it('adds lastGenerationCutoffDate with empty string default when field is missing', () => {
    const stateV26: Record<string, any> = {
      devotionals: [],
      journalEntries: [],
      bookmarks: [],
    };

    const migrated = applyMigrationV27({ ...stateV26 });

    expect(migrated.lastGenerationCutoffDate).toBe('');
    // Original fields preserved
    expect(migrated.devotionals).toEqual([]);
  });

  it('preserves existing lastGenerationCutoffDate if already set', () => {
    const state: Record<string, any> = {
      lastGenerationCutoffDate: '2026-03-27',
    };

    const migrated = applyMigrationV27({ ...state });

    expect(migrated.lastGenerationCutoffDate).toBe('2026-03-27');
  });

  it('handles undefined gracefully (nullish coalescing)', () => {
    const state: Record<string, any> = {
      lastGenerationCutoffDate: undefined,
    };

    const migrated = applyMigrationV27({ ...state });

    expect(migrated.lastGenerationCutoffDate).toBe('');
  });
});
