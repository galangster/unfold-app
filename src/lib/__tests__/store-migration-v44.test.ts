import { migrateUnfoldStore } from '../store-migrations';

describe('Store migration v43→v44', () => {
  it('defaults ritualSessions to an empty object when missing', () => {
    const migrated = migrateUnfoldStore({ devotionals: [] }, 43) as Record<string, any>;
    expect(migrated.ritualSessions).toEqual({});
  });

  it('preserves an existing ritualSessions object', () => {
    const existing = {
      reading: {
        kind: 'reading',
        startedAt: '2026-09-14T09:50:00.000Z',
        startedTimeZone: 'Pacific/Honolulu',
        devotionalId: 'dev-1',
        dayNumber: 5,
      },
    };
    const migrated = migrateUnfoldStore({ ritualSessions: existing }, 43) as Record<string, any>;
    expect(migrated.ritualSessions).toEqual(existing);
  });

  it('replaces a non-object ritualSessions value', () => {
    const migrated = migrateUnfoldStore({ ritualSessions: [] }, 43) as Record<string, any>;
    expect(migrated.ritualSessions).toEqual({});
  });
});
