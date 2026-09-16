jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

// Native-only visual primitives render as the plain View under Jest. Tests
// that need to inspect their props can still override these with a local
// jest.mock. No createElement here: the CSS-interop Babel plugin would inject
// an out-of-scope helper into the factory.
jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('@react-native-masked-view/masked-view', () => {
  const View = require('react-native').View;
  return { __esModule: true, default: View, MaskedView: View };
});

jest.mock('expo-background-fetch', () => ({
  BackgroundFetchResult: { NewData: 2, NoData: 1, Failed: 3 },
  registerTaskAsync: jest.fn(async () => undefined),
  unregisterTaskAsync: jest.fn(async () => undefined),
  getStatusAsync: jest.fn(async () => 3),
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(() => true),
  isTaskRegisteredAsync: jest.fn(async () => false),
}));

jest.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponse: jest.fn(() => null),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DAILY: 'daily', DATE: 'date' },
  AndroidImportance: { DEFAULT: 5, HIGH: 6 },
}));

jest.mock('expo-audio', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    replace: jest.fn(),
    seekTo: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
  setAudioModeAsync: jest.fn(async () => undefined),
  addAudioInterruptionListener: jest.fn(() => ({ remove: jest.fn() })),
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  useAudioPlayer: jest.fn(() => ({
    replace: jest.fn(),
    pause: jest.fn(),
    play: jest.fn(),
    seekTo: jest.fn(),
  })),
  useAudioPlayerStatus: jest.fn(() => ({ playing: false, didJustFinish: false })),
  useAudioRecorder: jest.fn(() => ({
    uri: null,
    isRecording: false,
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(),
    stop: jest.fn(async () => undefined),
    getStatus: jest.fn(() => ({ durationMillis: 0 })),
  })),
  useAudioRecorderState: jest.fn(() => ({ isRecording: false })),
  RecordingPresets: { HIGH_QUALITY: {} },
}));
