/**
 * Unsent companion messages, one per conversation. In memory only: a draft
 * returns when the reader comes back to its conversation, never follows them
 * into another one, and does not outlive the app process.
 */
const drafts = new Map<string, string>();

/** Conversations a pull emptied. They had messages, so their text never moves. */
const emptiedByPull = new Set<string>();

/** The slot that a recording in progress writes to. */
let recordingDraftKey: string | null = null;

/** The composer's slot while no conversation is active: the reader's next new chat. */
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
 * A conversation the store creates takes the no-conversation slot: its text,
 * and a recording in progress there. Creating a conversation is not navigation.
 */
export function claimNewChatDraft(conversationId: string): void {
  const text = drafts.get(NO_CONVERSATION_KEY);
  drafts.delete(NO_CONVERSATION_KEY);
  if (text) drafts.set(conversationId, text);
  if (recordingDraftKey === NO_CONVERSATION_KEY) recordingDraftKey = conversationId;
}

/**
 * The store dropped an empty conversation when the reader moved on. One that
 * never had a message was the reader's new chat, and its text waits for the
 * next new chat. One a pull emptied had messages, and its text is deleted.
 */
export function releaseCompanionDraft(conversationId: string): void {
  const text = drafts.get(conversationId);
  const hadMessages = emptiedByPull.has(conversationId);
  forgetCompanionDraft(conversationId);
  if (text && !hadMessages) drafts.set(NO_CONVERSATION_KEY, text);
}

/** A pull removed every message of a conversation it kept. */
export function markCompanionDraftEmptied(conversationId: string): void {
  emptiedByPull.add(conversationId);
}

export function forgetCompanionDraft(conversationId: string): void {
  drafts.delete(conversationId);
  emptiedByPull.delete(conversationId);
}

export function clearCompanionDrafts(): void {
  drafts.clear();
  emptiedByPull.clear();
  recordingDraftKey = null;
}

export function startCompanionRecording(draftKey: string): void {
  recordingDraftKey = draftKey;
}

export function companionRecordingKey(): string | null {
  return recordingDraftKey;
}
