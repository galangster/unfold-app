import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { DarkColors } from '@/constants/colors';
import { CompletionCelebration } from '@/components/CompletionCelebration';
import { OnboardingCelebration } from '../OnboardingCelebration';
import { flushUnfoldStorePersistAsync } from '@/lib/store';
import { persistOnboardingFirstReading, ONBOARDING_FIRST_READING_SAVED_MESSAGE } from '@/lib/onboarding-first-reading';

jest.mock('@/components/CompletionCelebration', () => ({ CompletionCelebration: () => null }));
jest.mock('@/lib/store', () => ({ flushUnfoldStorePersistAsync: jest.fn() }));
jest.mock('@/lib/onboarding-first-reading', () => ({
  persistOnboardingFirstReading: jest.fn(),
  ONBOARDING_FIRST_READING_SAVED_MESSAGE: 'Saved to your bookshelf. Come back to this reading anytime.',
  ONBOARDING_FIRST_READING_COMPLETE_MESSAGE: 'Your first devotional, complete.',
}));
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn() } }));

describe('first reading saved confirmation', () => {
  let tree: ReactTestRenderer;
  const persist = jest.mocked(persistOnboardingFirstReading);
  const flush = jest.mocked(flushUnfoldStorePersistAsync);

  beforeEach(() => { jest.clearAllMocks(); });
  afterEach(() => { if (tree) act(() => tree.unmount()); });

  it('waits for the durable write before saying the reading is saved', async () => {
    let finish!: (wrote: boolean) => void;
    persist.mockReturnValue(true);
    flush.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const continueOnboarding = jest.fn();
    await act(async () => {
      tree = create(<OnboardingCelebration colors={DarkColors} onContinue={continueOnboarding} firstReadingId="first" firstReadingDay={{ bodyText: 'Original reading' }} />);
    });
    expect(tree.root.findByType(CompletionCelebration).props.detail).toBeUndefined();
    await act(async () => { finish(true); });
    const celebration = tree.root.findByType(CompletionCelebration);
    expect(celebration.props.detail).toBe(ONBOARDING_FIRST_READING_SAVED_MESSAGE);
    act(() => celebration.props.onDismiss());
    expect(continueOnboarding).toHaveBeenCalledTimes(1);
  });

  it('does not promise a saved reading when storage fails', async () => {
    persist.mockReturnValue(true);
    flush.mockRejectedValue(new Error('Storage unavailable'));
    await act(async () => {
      tree = create(<OnboardingCelebration colors={DarkColors} onContinue={jest.fn()} firstReadingId="first" />);
    });
    expect(tree.root.findByType(CompletionCelebration).props.detail).toBeUndefined();
  });

  it('does not promise that an unavailable reading was saved', async () => {
    persist.mockReturnValue(false);
    await act(async () => {
      tree = create(<OnboardingCelebration colors={DarkColors} onContinue={jest.fn()} firstReadingId="missing" />);
    });
    expect(flush).not.toHaveBeenCalled();
    expect(tree.root.findByType(CompletionCelebration).props.detail).toBeUndefined();
  });
});
