import { isQaToolsEnabled } from './qa-tools';

export function isScripturePracticeEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ENABLE_SCRIPTURE_PRACTICE === '1' && isQaToolsEnabled();
}
