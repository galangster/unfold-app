module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
    '**/*.test.ts',
    '**/*.test.tsx',
  ],
  roots: ['<rootDir>/src'],
  testPathIgnorePatterns: ['/node_modules/', '/.claude/'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo|@expo|expo-modules-core|@react-native-community|nativewind|react-native-css-interop|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|@gorhom|@shopify|react-native-mmkv|zustand|@tanstack|uuid|phosphor-react-native)/)',
  ],
};
