import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, '../companion-chat-store.ts'), 'utf8');

describe('companion chat persist shape', () => {
  it('types the MMKV snapshot as persisted data only', () => {
    expect(source).toContain('export type PersistedCompanionChatState = Pick<');
    expect(source).toContain("CompanionChatState,\n  'conversations' | 'activeConversationId'");
    expect(source).toContain('createCompanionChatPersistStorage<Conversation>');
    expect(source).toContain('persist<CompanionChatState, [], [], PersistedCompanionChatState>');
    expect(source).toContain('partialize: (state): PersistedCompanionChatState => ({');
    expect(source).toContain('conversations: state.conversations');
    expect(source).toContain('activeConversationId: state.activeConversationId');
    expect(source).not.toMatch(/partialize: \(state\) => state/);
    expect(source).not.toContain('addMessage: state.addMessage');
  });
});
