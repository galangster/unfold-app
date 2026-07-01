jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v5: jest.fn((value: string, namespace: string) => `uuidv5:${namespace}:${value}`),
}));

import { migrateUnfoldStore } from '../store-migrations';

describe('store migration v38 daily reminder intent', () => {
  it('defaults existing users with a reminder time to enabled', () => {
    const stateV37 = {
      user: {
        reminderTime: '8:00 AM',
      },
    };

    const migrated = migrateUnfoldStore({ ...stateV37, user: { ...stateV37.user } }, 37) as Record<string, any>;

    expect(migrated.user.dailyReminderEnabled).toBe(true);
  });

  it('defaults existing users without a reminder time to disabled', () => {
    const stateV37 = {
      user: {
        reminderTime: '',
      },
    };

    const migrated = migrateUnfoldStore({ ...stateV37, user: { ...stateV37.user } }, 37) as Record<string, any>;

    expect(migrated.user.dailyReminderEnabled).toBe(false);
  });

  it('preserves an explicit disabled value when remigrating', () => {
    const state = {
      user: {
        reminderTime: '8:00 AM',
        dailyReminderEnabled: false,
      },
    };

    const migrated = migrateUnfoldStore({ ...state, user: { ...state.user } }, 37) as Record<string, any>;

    expect(migrated.user.dailyReminderEnabled).toBe(false);
  });
});
