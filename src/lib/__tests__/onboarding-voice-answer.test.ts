
import {
  composeOnboardingVoiceDraft,
  ONBOARDING_VOICE_ANSWER_MAX_LENGTH,
  voiceAnswerAcceptance,
  voiceAnswerCountLabel,
} from '@/lib/onboarding-voice-answer';

describe('onboarding voice answer draft rules', () => {
  it('keeps an empty existing answer as the transcript alone', () => {
    expect(composeOnboardingVoiceDraft('   ', 'I am a parent.')).toBe('I am a parent.');
  });

  it('includes existing typed text when appending a transcript', () => {
    expect(composeOnboardingVoiceDraft('I am a dad.', 'I work on a farm.')).toBe('I am a dad. I work on a farm.');
    expect(composeOnboardingVoiceDraft('Line one\nLine two', 'and more')).toBe('Line one\nLine two\n\nand more');
  });

  it('never silently truncates an over-limit draft', () => {
    const transcript = 'x'.repeat(ONBOARDING_VOICE_ANSWER_MAX_LENGTH + 40);
    const draft = composeOnboardingVoiceDraft('Hello', transcript);
    expect(draft.endsWith(transcript)).toBe(true);
    expect(draft.length).toBeGreaterThan(ONBOARDING_VOICE_ANSWER_MAX_LENGTH);
    expect(voiceAnswerAcceptance(draft)).toMatchObject({ overLimit: true, canAccept: false, count: draft.length });
    expect(voiceAnswerCountLabel(draft.length)).toBe(`${draft.length} / ${ONBOARDING_VOICE_ANSWER_MAX_LENGTH}`);
  });

  it('rejects empty or whitespace answers', () => {
    expect(voiceAnswerAcceptance('')).toMatchObject({ empty: true, canAccept: false });
    expect(voiceAnswerAcceptance('   \n\t')).toMatchObject({ empty: true, canAccept: false });
  });

  it('accepts a non-empty in-limit answer', () => {
    expect(voiceAnswerAcceptance('I want quieter mornings.')).toMatchObject({
      empty: false,
      overLimit: false,
      canAccept: true,
    });
  });
});

