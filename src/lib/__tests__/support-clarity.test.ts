import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UserProfile } from '../store';
import {
  COMPANION_EMPTY_STATE_AI_NOTE,
  COMPANION_IS_AI_BODY,
  COMPANION_NAME_LATER_HINT,
  GENERATING_CAN_CLOSE_COPY,
  GENERATING_WRITING_CONTINUES_COPY,
  PERSONAL_CONTEXT_FUTURE_DAYS_COPY,
  PERSONAL_CONTEXT_PENDING_SYNC_COPY,
  applyPersonalContextDraft,
  createPersonalContextDraft,
  personalContextDraftHasChanges,
  isReadableCurrentSeries,
  resolveCompanionDisplayName,
  resolveCompanionNameToPersist,
  resolveCreateNewDuringPendingInitial,
  resolveGeneratingCloseCopy,
  resolveGeneratingGoHomeLabel,
  resolvePendingInitialArcResume,
  savePersonalContextDraft,
} from '../support-clarity';

const srcRoot = join(__dirname, '../..');

function readSrc(rel: string): string {
  return readFileSync(join(srcRoot, rel), 'utf8');
}

const user = {
  aboutMe: 'I want to grow in patience.',
  companionName: 'Grace',
} as UserProfile;

describe('companion naming', () => {
  it('treats Grace as a name, not a writing-style change', () => {
    expect(resolveCompanionNameToPersist('Grace')).toBe('Grace');
    expect(resolveCompanionNameToPersist('  ')).toBe('Grace');
    expect(resolveCompanionDisplayName('Grace', null)).toBe('Grace');
    expect(resolveCompanionDisplayName('Selah', 'Grace')).toBe('Selah');
    expect(resolveCompanionDisplayName(undefined, 'Selah')).toBe('Selah');
    expect(resolveCompanionDisplayName('', '')).toBeNull();
    expect(COMPANION_IS_AI_BODY).toContain("Companion is Unfold's AI");
    expect(COMPANION_IS_AI_BODY).toContain("doesn't change how your devotionals are written");
  });
});

describe('personal context draft', () => {
  it('commits locally on Save, then reports pending-sync when the network fails', async () => {
    const original = createPersonalContextDraft(user, 'Grace');
    const draft = { companionName: 'Grace', aboutMe: `${user.aboutMe} Also parenting.` };
    expect(personalContextDraftHasChanges(draft, original)).toBe(true);
    expect(applyPersonalContextDraft(draft).aboutMe).toContain('Also parenting.');

    const updateUser = jest.fn();
    const setCompanionName = jest.fn();
    const pending = await savePersonalContextDraft({
      draft,
      currentUser: user,
      sync: async () => {
        throw new Error('offline');
      },
      updateUser,
      setCompanionName,
    });
    expect(pending).toEqual({
      status: 'pending-sync',
      message: PERSONAL_CONTEXT_PENDING_SYNC_COPY,
    });
    expect(updateUser).toHaveBeenCalledWith({
      companionName: 'Grace',
      aboutMe: draft.aboutMe,
    });
    expect(setCompanionName).toHaveBeenCalledWith('Grace');

    const saved = await savePersonalContextDraft({
      draft,
      currentUser: user,
      sync: async () => undefined,
      updateUser,
      setCompanionName,
    });
    expect(saved).toEqual({ status: 'saved' });
  });
});

describe('pending first-series resume after a close', () => {
  const requestId = '11111111-1111-4111-8111-111111111111';

  it('offers a resume hero when the request survived and no readable series exists', () => {
    expect(isReadableCurrentSeries(null)).toBe(false);
    expect(isReadableCurrentSeries({ days: [] })).toBe(false);
    expect(resolvePendingInitialArcResume({
      inflight: null,
      requestId,
      generationSessionStatus: 'idle',
      hasReadableCurrentSeries: false,
    })).toBe('offer-resume');
    expect(resolveCreateNewDuringPendingInitial('offer-resume')).toBe('resume-existing');
  });

  it('offers a nonblocking resume when a readable series or sample already exists', () => {
    expect(isReadableCurrentSeries({ days: [{ dayNumber: 1 }] })).toBe(true);
    expect(resolvePendingInitialArcResume({
      inflight: null,
      requestId,
      generationSessionStatus: 'idle',
      hasReadableCurrentSeries: true,
    })).toBe('offer-nonblocking-resume');
    expect(resolveCreateNewDuringPendingInitial('offer-nonblocking-resume')).toBe('resume-existing');
  });

  it('still offers a resume hero after an archived real series when a new request is outstanding', () => {
    expect(resolvePendingInitialArcResume({
      inflight: null,
      requestId,
      generationSessionStatus: 'idle',
      hasReadableCurrentSeries: false,
    })).toBe('offer-resume');
  });

  it('does not force a loop after Go home, a live job, auto-trial purchase, or a finished request', () => {
    expect(resolvePendingInitialArcResume({
      inflight: { jobId: 'job-1', submittedAt: 1 },
      requestId,
      generationSessionStatus: 'running',
      hasReadableCurrentSeries: false,
    })).toBe('none');
    expect(resolvePendingInitialArcResume({
      inflight: null,
      requestId,
      generationSessionStatus: 'complete',
      hasReadableCurrentSeries: false,
    })).toBe('none');
    expect(resolvePendingInitialArcResume({
      inflight: null,
      requestId,
      generationSessionStatus: 'error',
      hasReadableCurrentSeries: false,
    })).toBe('none');
    expect(resolvePendingInitialArcResume({
      inflight: null,
      requestId: null,
      generationSessionStatus: 'idle',
      hasReadableCurrentSeries: false,
    })).toBe('none');
    expect(resolvePendingInitialArcResume({
      inflight: null,
      requestId,
      generationSessionStatus: 'idle',
      hasReadableCurrentSeries: false,
      autoTrialOwnsFlow: true,
    })).toBe('none');
    expect(resolveCreateNewDuringPendingInitial('none')).toBe('start-fresh');
  });
});

