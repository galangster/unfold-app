const subscription = { remove: jest.fn() };

module.exports = {
  addEventListener: jest.fn(() => subscription),
  removeNotificationSubscription: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => subscription),
  addNotificationResponseReceivedListener: jest.fn(() => subscription),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationCategoryAsync: jest.fn(async () => undefined),
  getLastNotificationResponse: jest.fn(() => null),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'token' })),
  SchedulableTriggerInputTypes: {
    TIME_INTERVAL: 'timeInterval',
    DAILY: 'daily',
    DATE: 'date',
  },
  AndroidImportance: { DEFAULT: 5, HIGH: 6, MAX: 7 },
};
