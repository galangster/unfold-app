type FreeWritePlaceholderInput = {
  reflectionQuestions?: string[];
};

const DEFAULT_FREE_WRITE_PLACEHOLDER =
  "Write whatever stood out from today's reading — a line, a question, a prayer, or something you want to remember.";

/**
 * Free Write should feel spacious, not like a repeated guided prompt.
 * Keep this intentionally broad even when the day has specific reflection questions.
 */
export function buildFreeWritePlaceholder(_input?: FreeWritePlaceholderInput): string {
  return DEFAULT_FREE_WRITE_PLACEHOLDER;
}
