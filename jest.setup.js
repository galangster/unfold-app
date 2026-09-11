jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-secure-store', () => ({
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
