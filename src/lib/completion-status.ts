export type CompletionStatus =
  | 'completed_with_engagement'
  | 'completed_minimal'
  | 'in_progress'
  | 'not_started';

export interface CompletionInput {
  isRead: boolean;
  hasJournal: boolean;
  hasCheckIn: boolean;
  hasReadAt?: boolean;
}

export function computeCompletionStatus(input: CompletionInput): CompletionStatus {
  if (input.isRead && (input.hasJournal || input.hasCheckIn)) {
    return 'completed_with_engagement';
  }
  if (input.isRead) {
    return 'completed_minimal';
  }
  if (input.hasReadAt) {
    return 'in_progress';
  }
  return 'not_started';
}
