import { INPUT_LIMITS } from '@/lib/validation';

export const ONBOARDING_VOICE_ANSWER_MAX_LENGTH = INPUT_LIMITS.LONG_TEXT.max;

export function composeOnboardingVoiceDraft(existingText: string, transcript: string): string {
  const existing = existingText.trimEnd();
  if (!existing.trim()) return transcript;
  const joiner = existing.includes('\n') ? '\n\n' : ' ';
  return `${existing}${joiner}${transcript}`;
}

export function voiceAnswerAcceptance(text: string, maxLength = ONBOARDING_VOICE_ANSWER_MAX_LENGTH): {
  empty: boolean;
  overLimit: boolean;
  canAccept: boolean;
  count: number;
} {
  const empty = text.trim().length === 0;
  const overLimit = text.length > maxLength;
  return {
    empty,
    overLimit,
    canAccept: !empty && !overLimit,
    count: text.length,
  };
}

export function voiceAnswerCountLabel(count: number, maxLength = ONBOARDING_VOICE_ANSWER_MAX_LENGTH): string {
  return `${count} / ${maxLength}`;
}
