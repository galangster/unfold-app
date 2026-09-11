export const PURCHASE_CONFIRMATION_SETUP_TEXT =
  "Welcome to Unfold Premium. Now let's shape a devotional journey around where you are right now.";

export const PURCHASE_CONFIRMATION_AUTO_TRIAL_TEXT =
  "Welcome to Unfold Premium. Your first series starts from what you've already shared.";

const HIGHLIGHT_WORD = 'Unfold' as const;

export function getPurchaseConfirmationCopy(mode: 'auto_trial' | 'setup'): {
  text: string;
  highlightWord: 'Unfold';
} {
  return {
    text: mode === 'auto_trial'
      ? PURCHASE_CONFIRMATION_AUTO_TRIAL_TEXT
      : PURCHASE_CONFIRMATION_SETUP_TEXT,
    highlightWord: HIGHLIGHT_WORD,
  };
}
