export type CompletionType = 'day' | 'series';

export type CompletionDismissTarget =
  | '/(tabs)/(today)'
  | { pathname: '/keepsake'; params: { devotionalId: string } }
  | null;

export function getCompletionDismissRoute(
  type: CompletionType,
  ctx?: { autoTrialDevotionalId?: string | null },
): CompletionDismissTarget {
  if (type === 'day') return '/(tabs)/(today)';
  const autoTrialDevotionalId = ctx?.autoTrialDevotionalId;
  if (type === 'series' && autoTrialDevotionalId) {
    return { pathname: '/keepsake', params: { devotionalId: autoTrialDevotionalId } };
  }
  return null;
}
