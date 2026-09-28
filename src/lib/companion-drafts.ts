/**
 * Unsent companion messages, one per conversation. In memory only: a draft
 * returns when the reader comes back to its conversation, never follows them
 * into another one, and does not outlive the app process.
 */
const drafts = new Map<string, string>();

/** The composer's slot while no conversation exists yet. */
const NO_CONVERSATION_KEY = 'no-conversation';

export function companionDraftKey(conversationId: string | null): string {
  return conversationId ?? NO_CONVERSATION_KEY;
}

export function readCompanionDraft(draftKey: string): string {
  return drafts.get(draftKey) ?? '';
}

export function writeCompanionDraft(draftKey: string, text: string): void {
  if (text) drafts.set(draftKey, text);
  else drafts.delete(draftKey);
}

/**
 * Text typed before any conversation existed belongs to the conversation that
 * the store creates next, for example when a starter card sends its first
 * message. Text never moves out of an existing conversation.
 */
export function claimCompanionDraft(fromKey: string, conversationId: string): void {
  const text = drafts.get(fromKey);
  if (!text) return;
  drafts.delete(fromKey);
  drafts.set(conversationId, text);
}

export function forgetCompanionDraft(conversationId: string): void {
  drafts.delete(conversationId);
}

export function clearCompanionDrafts(): void {
  drafts.clear();
}
