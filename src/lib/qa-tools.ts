export function isQaToolsEnabled(): boolean {
  return __DEV__ || process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS === '1';
}
