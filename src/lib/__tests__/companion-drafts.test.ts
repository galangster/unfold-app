import {
  claimNewChatDraft,
  clearCompanionDrafts,
  companionDraftKey,
  companionRecordingKey,
  markCompanionDraftEmptied,
  readCompanionDraft,
  releaseCompanionDraft,
  startCompanionRecording,
  writeCompanionDraft,
} from '../companion-drafts';

describe('companion drafts', () => {
  beforeEach(() => clearCompanionDrafts());

  it('keys each conversation by its id, and one slot while none is active', () => {
    expect(companionDraftKey('conversation-a')).toBe('conversation-a');
    expect(companionDraftKey(null)).not.toBe(companionDraftKey('conversation-a'));
  });

  it('gives a created conversation the new-chat text and the recording in progress, once', () => {
    writeCompanionDraft(companionDraftKey(null), 'Pray for Sam');
    startCompanionRecording(companionDraftKey(null));
    claimNewChatDraft('conversation-a');
    claimNewChatDraft('conversation-b');

    expect(readCompanionDraft('conversation-a')).toBe('Pray for Sam');
    expect(readCompanionDraft('conversation-b')).toBe('');
    expect(readCompanionDraft(companionDraftKey(null))).toBe('');
    expect(companionRecordingKey()).toBe('conversation-a');
  });

  it('keeps a dropped new chat\'s text for the next new chat, and deletes the text of one a pull emptied', () => {
    writeCompanionDraft('new-chat', 'Half a thought');
    releaseCompanionDraft('new-chat');
    expect(readCompanionDraft('new-chat')).toBe('');
    expect(readCompanionDraft(companionDraftKey(null))).toBe('Half a thought');

    writeCompanionDraft('emptied', 'Meant for that conversation');
    markCompanionDraftEmptied('emptied');
    releaseCompanionDraft('emptied');
    expect(readCompanionDraft('emptied')).toBe('');
    expect(readCompanionDraft(companionDraftKey(null))).toBe('Half a thought');
  });

  it('deletes a draft that is emptied', () => {
    writeCompanionDraft('conversation-b', 'Half');
    writeCompanionDraft('conversation-b', '');
    expect(readCompanionDraft('conversation-b')).toBe('');
  });
});
