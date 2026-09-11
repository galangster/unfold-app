import * as fs from 'fs';
import * as path from 'path';
import { buildAutoTrialUserContext, buildInitialArcUserContext } from '../generation-api';
import type { AutoTrialIntentV1 } from '../auto-trial-intent';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'auto-trial-submit-v1.json');
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as {
  version: 1;
  intentId: string;
  trialDays: 3;
  purchasedAt: string;
  expiresAt: string;
  purchaseLocalDate: string;
  timeZone: string;
  platform: 'ios';
  entry: 'onboarding';
  surface: 'onboarding_paywall';
  source: 'purchase';
  isSandbox: boolean;
  simulated: boolean;
};

const user = {
  name: 'Nick',
  aboutMe: 'Building Unfold',
  currentSituation: 'Launch week is heavy',
  emotionalState: 'anxious',
  spiritualSeeking: 'More peace',
  bibleFrequency: 'daily',
  aspiration: 'I want a quieter morning',
  devotionalLength: 14,
};

const intent = {
  version: 1,
  intentId: fixture.intentId,
  deviceId: 'device-1',
  entry: fixture.entry,
  surface: fixture.surface,
  source: fixture.source,
  simulated: fixture.simulated,
  trialDays: fixture.trialDays,
  purchasedAt: fixture.purchasedAt,
  expiresAt: fixture.expiresAt,
  purchaseLocalDate: fixture.purchaseLocalDate,
  timeZone: fixture.timeZone,
  platform: 'ios',
  isSandbox: fixture.isSandbox,
  productIdentifier: 'unfold_premium_yearly',
  switchEnabledAtPurchase: true,
  switchFetchedAt: fixture.purchasedAt,
  requestId: '11111111-2222-4333-8444-555555555555',
  status: 'purchased',
  jobId: null,
  devotionalId: null,
  createdAt: fixture.purchasedAt,
  updatedAt: fixture.purchasedAt,
  submittedAt: null,
  landedAt: null,
  revealedAt: null,
  completedAt: null,
  dismissedAt: null,
  failedAt: null,
  failureCode: null,
  abandonedAt: null,
  abandonReason: null,
} as AutoTrialIntentV1;

describe('X1 auto-trial userContext builder', () => {
  it('produces the fixture autoTrial body and the same body on resubmit (T7)', () => {
    const first = buildAutoTrialUserContext(user, intent);
    const second = buildAutoTrialUserContext(user, intent);
    expect(first.autoTrial).toEqual(fixture);
    expect(second.autoTrial).toEqual(first.autoTrial);
    expect(first.devotionalLength).toBe(intent.trialDays);
    expect(first.bibleFrequency).toBe('daily');
    expect(first.aspiration).toBe('I want a quieter morning');
    expect(JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(first.autoTrial);
  });

  it('sends bibleFrequency and aspiration on the shared initial_arc builder', () => {
    const context = buildInitialArcUserContext(user);
    expect(context.bibleFrequency).toBe('daily');
    expect(context.aspiration).toBe('I want a quieter morning');
  });
});
