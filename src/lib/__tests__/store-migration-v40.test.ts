import { migrateUnfoldStore } from '@/lib/store-migrations';

jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() } }));

/**
 * A devotional restored from server sync had no seriesStartDate, so
 * getCalendarDayNumber returned null and the tomorrow-lock failed CLOSED —
 * pinning the reader to whatever day was read today. That is the reported
 * "tap Day 2, get Day 1".
 *
 * The sync paths now carry the field, but they only repair a devotional that a
 * pull actually delivers. A user whose series has not changed server-side since
 * their last sync would never receive that row, so upgrading alone would not fix
 * them. This migration closes it on first launch.
 */
describe('store migration v39 → v40: seriesStartDate repair', () => {
  it('backfills a missing anchor from createdAt', () => {
    const state = migrateUnfoldStore(
      {
        devotionals: [
          { id: 'a', createdAt: '2026-07-28T10:39:26.418Z' },
        ],
      },
      39,
    );
    expect(state.devotionals[0].seriesStartDate).toBe('2026-07-28T10:39:26.418Z');
  });

  it('never overwrites an anchor that is already present', () => {
    const state = migrateUnfoldStore(
      {
        devotionals: [
          {
            id: 'a',
            createdAt: '2026-07-28T10:39:26.418Z',
            seriesStartDate: '2026-07-20T00:00:00.000Z',
          },
        ],
      },
      39,
    );
    expect(state.devotionals[0].seriesStartDate).toBe('2026-07-20T00:00:00.000Z');
  });

  it('leaves a devotional with no createdAt alone rather than inventing one', () => {
    const state = migrateUnfoldStore({ devotionals: [{ id: 'a' }] }, 39);
    expect(state.devotionals[0].seriesStartDate).toBeUndefined();
  });

  it('does not run for a store already at v40', () => {
    const state = migrateUnfoldStore(
      { devotionals: [{ id: 'a', createdAt: '2026-07-28T10:39:26.418Z' }] },
      40,
    );
    expect(state.devotionals[0].seriesStartDate).toBeUndefined();
  });

  it('survives a missing or malformed devotionals array', () => {
    expect(() => migrateUnfoldStore({}, 39)).not.toThrow();
    expect(() => migrateUnfoldStore({ devotionals: null }, 39)).not.toThrow();
    expect(() => migrateUnfoldStore({ devotionals: [null] }, 39)).not.toThrow();
  });
});
