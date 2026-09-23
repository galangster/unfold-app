export const LIFE_CONTEXT_MAX_LENGTH = 6000;
export const LIFE_CONTEXT_QUESTION = "What's happening in your life?";
export const LIFE_CONTEXT_INVITATION = "Talk about what's going on, what you're learning, or what you'd like to explore. Share as much or as little as you want.";

export function canSaveLifeContext(text: string): boolean {
  return text.length <= LIFE_CONTEXT_MAX_LENGTH;
}
