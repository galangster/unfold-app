/**
 * Unsent companion messages, one per conversation. In memory only: a draft
 * returns when the reader comes back to its conversation, never follows them
 * into another one, and does not outlive the app process.
 */
const drafts = new Map<string, string>();

const NEW_CHAT_DRAFT_KEY = 'new-chat';

/**
 * The draft slot for a conversation. Chats with no messages share one slot:
 * the store gives a new chat an id but drops it once the reader leaves, which
 * would strand its text under an id that no longer exists.
 */
export function companionDraftKey(conversationId: string | null, hasMessages: boolean): string {
  return hasMessages && conversationId ? conversationId : NEW_CHAT_DRAFT_KEY;
}

export function readCompanionDraft(draftKey: string): string {
  return drafts.get(draftKey) ?? '';
}

export function writeCompanionDraft(draftKey: string, text: string): void {
  if (text) drafts.set(draftKey, text);
  else drafts.delete(draftKey);
}

/** Moves unsent text to a new slot. A second call finds nothing to move. */
export function moveCompanionDraft(fromKey: string, toKey: string): void {
  const text = drafts.get(fromKey);
  if (!text) return;
  drafts.delete(fromKey);
  drafts.set(toKey, text);
}

export function forgetCompanionDraft(conversationId: string): void {
  drafts.delete(conversationId);
}

export function clearCompanionDrafts(): void {
  drafts.clear();
}
