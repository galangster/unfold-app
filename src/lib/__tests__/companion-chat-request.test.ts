import type { CompanionMessage } from '../companion-chat-store';
import {
  buildCompanionRequestMessages,
  nearestPrecedingUserMessage,
  shouldEnqueueCompanionMessage,
} from '../companion-chat-request';

function message(
  id: string,
  role: CompanionMessage['role'],
  status: CompanionMessage['status'],
  content = id,
): CompanionMessage {
  return { id, role, status, content, timestamp: 1 };
}

const sanitize = (value: string, maxLength = 2000) => value.slice(0, maxLength);

describe('buildCompanionRequestMessages', () => {
  it('includes the current user turn once after the optimistic send row is stored', () => {
    const messages = [
      message('u1', 'user', 'sent', 'How should I pray?'),
      message('c1', 'companion', 'streaming', ''),
    ];

    expect(buildCompanionRequestMessages(messages, {
      userText: 'How should I pray?',
      sanitize,
      maxChars: 2000,
    })).toEqual([{ role: 'user', content: 'How should I pray?' }]);
  });

  it('keeps a long current turn once and bounds the complete request', () => {
    const text = 'a'.repeat(3500);
    const messages = Array.from({ length: 20 }, (_, index) =>
      message(`old-${index}`, index % 2 ? 'companion' : 'user', 'complete', `old-${index}`),
    );
    messages.push(message('current', 'user', 'sent', text));
    messages.push(message('reply', 'companion', 'streaming', ''));
    const request = buildCompanionRequestMessages(messages, { userText: text, sanitize, maxChars: 4000 });
    expect(request).toHaveLength(10);
    expect(request.filter((turn) => turn.content.startsWith('aaa'))).toEqual([{ role: 'user', content: text }]);
  });

  it('drops later exchanges when rewriting an older error', () => {
    const messages = [
      message('u1', 'user', 'sent', 'Older question'),
      message('e1', 'companion', 'error', 'Failed'),
      message('u2', 'user', 'sent', 'Later question'),
      message('c2', 'companion', 'complete', 'Later reply'),
    ];

    expect(buildCompanionRequestMessages(messages, {
      userText: 'Older question',
      rewriteCompanionId: 'e1',
      sanitize,
      maxChars: 2000,
    })).toEqual([{ role: 'user', content: 'Older question' }]);
  });
});

describe('nearestPrecedingUserMessage', () => {
  it('pairs feedback with the user turn before the rated reply, not the latest user turn', () => {
    const messages = [
      message('u1', 'user', 'sent', 'First'),
      message('c1', 'companion', 'complete', 'Reply one'),
      message('u2', 'user', 'sent', 'Second'),
      message('c2', 'companion', 'complete', 'Reply two'),
    ];

    expect(nearestPrecedingUserMessage(messages, 'c1')?.content).toBe('First');
  });
});

describe('shouldEnqueueCompanionMessage', () => {
  it('skips streaming placeholders and syncs sent user rows plus terminal companion rows', () => {
    expect(shouldEnqueueCompanionMessage(message('c1', 'companion', 'streaming', 'partial'))).toBe(false);
    expect(shouldEnqueueCompanionMessage(message('u1', 'user', 'sent', 'Hello'))).toBe(true);
    expect(shouldEnqueueCompanionMessage(message('c2', 'companion', 'complete', 'Done'))).toBe(true);
    expect(shouldEnqueueCompanionMessage(message('c3', 'companion', 'error', 'Failed'))).toBe(true);
  });
});
