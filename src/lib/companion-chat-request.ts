import type { CompanionMessage } from './companion-chat-store';

export const COMPANION_REQUEST_HISTORY_LIMIT = 10;

/**
 * Model request history for one turn. Scoped to a single conversation.
 * A rewrite (retry/regenerate) drops the target reply and every later
 * exchange so an older error cannot pull in later questions.
 * The current user turn is included once.
 */
export function buildCompanionRequestMessages(
  messages: CompanionMessage[],
  options: {
    userText: string;
    rewriteCompanionId?: string;
    sanitize: (value: string, maxLength?: number) => string;
    maxChars: number;
  },
): { role: 'user' | 'assistant'; content: string }[] {
  let scoped = messages;
  if (options.rewriteCompanionId) {
    const rewriteIndex = messages.findIndex((message) => message.id === options.rewriteCompanionId);
    scoped = rewriteIndex >= 0 ? messages.slice(0, rewriteIndex) : messages;
  }

  const durableMessages = scoped.filter(
    (message) => message.status === 'sent' || message.status === 'complete',
  );
  const last = durableMessages[durableMessages.length - 1];
  // Match the stored turn before applying different history/current limits.
  // A 4,000-character user turn must not also appear as a 2,000-character copy.
  const history = last?.role === 'user' && last.content.trim() === options.userText
    ? durableMessages.slice(0, -1)
    : durableMessages;

  return [
    ...history.slice(-(COMPANION_REQUEST_HISTORY_LIMIT - 1)).map((message) => ({
      role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: options.sanitize(message.content),
    })),
    { role: 'user' as const, content: options.sanitize(options.userText, options.maxChars) },
  ];
}

export function nearestPrecedingUserMessage(
  messages: CompanionMessage[],
  messageId: string,
): CompanionMessage | undefined {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) return undefined;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (messages[cursor].role === 'user') return messages[cursor];
  }
  return undefined;
}

export function shouldEnqueueCompanionMessage(message: CompanionMessage): boolean {
  if (message.status === 'streaming') return false;
  if (message.role === 'user') return message.status === 'sent' || message.status === 'complete';
  return message.status === 'complete' || message.status === 'error';
}