describe('copy is wired where the questions arise', () => {
  it('explains Companion on the naming card, empty state, and Profile editor', () => {
    const carousel = readSrc('components/onboarding/FeatureSummaryCarousel.tsx');
    const empty = readSrc('components/companion/CompanionEmptyState.tsx');
    const profile = readSrc('components/settings/PersonalContextSection.tsx');
    const settings = readSrc('components/settings/ProfileSettingsSections.tsx');
    expect(carousel).toContain('COMPANION_IS_AI_BODY');
    expect(carousel).toContain('COMPANION_NAME_LATER_HINT');
    expect(empty).toContain('COMPANION_EMPTY_STATE_AI_NOTE');
    expect(profile).toContain('PERSONAL_CONTEXT_FUTURE_DAYS_COPY');
    expect(settings).toContain('PersonalContextSection');
  });

  it('uses neutral close copy until a server job is accepted', () => {
    const generating = readSrc('app/generating.tsx');
    expect(generating).toContain('resolveGeneratingCloseCopy(pendingJobId != null)');
    expect(GENERATING_CAN_CLOSE_COPY).toBe(
      'You can close Unfold and come back when you are ready.',
    );
    expect(resolveGeneratingCloseCopy(false)).toBe(GENERATING_CAN_CLOSE_COPY);
    expect(resolveGeneratingCloseCopy(true)).toContain(GENERATING_WRITING_CONTINUES_COPY);
    expect(resolveGeneratingGoHomeLabel(false)).toBe('Go home');
    expect(resolveGeneratingGoHomeLabel(true)).toContain('keep writing');
  });

  it('keeps Today on a resume card instead of replacing into /generating', () => {
    const today = readSrc('app/(tabs)/(today)/index.tsx');
    const onboarding = readSrc('app/onboarding.tsx');
    const generating = readSrc('app/generating.tsx');
    const reading = readSrc('app/(tabs)/(today)/reading.tsx');
    expect(onboarding).toContain("if (mode === 'generated')");
    expect(onboarding).toContain('ensureInitialGenerationRequestId()');
    expect(onboarding).toContain('companionNameInputRef.current');
    expect(onboarding).toContain('resolveCompanionDisplayName(existingUser?.companionName, useUnfoldStore.getState().companionName)');
    expect(onboarding).toContain('const companionName = resolveCompanionNameToPersist(companionNameInputRef.current)');
    expect(today).toContain('resolvePendingInitialArcResume');
    expect(today).toContain("pendingInitialResume === 'offer-resume'");
    expect(today).toContain("pendingInitialResume === 'offer-nonblocking-resume'");
    expect(today).toContain("pathname: '/generating'");
    expect(today).not.toContain("pendingResume === 'resume-on-generating'");
    expect(today).toContain('handleResumePendingInitial');
    expect(today).toContain("resolveCreateNewDuringPendingInitial(pending) === 'resume-existing'");
    expect(today).toContain('clearInitialGenerationRequestId()');
    expect(today.slice(
      today.indexOf('const openNewSeriesDiscovery'),
      today.indexOf('const handleCreateNew'),
    )).not.toContain('clearInitialGenerationRequestId');
    expect(today.indexOf('clearInitialGenerationRequestId()')).toBeGreaterThan(
      today.indexOf('const handleDismissInflightSeriesFailure'),
    );
    expect(generating).toContain('if (!isGenerating && !error) return');
    expect(generating).toContain('clearInitialGenerationRequestId()');
    expect(reading).toContain('onOpenSamples={openSampleReadings}');
    expect(reading).toContain('const hidePractice = useCallback');
    expect(reading.slice(
      reading.indexOf('const hidePractice = useCallback'),
      reading.indexOf('const openPracticeBible'),
    )).not.toContain('setScripturePracticeReturn');
  });
});
