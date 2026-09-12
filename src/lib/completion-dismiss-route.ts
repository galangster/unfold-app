export type CompletionType = 'day' | 'series';

export type CompletionDismissTarget =
  | '/(tabs)/(today)'
  | '/(tabs)/(study)'
  | null;

export function getCompletionDismissRoute(
  type: CompletionType,
  from?: string,
  hostTab?: string,
): CompletionDismissTarget {
  if (type !== 'day') return null;
  // A day finished in the Study reader (or a leftover Today hand-off that
  // still carries from=study) dismisses to the Study root so the reader
  // does not stay on the stack.
  if (hostTab === '(study)' || from === 'study') return '/(tabs)/(study)';
  return '/(tabs)/(today)';
}
