/**
 * Save-to-journal helpers for companion replies. Pure; the Ask screen owns
 * the store writes.
 */
const MAX_QUESTION_LENGTH = 120;

export function buildCompanionJournalBlock({
  question,
  reply,
}: {
  question: string;
  reply: string;
}): string {
  const trimmedQuestion = question.trim();
  const questionExcerpt = trimmedQuestion.length > MAX_QUESTION_LENGTH
    ? `${trimmedQuestion.slice(0, MAX_QUESTION_LENGTH).trimEnd()}…`
    : trimmedQuestion;

  const header = questionExcerpt
    ? `From the companion, in reply to "${questionExcerpt}":`
    : 'From the companion:';
  return `${header}\n${reply.trim()}`;
}

export function appendJournalContent(existing: string, block: string): string {
  if (!existing.trim()) return block;
  return `${existing.trimEnd()}\n\n${block}`;
}

export function isReplyAlreadyInJournal(existing: string, reply: string): boolean {
  const trimmedReply = reply.trim();
  return trimmedReply.length > 0 && existing.includes(trimmedReply);
}
