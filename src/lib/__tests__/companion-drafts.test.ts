import { claimCompanionDraft, companionDraftKey, readCompanionDraft, writeCompanionDraft } from '../companion-drafts';

describe('companion drafts', () => {
  it('keys each conversation by its id, and one slot while none exists', () => {
    expect(companionDraftKey('conversation-a')).toBe('conversation-a');
    expect(companionDraftKey(null)).not.toBe(companionDraftKey('conversation-a'));
  });

  it('moves text typed with no conversation into the one created, once', () => {
    writeCompanionDraft(companionDraftKey(null), 'Pray for Sam');
    claimCompanionDraft(companionDraftKey(null), 'conversation-a');
    claimCompanionDraft(companionDraftKey(null), 'conversation-a');
    expect(readCompanionDraft('conversation-a')).toBe('Pray for Sam');
    expect(readCompanionDraft(companionDraftKey(null))).toBe('');
  });

  it('deletes a draft that is emptied', () => {
    writeCompanionDraft('conversation-b', 'Half');
    writeCompanionDraft('conversation-b', '');
    expect(readCompanionDraft('conversation-b')).toBe('');
  });
});
