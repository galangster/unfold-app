import {
  PURCHASE_CONFIRMATION_AUTO_TRIAL_TEXT,
  PURCHASE_CONFIRMATION_SETUP_TEXT,
  getPurchaseConfirmationCopy,
} from '../purchase-confirmation-copy';

const TODAY_SETUP_TEXT =
  "Welcome to Unfold Premium. Now let's shape a devotional journey around where you are right now.";

const AUTO_TRIAL_FORBIDDEN = /shape|question|answer|tell us|\$|day trial/i;

describe('G9 purchase confirmation copy', () => {
  it('keeps the setup constant equal to today\'s onboarding string', () => {
    expect(PURCHASE_CONFIRMATION_SETUP_TEXT).toBe(TODAY_SETUP_TEXT);
    expect(getPurchaseConfirmationCopy('setup')).toEqual({
      text: TODAY_SETUP_TEXT,
      highlightWord: 'Unfold',
    });
  });

  it('uses an auto-trial constant that fails the S3 regex', () => {
    expect(PURCHASE_CONFIRMATION_AUTO_TRIAL_TEXT).not.toMatch(AUTO_TRIAL_FORBIDDEN);
    expect(getPurchaseConfirmationCopy('auto_trial')).toEqual({
      text: PURCHASE_CONFIRMATION_AUTO_TRIAL_TEXT,
      highlightWord: 'Unfold',
    });
  });
});
