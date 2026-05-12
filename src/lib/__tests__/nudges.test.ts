import { evaluateNudges, type NudgeContext, type NudgeState } from '../nudges';

const baseContext: NudgeContext = {
  screen: 'home',
  isPremium: false,
  streakCurrent: 6,
  streakJustReset: false,
  totalReadingsCompleted: 7,
  hasUsedAudio: true,
  seriesJustCompleted: 'When You Can\'t See the Path',
};

const emptyNudgeState: NudgeState = {
  nudgeImpressions: [],
  nudgeShownThisSession: false,
  nudgeDismissals: [],
};

describe('evaluateNudges', () => {
  it('shows the journey-completion invitation only for a non-premium completed series on home', () => {
    expect(evaluateNudges(baseContext, emptyNudgeState)).toMatchObject({
      type: 'journey_completion',
      premiumFeature: 'series',
    });
  });

  it('suppresses the journey-completion invitation when premium access is not denied', () => {
    expect(evaluateNudges({ ...baseContext, isPremium: true }, emptyNudgeState)).toBeNull();
  });

  it('does not show the journey-completion invitation without a just-completed series', () => {
    expect(evaluateNudges({ ...baseContext, seriesJustCompleted: null }, emptyNudgeState)).toBeNull();
  });
});
