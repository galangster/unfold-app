import {
  reconcileGenerationResultIdentity,
  type GeneratedDayWithIdentity,
  type GenerationResultPayload,
} from './generation-reconciliation';

export type OnboardingGenerationResult = Omit<GenerationResultPayload, 'devotionalDay' | 'devotionalId'> & {
  devotionalDay: GeneratedDayWithIdentity;
  devotionalId: string;
};

export type OnboardingSubmitResult =
  | string
  | {
      jobId: string;
      devotionalId?: string | null;
    };

export type OnboardingGenerationJobLike = {
  status?: string;
  devotionalId?: string | null;
  dayNumber?: number | null;
  result?: GenerationResultPayload | null;
};

export function buildOnboardingSampleDevotionalId(deviceId: string): string {
  return `onboarding-sample-anon_${deviceId}`;
}

export function normalizeOnboardingSubmitResult(
  result: OnboardingSubmitResult,
): { jobId: string; devotionalId: string | null } {
  if (typeof result === 'string') {
    return { jobId: result, devotionalId: null };
  }

  return {
    jobId: result.jobId,
    devotionalId: result.devotionalId ?? null,
  };
}

export function normalizeOnboardingGenerationJobResult(
  job: OnboardingGenerationJobLike,
  fallbackDevotionalId?: string | null,
): OnboardingGenerationResult | null {
  if (job.status !== 'complete' || !job.result?.devotionalDay) {
    return null;
  }

  const fallbackDayNumber =
    typeof job.dayNumber === 'number' && Number.isInteger(job.dayNumber) && job.dayNumber > 0
      ? job.dayNumber
      : 1;

  const devotionalId = job.result.devotionalId ?? job.devotionalId ?? fallbackDevotionalId ?? null;
  if (!devotionalId) {
    return null;
  }

  return reconcileGenerationResultIdentity(
    job.result,
    devotionalId,
    fallbackDayNumber,
  ) as OnboardingGenerationResult;
}
