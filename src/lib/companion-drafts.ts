/**
 * Unsent companion messages, one per conversation. In memory only: a draft
 * returns when the reader comes back to its conversation, never follows them
 * into another one, and does not outlive the app process.
 */
const drafts = new Map<string, string>();

/**
 * Conversations a pull emptied. They had messages, so the text found at the
 * pull never moves. Text the reader types afterwards moves like a new chat's.
 */
const emptiedByPull = new Set<string>();

/** The recording in progress: a token that never changes, and the slot it writes to. */
let recording: { token: number; draftKey: string } | null = null;
let lastRecordingToken = 0;

/** The composer's slot while no conversation is active: the reader's next new chat. */
const NO_CONVERSATION_KEY = 'no-conversation';

export function companionDraftKey(conversationId: string | null): string {
  return conversationId ?? NO_CONVERSATION_KEY;
}

export function readCompanionDraft(draftKey: string): string {
  return drafts.get(draftKey) ?? '';
}

export function writeCompanionDraft(draftKey: string, text: string): void {
  emptiedByPull.delete(draftKey);
  if (text) drafts.set(draftKey, text);
  else drafts.delete(draftKey);
}

/**
 * Takes a draft out while the composer sends it, so a conversation that the
 * send creates does not claim the sent text. Returns the way to put it back
 * when the send is refused. Neither step is a change by the reader, so a pull
 * mark stays.
 */
export function holdCompanionDraftForSend(draftKey: string): () => void {
  const text = drafts.get(draftKey);
  drafts.delete(draftKey);
  return () => {
    if (text) drafts.set(draftKey, text);
  };
}

/**
 * A conversation the store creates takes the no-conversation slot: its text,
 * and a recording in progress there. Creating a conversation is not navigation.
 */
export function claimNewChatDraft(conversationId: string): void {
  const text = drafts.get(NO_CONVERSATION_KEY);
  drafts.delete(NO_CONVERSATION_KEY);
  if (text) drafts.set(conversationId, text);
  if (recording?.draftKey === NO_CONVERSATION_KEY) recording = { ...recording, draftKey: conversationId };
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
  recording = null;
}

/** Starts a recording in a slot. The token identifies it for as long as it lives. */
export function startCompanionRecording(draftKey: string): number {
  lastRecordingToken += 1;
  recording = { token: lastRecordingToken, draftKey };
  return lastRecordingToken;
}

/** The slot a recording writes to, while it is the one in progress. */
export function companionRecordingSlot(token: number | null): string | null {
  return recording !== null && recording.token === token ? recording.draftKey : null;
}
