/**
 * Regenerate-reply and thumbs-down reason helpers for the companion chat.
 * Pure: the hook (use-companion-chat.ts) and the action row
 * (CompanionActions.tsx) consume these.
 */
import type { CompanionMessage } from './companion-chat-store';

/**
 * Thumbs-down reasons, in display order. `id` is what the store, the
 * feedback route, and the regenerate request record; the backend maps it to
 * prompt wording (lib/companion-prompt.ts REGENERATE_REASON_HINTS), so no
 * prompt text ships in the app.
 */
export const FEEDBACK_REASONS = [
  { id: 'not-what-i-asked', label: 'Not what I asked' },
  { id: 'too-long', label: 'Too long' },
  { id: 'more-scripture', label: 'Needed more Scripture' },
  { id: 'tone', label: 'Tone felt off' },
] as const;

export type FeedbackReasonId = (typeof FEEDBACK_REASONS)[number]['id'];

/**
 * The only message a reader can regenerate: the last one, when it is a
 * finished companion reply (complete or error) with a user message before it.
 */
export function pickRegenerateTarget(messages: CompanionMessage[]): {
  userMessage: CompanionMessage;
  companionMessage: CompanionMessage;
} | null {
  const companionMessage = messages[messages.length - 1];
  if (
    !companionMessage ||
    companionMessage.role !== 'companion' ||
    (companionMessage.status !== 'complete' && companionMessage.status !== 'error')
  ) {
    return null;
  }

  for (let index = messages.length - 2; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      return { userMessage: messages[index], companionMessage };
    }
  }

  return null;
}
