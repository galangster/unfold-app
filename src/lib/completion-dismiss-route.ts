export type CompletionType = 'day' | 'series';

export function getCompletionDismissRoute(type: CompletionType): '/(tabs)/(today)' | null {
  return type === 'day' ? '/(tabs)/(today)' : null;
}
