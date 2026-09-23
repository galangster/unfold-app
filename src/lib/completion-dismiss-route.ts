export type CompletionType = 'day' | 'series';

export type CompletionDismissTarget =
  | '/(tabs)/(today)'
  | '/(tabs)/(study)';

export function getCompletionDismissRoute(
  type: CompletionType,
  from?: string,
  hostTab?: string,
): CompletionDismissTarget {
  // Today owns the existing recommendations and new-study choices.
  if (type === 'series') return '/(tabs)/(today)';
  // A day finished in the Study reader (or a leftover Today hand-off that
  // still carries from=study) dismisses to the Study root so the reader
  // does not stay on the stack.
  if (hostTab === '(study)' || from === 'study') return '/(tabs)/(study)';
  return '/(tabs)/(today)';
}
