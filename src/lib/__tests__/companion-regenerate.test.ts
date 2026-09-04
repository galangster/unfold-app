import type { CompanionMessage } from '../companion-chat-store';
import { FEEDBACK_REASONS, pickRegenerateTarget } from '../companion-regenerate';

function message(
  id: string,
  role: CompanionMessage['role'],
  status: CompanionMessage['status'],
  content = id,
): CompanionMessage {
  return { id, role, status, content, timestamp: 1 };
}

describe('pickRegenerateTarget', () => {
  it.each([
    ['an empty conversation', []],
    ['a user message last', [message('user', 'user', 'sent')]],
    [
      'a streaming companion message last',
      [message('user', 'user', 'sent'), message('reply', 'companion', 'streaming')],
    ],
    ['a companion reply with no user message before it', [message('reply', 'companion', 'complete')]],
  ])('returns null for %s', (_label, messages) => {
    expect(pickRegenerateTarget(messages)).toBeNull();
  });

  it('returns the last complete companion reply and its preceding user message', () => {
    const userMessage = message('user', 'user', 'sent', 'Question');
    const companionMessage = message('reply', 'companion', 'complete', 'Reply');

    expect(pickRegenerateTarget([userMessage, companionMessage])).toEqual({
      userMessage,
      companionMessage,
    });
  });

  it('accepts an errored reply so a failed answer can be retried in place', () => {
    const userMessage = message('user', 'user', 'sent', 'Question');
    const companionMessage = message('reply', 'companion', 'error', 'Something went wrong');

    expect(pickRegenerateTarget([userMessage, companionMessage])?.companionMessage).toBe(companionMessage);
  });
});

it('gives every feedback reason a unique id and a label', () => {
  expect(FEEDBACK_REASONS).toHaveLength(4);
  for (const reason of FEEDBACK_REASONS) {
    expect(reason.label.trim()).not.toBe('');
  }
  expect(new Set(FEEDBACK_REASONS.map((r) => r.id)).size).toBe(FEEDBACK_REASONS.length);
});
