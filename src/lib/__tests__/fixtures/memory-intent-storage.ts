import type { AutoTrialIntentV1, IntentStorage } from '@/lib/auto-trial-intent';

export function memoryIntentStorage(
  initial?: AutoTrialIntentV1 | string | null,
): IntentStorage & { raw(): string | null } {
  let value: string | null =
    initial === undefined || initial === null
      ? null
      : typeof initial === 'string'
        ? initial
        : JSON.stringify(initial);
  return {
    getItem: jest.fn(() => value),
    setItem: jest.fn((_key: string, next: string) => {
      value = next;
    }),
    removeItem: jest.fn(() => {
      value = null;
    }),
    raw: () => value,
  };
}
