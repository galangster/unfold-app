/**
 * Test store migration v35 → v36.
 *
 * v36 adds `lastMiddayCompletedDate` / `lastEveningCompletedDate` fields to
 * persist completion state for check-in notifications. These fields replaced
 * the imperative `cancelAndRescheduleXForTomorrow` helpers that silently
 * downgraded repeating DAILY triggers into one-shot DATE triggers. See
 * ~/vault/gotchas/expo-reschedule-helpers-silent-one-shot-downgrade.md
 *
 * Current design: these fields are persisted but NOT read by scheduling.
 * `useCheckInNotifications` always schedules DAILY regardless of today's
 * completion. The fields exist for (1) analytics, (2) a future skip-today
 * mode if we decide to suppress today's reminder after a same-day check-in.
 *
 * This test mirrors the migration logic in `src/lib/store.ts` so we can
 * verify it in isolation from Zustand/MMKV.
 */
function applyMigrationV36(state: Record<string, any>): Record<string, any> {
  // Mirrors exactly the block at src/lib/store.ts:2277-2284.
  if (state.lastMiddayCompletedDate === undefined) {
    state.lastMiddayCompletedDate = null;
  }
  if (state.lastEveningCompletedDate === undefined) {
    state.lastEveningCompletedDate = null;
  }
  return state;
}

describe('Store migration v35→v36', () => {
  it('adds lastMiddayCompletedDate with null default when missing', () => {
    const stateV35: Record<string, any> = {
      devotionals: [],
      middayCheckInEnabled: true,
    };

    const migrated = applyMigrationV36({ ...stateV35 });

    expect(migrated.lastMiddayCompletedDate).toBe(null);
    expect(migrated.lastEveningCompletedDate).toBe(null);
    // Original fields preserved
    expect(migrated.middayCheckInEnabled).toBe(true);
  });

  it('preserves existing lastMiddayCompletedDate if already set', () => {
    const state: Record<string, any> = {
      lastMiddayCompletedDate: '2026-04-12',
    };

    const migrated = applyMigrationV36({ ...state });

    expect(migrated.lastMiddayCompletedDate).toBe('2026-04-12');
    expect(migrated.lastEveningCompletedDate).toBe(null);
  });

  it('preserves existing lastEveningCompletedDate if already set', () => {
    const state: Record<string, any> = {
      lastEveningCompletedDate: '2026-04-11',
    };

    const migrated = applyMigrationV36({ ...state });

    expect(migrated.lastMiddayCompletedDate).toBe(null);
    expect(migrated.lastEveningCompletedDate).toBe('2026-04-11');
  });

  it('does not overwrite null with null', () => {
    const state: Record<string, any> = {
      lastMiddayCompletedDate: null,
      lastEveningCompletedDate: null,
    };

    const migrated = applyMigrationV36({ ...state });

    expect(migrated.lastMiddayCompletedDate).toBe(null);
    expect(migrated.lastEveningCompletedDate).toBe(null);
  });

  it('handles undefined gracefully', () => {
    const state: Record<string, any> = {
      lastMiddayCompletedDate: undefined,
      lastEveningCompletedDate: undefined,
    };

    const migrated = applyMigrationV36({ ...state });

    expect(migrated.lastMiddayCompletedDate).toBe(null);
    expect(migrated.lastEveningCompletedDate).toBe(null);
  });
});
