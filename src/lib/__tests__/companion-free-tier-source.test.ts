import { readFileSync } from 'fs';
import { join } from 'path';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

// Free-tier contradiction (0706 QA observation, resolved 0707): the screen
// promises "N of 5 free messages left today" — sends must be governed by the
// daily quota, not the all-or-nothing creation gate that paywalls every
// non-premium user before their first message. The creation gate belongs to
// creation actions (devotional generation), not companion sends.
describe('companion free tier source contract', () => {
  const source = readSource('src/app/(tabs)/(ask)/index.tsx');

  it('does not route companion sends through the creation gate', () => {
    expect(source).not.toContain('useCreationGate');
    expect(source).not.toContain('gate()');
  });

  it('keeps the daily-quota guard and its paywall-on-exhaustion path', () => {
    expect(source).toContain('if (!isPremium && !canSendCompanionMessage())');
    expect(source).toContain('setShowPremiumSheet(true)');
    expect(source).toContain('incrementCompanionDailyCount()');
  });

  it('still shows the free-quota indicator it now honors', () => {
    expect(source).toContain('free messages left today');
  });
});
