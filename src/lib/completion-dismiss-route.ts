export type CompletionType = 'day' | 'series';

export type CompletionDismissTarget =
  | '/(tabs)/(today)'
  | null;

export function getCompletionDismissRoute(
  type: CompletionType,
  _ctx?: { autoTrialDevotionalId?: string | null },
): CompletionDismissTarget {
  if (type === 'day') return '/(tabs)/(today)';
  return null;
}
