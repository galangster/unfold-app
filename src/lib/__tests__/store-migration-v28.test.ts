/**
 * Test store migration v27 → v28.
 * Mirrors the pattern in store-migration-v27.test.ts.
 */
function applyMigrationV28(state: Record<string, any>): Record<string, any> {
  state.lastEveningGenerationDate = state.lastEveningGenerationDate ?? '';
  return state;
}

describe('Store migration v27→v28', () => {
  it('adds lastEveningGenerationDate with empty string default', () => {
    const stateV27: Record<string, any> = {
      devotionals: [],
      lastGenerationCutoffDate: '2026-03-27',
    };
    const migrated = applyMigrationV28({ ...stateV27 });
    expect(migrated.lastEveningGenerationDate).toBe('');
    expect(migrated.lastGenerationCutoffDate).toBe('2026-03-27');
  });

  it('preserves existing lastEveningGenerationDate if already set', () => {
    const state: Record<string, any> = {
      lastEveningGenerationDate: '2026-03-27',
    };
    const migrated = applyMigrationV28({ ...state });
    expect(migrated.lastEveningGenerationDate).toBe('2026-03-27');
  });

  it('handles undefined gracefully (nullish coalescing)', () => {
    const state: Record<string, any> = {
      lastEveningGenerationDate: undefined,
    };
    const migrated = applyMigrationV28({ ...state });
    expect(migrated.lastEveningGenerationDate).toBe('');
  });
});
