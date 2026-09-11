export type CompletionType = 'day' | 'series';

export type CompletionDismissTarget =
  | '/(tabs)/(today)'
  | null;

export function getCompletionDismissRoute(
  type: CompletionType,
): CompletionDismissTarget {
  return type === 'day' ? '/(tabs)/(today)' : null;
}
