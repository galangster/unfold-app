import { companionDraftKey, moveCompanionDraft, readCompanionDraft, writeCompanionDraft } from '../companion-drafts';

describe('companionDraftKey', () => {
  it('gives each conversation with messages its own slot', () => {
    expect(companionDraftKey('conversation-a', true)).toBe('conversation-a');
    expect(companionDraftKey('conversation-b', true)).not.toBe(companionDraftKey('conversation-a', true));
  });

  it('shares one slot between chats without messages, which the store drops when the reader leaves', () => {
    expect(companionDraftKey('empty-chat-1', false)).toBe(companionDraftKey('empty-chat-2', false));
    expect(companionDraftKey(null, false)).toBe(companionDraftKey('empty-chat-1', false));
    expect(companionDraftKey('empty-chat-1', false)).not.toBe(companionDraftKey('conversation-a', true));
  });
});

describe('moveCompanionDraft', () => {
  it('moves unsent text once, so a repeated move keeps it', () => {
    writeCompanionDraft('new-chat-slot', 'Pray for Sam');
    moveCompanionDraft('new-chat-slot', 'conversation-a');
    moveCompanionDraft('new-chat-slot', 'conversation-a');
    expect(readCompanionDraft('conversation-a')).toBe('Pray for Sam');
    expect(readCompanionDraft('new-chat-slot')).toBe('');
  });
});
